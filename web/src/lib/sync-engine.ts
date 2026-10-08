import { db, getPendingSyncRecords } from '../lib/dexie'
import { api } from '../lib/api'
import { uuid } from '../lib/uuid'
import { useSyncStore } from '../store/syncStore'

interface SyncPullTableRequest {
  since_version: number
}

interface SyncPullRequest {
  client_id: string
  tables: Record<string, SyncPullTableRequest>
}

interface SyncDelta<T> {
  created: T[]
  updated: T[]
  deleted: { id: number; uuid: string }[]
}

interface SyncPullResponse {
  changes: Record<string, SyncDelta<any>>
  server_version: number
}

interface SyncPushRequest {
  client_id: string
  changes: Record<string, any[]>
}

interface Conflict {
  table: string
  local: Record<string, unknown>
  remote: Record<string, unknown>
  conflict_type: 'update_update' | 'update_delete' | 'create_create'
}

interface SyncPushResponse {
  accepted: { table: string; id: number; uuid: string }[]
  conflicts: Conflict[]
}

export class SyncEngine {
  private client_id: string
  private syncInterval: number = 5 * 60 * 1000 // 5 分钟
  private intervalId: number | null = null
  private isSyncing: boolean = false

  constructor() {
    this.client_id = localStorage.getItem('sync_client_id') || uuid()
    localStorage.setItem('sync_client_id', this.client_id)
  }

  /**
   * 启动自动同步（5 分钟轮询）
   */
  startAutoSync() {
    if (this.intervalId) return
    this.intervalId = window.setInterval(() => this.sync(), this.syncInterval)
  }

