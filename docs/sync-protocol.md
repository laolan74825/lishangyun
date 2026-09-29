# 同步协议设计文档

> **版本：** v1.0  
> **创建日期：** 2026-09-26  
> **状态：** 设计中  
> **关联需求：** F-11.1/2/9/14（数据管理模块）  
> **关联文档：** 数据管理功能实施计划.md v2.7

---

## 一、概述

### 1.1 目标

建立 IndexedDB ↔ PostgreSQL 的本地优先（local-first）同步框架，支持：

- **离线操作**：网络中断时本地暂存，恢复后自动同步
- **增量同步**：基于 `sync_version` 的增量拉取，避免全量传输
- **冲突处理**：检测并标记冲突，支持人工解决
- **实时协作**：礼簿收礼场景通过 WebSocket 实时推送
- **性能目标**：3000+ 记录同步耗时 <5 秒

### 1.2 同步策略

采用**混合方案**，根据场景选择不同同步机制：

```text
├── 现场协作（礼簿收礼）
│   ├── 机制：WebSocket 实时推送
│   ├── 延迟：<5s 可见
│   ├── 场景：多终端同时收礼，需即时同步
│   └── 已有基础：useGuestbookWebSocket hook
│
└── 家庭共享（日常记录/人员）
    ├── 机制：HTTP 增量同步 + 5 分钟轮询
    ├── 延迟：5-10s（轮询间隔）
    ├── 场景：多设备数据同步，非实时
    └── 基于 sync_version 增量拉取
```

### 1.3 同步范围

| 数据类型 | 同步方式 | 优先级 | 说明 |
|---------|---------|-------|------|
| `daily_record` | HTTP 增量 | P0 | 日常收支记录，含隐私标记 |
| `person` | HTTP 增量 | P0 | 人员档案，含关系标签 |
| `gb_record` | WebSocket + HTTP | P0 | 礼簿收礼记录，实时 + 增量双通道 |
| `guestbook` | HTTP 增量 | P1 | 礼簿元数据，低频变更 |
| `payment_account` | HTTP 增量 | P2 | 收款账户，低频变更 |
| `operation_log` | 仅服务端 | — | 审计日志，不参与客户端同步 |

---

## 二、数据模型

### 2.1 同步必需字段

所有参与同步的表需包含以下字段：

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `uuid` | UUID | 全局唯一标识，冲突检测关键 | `550e8400-e29b-41d4-a716-446655440000` |
| `sync_version` | INTEGER | 版本号，每次修改递增 1 | `42` |
| `is_deleted` | BOOLEAN | 软删除标记 | `true` |
| `deleted_at` | DATETIME | 删除时间戳 | `2026-09-26T10:30:00Z` |
| `updated_at` | DATETIME | 最后更新时间 | `2026-09-26T10:30:00Z` |

**已实现状态：**

| 表 | `uuid` | `sync_version` | `is_deleted` | `deleted_at` | `updated_at` |
|----|--------|----------------|--------------|--------------|--------------|
| `daily_record` | ✅ | ✅ | ✅ | ✅ | ❌ 需新增 |
| `person` | ✅ | ✅ | ✅ | ✅ | ❌ 需新增 |
| `gb_record` | ✅ | ❌ 需新增 | ✅ | ✅ | ❌ 需新增 |
| `guestbook` | ❌ 需新增 | ❌ 需新增 | ✅ | ✅ | ❌ 需新增 |
| `payment_account` | ❌ 需新增 | ❌ 需新增 | ✅ | ✅ | ❌ 需新增 |

**迁移计划：** 通过 Alembic 迁移补充缺失字段，为现有记录生成初始 `uuid` 和 `sync_version=0`。

### 2.2 Dexie.js Schema 升级