  /**
   * 停止自动同步
   */
  stopAutoSync() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /**
   * 手动触发全量同步
   */
  async sync() {
    if (this.isSyncing) return
    this.isSyncing = true

    const syncStore = useSyncStore.getState()
    syncStore.setStatus('syncing')

    try {
      // 1. 推送本地变更
      await this.push()

      // 2. 拉取远程变更
      await this.pull()

      // 3. 更新待同步计数
      await this.updatePendingCount()

      // 4. 更新同步状态
      syncStore.setLastSyncedAt(Date.now())
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步失败'
      syncStore.setLastError(message)
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * 增量拉取
   */
  async pull() {
    const localVersions = await this.getLocalVersions()

    const request: SyncPullRequest = {
      client_id: this.client_id,
      tables: localVersions,
    }

    const response = await api.post<SyncPullResponse>('/sync/pull', request)

    // 写入 IndexedDB
    await this.applyChanges(response.changes)
  }

  /**
   * 批量推送
   */
  async push() {
    const pendingChanges = await this.getPendingChanges()

    if (this.isEmpty(pendingChanges)) return

    const request: SyncPushRequest = {
      client_id: this.client_id,
      changes: pendingChanges,
    }

    const response = await api.post<SyncPushResponse>('/sync/push', request)

    // 处理接受和冲突
    await this.markAccepted(response.accepted)
    await this.handleConflicts(response.conflicts)
  }

  /**
   * 获取本地版本号
   */
  private async getLocalVersions(): Promise<Record<string, SyncPullTableRequest>> {
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
          await dexieTable.put({
            ...record,
            _syncedAt: Date.now(),
            _pendingSync: false,
            _updatedAt: Date.now(),
            _deleted: false,
          })
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
  private async getPendingChanges(): Promise<Record<string, any[]>> {
    const gbRecords = await getPendingSyncRecords('gbRecords')
    const dailyRecords = await getPendingSyncRecords('dailyRecords')
    const persons = await getPendingSyncRecords('persons')

    return {
      gb_records: gbRecords,
      daily_records: dailyRecords,
      persons: persons,
    }
  }

  /**
   * 标记已接受的记录
   */
  private async markAccepted(accepted: SyncPushResponse['accepted']) {
    await db.transaction('rw', db.gbRecords, db.dailyRecords, db.persons, async () => {
      for (const item of accepted) {
        const table = this.getDexieTable(item.table)
        await table.update(item.id, { _pendingSync: false, _syncedAt: Date.now() })
      }
    })
  }

  /**
   * 处理冲突
   */
  private async handleConflicts(conflicts: Conflict[]) {
    if (conflicts.length === 0) {
      const syncStore = useSyncStore.getState()
      syncStore.setConflicts([])
      return
    }

    const syncStore = useSyncStore.getState()
    const syncConflicts = conflicts.map((c, idx) => ({
      id: `${c.table}-${(c.local.uuid as string) || idx}-${Date.now()}`,
      table: c.table,
      local: c.local,
      remote: c.remote,
      conflict_type: c.conflict_type,
      detected_at: Date.now(),
    }))
    syncStore.setConflicts(syncConflicts)

    console.warn('同步冲突:', conflicts)
  }

  /**
   * 更新待同步计数
   */
  private async updatePendingCount() {
    const gbCount = (await getPendingSyncRecords('gbRecords')).length
    const dailyCount = (await getPendingSyncRecords('dailyRecords')).length
    const personCount = (await getPendingSyncRecords('persons')).length

    const syncStore = useSyncStore.getState()
    syncStore.setPendingCount(gbCount + dailyCount + personCount)
  }

  /**
   * 检查变更是否为空
   */
  private isEmpty(changes: Record<string, any[]>): boolean {
    return Object.values(changes).every((arr) => arr.length === 0)
  }

  /**
   * 获取 Dexie 表
   */
  private getDexieTable(table: string) {
    switch (table) {
      case 'gb_records':
        return db.gbRecords
      case 'daily_records':
        return db.dailyRecords
      case 'persons':
        return db.persons
      default:
        throw new Error(`未知表: ${table}`)
    }
  }
}

export const syncEngine = new SyncEngine()

/**
 * 解决冲突：使用本地版本覆盖服务端
 */
export async function resolveConflictUseLocal(conflictId: string): Promise<void> {
  const syncStore = useSyncStore.getState()
  const conflict = syncStore.conflicts.find((c) => c.id === conflictId)
  if (!conflict) return

  const tableName = conflict.table
  const localData = { ...conflict.local, _pendingSync: true, _syncedAt: 0, _updatedAt: Date.now() }

  const dexieTable = getDexieTable(tableName)
  const localId = conflict.local.id as number
  if (localId) {
    await dexieTable.put(localData as never)
  }

  syncStore.removeConflict(conflictId)
  await syncEngine.push()
}

/**
 * 解决冲突：使用远程版本覆盖本地
 */
export async function resolveConflictUseRemote(conflictId: string): Promise<void> {
  const syncStore = useSyncStore.getState()
  const conflict = syncStore.conflicts.find((c) => c.id === conflictId)
  if (!conflict) return

  const tableName = conflict.table
  const remoteData = { ...conflict.remote, _pendingSync: false, _syncedAt: Date.now(), _updatedAt: Date.now(), _deleted: false }

  const dexieTable = getDexieTable(tableName)
  const remoteId = conflict.remote.id as number
  if (remoteId) {
    await dexieTable.put(remoteData as never)
  }

  syncStore.removeConflict(conflictId)
}

/**
 * 解决冲突：删除记录（两端均放弃）
 */
export async function resolveConflictDelete(conflictId: string): Promise<void> {
  const syncStore = useSyncStore.getState()
  const conflict = syncStore.conflicts.find((c) => c.id === conflictId)
  if (!conflict) return

  const tableName = conflict.table
  const dexieTable = getDexieTable(tableName)
  const localId = conflict.local.id as number
  if (localId) {
    await dexieTable.delete(localId)
  }

  syncStore.removeConflict(conflictId)
}

function getDexieTable(table: string) {
  switch (table) {
    case 'gb_records':
      return db.gbRecords
    case 'daily_records':
      return db.dailyRecords
    case 'persons':
      return db.persons
    default:
      throw new Error(`未知表: ${table}`)
  }
}

// 网络恢复时自动同步
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncEngine.sync()
  })
}