```typescript
// v1 schema（当前）
this.version(1).stores({
  gbRecords: '++id, guestbook_id, uuid, guest_name, record_time, _syncedAt, _pendingSync',
  dailyRecords: '++id, uuid, person_id, type, event_date, _syncedAt, _pendingSync',
  persons: '++id, name, phone, relation_tag, _syncedAt, _pendingSync',
})

// v2 schema（新增同步字段）
this.version(2).stores({
  gbRecords: '++id, guestbook_id, uuid, guest_name, record_time, _syncedAt, _pendingSync, _updatedAt, _deleted',
  dailyRecords: '++id, uuid, person_id, type, event_date, _syncedAt, _pendingSync, _updatedAt, _deleted',
  persons: '++id, uuid, name, phone, relation_tag, _syncedAt, _pendingSync, _updatedAt, _deleted',
})
  .upgrade(tx => {
    // 为现有记录补充同步字段
    tx.table('gbRecords').toCollection().modify(r => {
      if (!r.uuid) r.uuid = crypto.randomUUID()
      r._updatedAt = Date.now()
      r._deleted = false
    })
    tx.table('dailyRecords').toCollection().modify(r => {
      if (!r.uuid) r.uuid = crypto.randomUUID()
      r._updatedAt = Date.now()
      r._deleted = false
    })
    tx.table('persons').toCollection().modify(r => {
      if (!r.uuid) r.uuid = crypto.randomUUID()
      r._updatedAt = Date.now()
      r._deleted = false
    })
  })
```

---

## 三、同步协议

### 3.1 增量拉取（Pull）

客户端从服务端拉取自上次同步以来的变更。

**请求：**

```http
POST /api/sync/pull
Content-Type: application/json

{
  "client_id": "device-uuid-123",
  "tables": {
    "daily_records": { "since_version": 42 },
    "persons": { "since_version": 18 },
    "gb_records": { "since_version": 105 }
  }
}
```

**响应：**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "changes": {
    "daily_records": {
      "created": [
        {
          "id": 123,
          "uuid": "550e8400-...",
          "person_name": "张三",
          "amount": 50000,
          "sync_version": 43,
          "is_deleted": false,
          "updated_at": "2026-09-26T10:30:00Z"
        }
      ],
      "updated": [...],
      "deleted": [
        { "id": 45, "uuid": "660e8400-..." }
      ]
    },
    "persons": { ... },
    "gb_records": { ... }
  },
  "server_version": 150
}
```

**服务端逻辑：**

```python
# server/app/api/sync.py

@router.post("/pull")
async def sync_pull(
    request: SyncPullRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    result = {}
    max_version = 0
    
    for table_name, table_req in request.tables.items():
        model = get_model_by_name(table_name)
        since_version = table_req.since_version
        
        # 查询变更：sync_version > since_version OR is_deleted = true
        query = db.query(model).filter(
            model.owner_id == current_user.id,
            or_(
                model.sync_version > since_version,
                model.is_deleted == True
            )
        )
        
        changes = query.all()
        
        # 分离 created/updated/deleted
        created = [r for r in changes if r.sync_version == 1 and not r.is_deleted]
        updated = [r for r in changes if r.sync_version > 1 and not r.is_deleted]
        deleted = [{"id": r.id, "uuid": r.uuid} for r in changes if r.is_deleted]
        
        result[table_name] = {
            "created": created,
            "updated": updated,
            "deleted": deleted,
        }
        
        # 更新 max_version
        max_version = max(max_version, max((r.sync_version for r in changes), default=0))
    
    return {
        "changes": result,
        "server_version": max_version,
    }
```

### 3.2 批量推送（Push）

客户端将本地变更批量推送至服务端。

**请求：**

```http
POST /api/sync/push
Content-Type: application/json

{
  "client_id": "device-uuid-123",
  "changes": {
    "daily_records": [
      {
        "uuid": "550e8400-...",
        "person_name": "张三",
        "amount": 50000,
        "sync_version": 43,
        "is_deleted": false,
        "updated_at": "2026-09-26T10:30:00Z"
      }
    ],
    "persons": [...],
    "gb_records": [...]
  }
}
```

**响应：**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "accepted": [
    { "table": "daily_records", "id": 123, "uuid": "550e8400-..." }
  ],
  "conflicts": [
    {
      "table": "daily_records",
      "local": { "uuid": "660e8400-...", "amount": 60000, "sync_version": 44 },
      "remote": { "uuid": "660e8400-...", "amount": 50000, "sync_version": 43 },
      "conflict_type": "update_update"
    }
  ]
}
```

**服务端逻辑：**

```python
@router.post("/push")
async def sync_push(
    request: SyncPushRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    accepted = []
    conflicts = []
    
    for table_name, records in request.changes.items():
        model = get_model_by_name(table_name)
        
        for record in records:
            # 查找服务端记录
            existing = db.query(model).filter(
                model.owner_id == current_user.id,
                model.uuid == record.uuid
            ).first()
            
            if not existing:
                # 新建
                new_record = model(**record, owner_id=current_user.id)
                db.add(new_record)
                db.flush()
                accepted.append({"table": table_name, "id": new_record.id, "uuid": record.uuid})
            
            elif existing.sync_version < record.sync_version:
                # 更新（本地版本更新）
                for key, value in record.items():
                    if key not in ['id', 'uuid', 'owner_id']:
                        setattr(existing, key, value)
                existing.sync_version += 1
                accepted.append({"table": table_name, "id": existing.id, "uuid": record.uuid})
            
            elif existing.sync_version > record.sync_version:
                # 冲突：服务端版本更新
                conflicts.append({
                    "table": table_name,
                    "local": record,
                    "remote": existing.to_dict(),
                    "conflict_type": "update_update",
                })
            
            else:
                # 版本相同，比较 updated_at
                if existing.updated_at < record.updated_at:
                    # 本地更新，接受
                    for key, value in record.items():
                        if key not in ['id', 'uuid', 'owner_id']:
                            setattr(existing, key, value)
                    existing.sync_version += 1
                    accepted.append({"table": table_name, "id": existing.id, "uuid": record.uuid})
                else:
                    # 冲突
                    conflicts.append({
                        "table": table_name,
                        "local": record,
                        "remote": existing.to_dict(),
                        "conflict_type": "update_update",
                    })
    
    db.commit()
    return {"accepted": accepted, "conflicts": conflicts}
```

### 3.3 冲突类型与解决策略

| 冲突类型 | 场景 | 策略 | UI 处理 |
|---------|------|------|---------|
| `update_update` | 本地和远程都修改了同一记录 | 人工确认 | 展示两个版本，用户选择 |
| `update_delete` | 本地修改了记录，远程删除了 | 人工确认 | 展示被删除记录和修改后记录，用户选择恢复或确认删除 |
| `create_create` | 本地和远程都创建了相同 UUID 的记录 | 保留两条 | UUID 不同视为不同记录，由用户后续合并 |

**冲突解决流程：**

1. 客户端检测到冲突，将冲突记录标记为 `disputed` 状态
2. UI 展示冲突列表，用户逐个解决
3. 用户选择本地版本或远程版本
4. 客户端提交解决结果至服务端
5. 服务端更新记录，递增 `sync_version`

---

## 四、前端同步引擎

### 4.1 架构

```text
┌─────────────────────────────────────────────────────┐
│                    React Components                  │
│  (RecordsListPage, GuestbookDetailPage, etc.)        │
└────────────────┬────────────────────────────────────┘
                 │ useQuery / useMutation
                 ▼
┌─────────────────────────────────────────────────────┐
│              TanStack Query Cache                    │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│              Sync Engine (lib/sync-engine.ts)        │
│  - 增量拉取（pull）                                   │
│  - 批量推送（push）                                   │
│  - 冲突检测                                          │
│  - 离线队列管理                                       │
└────────────────┬────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
┌──────────────┐  ┌──────────────────┐
│  Dexie.js    │  │  HTTP API Client │
│ (IndexedDB)  │  │  (lib/api.ts)    │
└──────────────┘  └──────────────────┘
```

### 4.2 同步引擎核心逻辑

```typescript
// lib/sync-engine.ts

export class SyncEngine {
  private client_id: string
  private syncInterval: number = 5 * 60 * 1000 // 5 分钟
  private isSyncing: boolean = false
  
  constructor() {
    this.client_id = localStorage.getItem('sync_client_id') || crypto.randomUUID()
    localStorage.setItem('sync_client_id', this.client_id)
  }
  
  /**
   * 启动自动同步（5 分钟轮询）
   */
  startAutoSync() {
    setInterval(() => this.sync(), this.syncInterval)
  }
  
  /**
   * 手动触发全量同步
   */
  async sync() {
    if (this.isSyncing) return
    this.isSyncing = true
    
    try {
      // 1. 推送本地变更
      await this.push()
      
      // 2. 拉取远程变更
      await this.pull()
      
      // 3. 处理冲突
      await this.resolveConflicts()
      
      // 4. 更新同步状态
      syncStore.setState({ lastSyncedAt: Date.now(), status: 'synced' })
    } catch (error) {
      syncStore.setState({ status: 'error', lastError: error.message })
    } finally {
      this.isSyncing = false
    }
  }
  
  /**
   * 增量拉取
   */
  async pull() {
    const localVersions = await this.getLocalVersions()
    
    const response = await api.post<SyncPullResponse>('/sync/pull', {
      client_id: this.client_id,
      tables: localVersions,
    })
    
    // 写入 IndexedDB
    await this.applyChanges(response.changes)
  }
  
  /**
   * 批量推送
   */
  async push() {
    const pendingChanges = await this.getPendingChanges()
    
    if (pendingChanges.isEmpty()) return
    
    const response = await api.post<SyncPushResponse>('/sync/push', {
      client_id: this.client_id,
      changes: pendingChanges,
    })
    
    // 处理接受和冲突
    await this.markAccepted(response.accepted)
    await this.handleConflicts(response.conflicts)
  }
  
  /**
   * 获取本地版本号
   */
  private async getLocalVersions(): Promise<Record<string, { since_version: number }>> {
    const gbRecords = await db.gbRecords.orderBy('sync_version').reverse().first()
    const dailyRecords = await db.dailyRecords.orderBy('sync_version').reverse().first()
    const persons = await db.persons.orderBy('sync_version').reverse().first()
    
    return {
      gb_records: { since_version: gbRecords?.sync_version || 0 },
      daily_records: { since_version: dailyRecords?.sync_version || 0 },
      persons: { since_version: persons?.sync_version || 0 },
    }
  }
  
  /**
   * 应用远程变更到本地
   */
  private async applyChanges(changes: SyncPullResponse['changes']) {
    await db.transaction('rw', db.gbRecords, db.dailyRecords, db.persons, async () => {
      for (const [table, delta] of Object.entries(changes)) {
        const dexieTable = this.getDexieTable(table)
        
        // 创建/更新
        for (const record of [...delta.created, ...delta.updated]) {
          await dexieTable.put(record)
        }
        
        // 删除
        for (const deleted of delta.deleted) {
          await dexieTable.delete(deleted.id)
        }
      }
    })
  }
  
  /**
   * 获取待推送的本地变更
   */
  private async getPendingChanges(): Promise<SyncPushRequest['changes']> {
    const gbRecords = await db.gbRecords.where('_pendingSync').equals(1).toArray()
    const dailyRecords = await db.dailyRecords.where('_pendingSync').equals(1).toArray()
    const persons = await db.persons.where('_pendingSync').equals(1).toArray()
    
    return {
      gb_records: gbRecords,
      daily_records: dailyRecords,
      persons: persons,
    }
  }
}

export const syncEngine = new SyncEngine()
```

### 4.3 离线队列管理

```typescript
// 本地写入时标记待同步
async function saveLocalRecord(record: DailyRecord) {
  await db.dailyRecords.put({
    ...record,
    _pendingSync: 1,
    _updatedAt: Date.now(),
  })
}

// 网络恢复时自动推送
window.addEventListener('online', () => {
  syncEngine.sync()
})

// 推送成功后清除标记
async function markAccepted(accepted: SyncPushResponse['accepted']) {
  await db.transaction('rw', db.gbRecords, db.dailyRecords, db.persons, async () => {
    for (const item of accepted) {
      const table = getDexieTable(item.table)
      await table.update(item.id, { _pendingSync: 0 })
    }
  })
}
```

---

## 五、同步状态管理

### 5.1 Zustand Store

```typescript
// store/syncStore.ts

import { create } from 'zustand'

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict'

interface SyncState {
  status: SyncStatus
  lastSyncedAt: number | null
  lastError: string | null
  pendingCount: number
  conflictCount: number
  
  setStatus: (status: SyncStatus) => void
  setLastSyncedAt: (timestamp: number) => void
  setLastError: (error: string | null) => void
  setPendingCount: (count: number) => void
  setConflictCount: (count: number) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  lastSyncedAt: null,
  lastError: null,
  pendingCount: 0,
  conflictCount: 0,
  
  setStatus: (status) => set({ status }),
  setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp }),
  setLastError: (error) => set({ lastError: error }),
  setPendingCount: (count) => set({ pendingCount: count }),
  setConflictCount: (count) => set({ conflictCount: count }),
}))
```

### 5.2 SyncStatusBadge 组件

```tsx
// components/SyncStatusBadge.tsx

import { useSyncStore } from '../store/syncStore'

export default function SyncStatusBadge() {
  const { status, pendingCount, conflictCount, lastSyncedAt } = useSyncStore()
  
  const config = {
    idle: { label: '就绪', color: 'bg-gray-100 text-gray-600' },
    syncing: { label: '同步中', color: 'bg-info/20 text-info' },
    synced: { label: '已同步', color: 'bg-success-bg text-success-deep' },
    offline: { label: '离线', color: 'bg-warning-bg text-warning' },
    error: { label: '同步失败', color: 'bg-danger-bg text-danger' },
    conflict: { label: `${conflictCount} 个冲突`, color: 'bg-danger-bg text-danger' },
  }
  
  const { label, color } = config[status]
  
  return (
    <div className={`rounded-full px-3 py-1 text-xs font-medium ${color}`}>
      {label}
      {pendingCount > 0 && status !== 'conflict' && (
        <span className="ml-1">({pendingCount} 待同步)</span>
      )}
    </div>
  )
}
```

---

## 六、性能优化

### 6.1 批量操作

- **拉取**：单次请求最多拉取 1000 条记录，超出时分页
- **推送**：单次请求最多推送 500 条记录，超出时分批

### 6.2 索引优化

```typescript
// Dexie.js 索引
this.version(2).stores({
  dailyRecords: '++id, uuid, person_id, type, event_date, sync_version, _pendingSync, _updatedAt',
  // 为 sync_version 和 _pendingSync 建立索引，加速查询
})
```

### 6.3 增量同步

- 仅同步 `sync_version > since_version` 的记录
- 删除操作仅传递 `{ id, uuid }`，不传递完整记录

### 6.4 压缩

- 启用 HTTP gzip 压缩
- 大量数据时分页传输，避免单次请求过大

---

## 七、安全考虑

### 7.1 数据隔离

- 所有同步请求必须携带 JWT token
- 服务端严格过滤 `owner_id == current_user.id`
- 家庭共享场景下，额外过滤 `family_group_id`

### 7.2 隐私记录

- `is_private = true` 的记录仅同步至所有者其他设备
- 家庭共享时，隐私记录不参与共享同步

### 7.3 审计日志

- 所有同步操作写入 `operation_log`
- 记录 `action_type = 'SYNC'`，`target_table`，`target_id`，`client_id`

---

## 八、测试计划

### 8.1 单元测试

- 同步引擎核心逻辑（pull/push/conflict detection）
- Dexie.js 本地读写
- 离线队列管理

### 8.2 集成测试

- 端到端同步流程
- 冲突检测与解决
- 网络中断恢复

### 8.3 性能测试

- 3000+ 记录同步耗时 <5 秒
- 内存占用 <100MB
- CPU 占用 <30%

---

## 九、附录

### 9.1 术语表

| 术语 | 定义 |
|------|------|
| Local-first | 本地优先，数据先写入 IndexedDB，后台同步至服务端 |
| Incremental sync | 增量同步，仅传输变更部分 |
| Conflict | 冲突，本地和远程对同一记录有不同修改 |
| Pending sync | 待同步，本地变更尚未推送至服务端 |

### 9.2 参考资料

- [Dexie.js 文档](https://dexie.org/docs/)
- [TanStack Query 文档](https://tanstack.com/query/latest)
- [CRDTs 论文](https://crdt.tech/)
