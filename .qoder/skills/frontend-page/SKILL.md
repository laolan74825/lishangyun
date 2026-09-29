---
name: frontend-page
description: GiftRegistry frontend page development agent. Use when building React components, pages, Zustand stores, API client calls, TanStack Query hooks, Dexie.js offline storage, ECharts visualizations, WebSocket collaboration, or UI styling in web/src/. Covers all pages (login, register, lock screen, dashboard, collect, guestbook wizard, daily records, people, accounts, stats, settings, family, admin, notifications, authorization codes, security, merge wizard, terminal settings), responsive layout (mobile/tablet/desktop), design system tokens, keyboard shortcuts, notification bell, and PWA features. Enforces TypeScript strict mode, Tailwind-only styling with design tokens, amounts in cents, offline-first with IndexedDB, and pnpm package management.
---

# Frontend Page Agent — 随礼记账本

Develop and maintain the React frontend for GiftRegistry. All work lives under `web/src/`.

> **状态标注**：`[已实现]` = 代码已存在可用；`[待实现]` = 需求已定义但代码尚未开发。
> 新增功能时，先将 `[待实现]` 的依赖/文件/路由落地，再写业务代码。

## Tech Stack

**已实现（package.json 已有）：**

- React ^19.1, TypeScript ^7.0.2 (strict), Vite ^6.3, Tailwind CSS 4.1, Zustand 5
- Routing: react-router-dom v7 (BrowserRouter + Routes)
- Utilities: dayjs, vite-plugin-pwa ^0.21
- Package manager: **pnpm** (not npm/yarn)
- HTTP client: custom `api` wrapper around `fetch` (see `lib/api.ts`)

**待实现（需求目标，需安装）：**

- TanStack Router 1.x (compile-time type安全路由，替换 react-router-dom)
- TanStack Query 5.x (server state cache, retry, optimistic update)
- Dexie.js 4.x (IndexedDB wrapper, offline-first local data layer)
- ECharts 5.x (charts: monthly trend, event distribution, ranking)
- SheetJS / xlsx (Excel/CSV export)
- WebSocket (礼簿协作实时同步; native `WebSocket` API)
- vite-plugin-pwa 升级至 1.0+

## Hard Constraints

1. **TypeScript strict** — No `any` escapes. All API responses must have type definitions in `types/index.ts`. `[已实现]`
2. **Tailwind only** — All styling via Tailwind utility classes + custom design tokens. No inline `style={}` except for dynamic values. No separate CSS files beyond `styles/index.css`. `[已实现]`
3. **Amounts in cents** — All money fields are integers (unit: 分). Display with `(amount / 100).toFixed(2)`. Parse input with `Math.round(parseFloat(value) * 100)`. `[已实现]`
4. **Design tokens** — Use theme tokens (`bg-primary`, `text-ink`, `rounded-card`, `shadow-card`, etc.) from `styles/index.css`. Never hardcode color values like `#E07B3A` — use `bg-primary` instead. `[已实现]`
5. **State layering** — Local UI state → `useState`. Server data cache → TanStack Query `[待实现，当前用裸 useEffect+fetch]`. Cross-component/session state → Zustand `appStore`. Offline data → Dexie.js (IndexedDB) `[待实现]`. Auth/token → `localStorage` via `lib/auth.ts`.
6. **Responsive breakpoints** — Mobile-first. `< 1280px` = mobile/tablet layout (bottom tab bar 64px). `≥ 1280px` (`xl:`) = desktop layout (top nav 64px + sidebar 280px). `[已实现]`
7. **Offline-first** — 关键数据先写 IndexedDB（Dexie.js），后台同步至服务端。使用 `syncStatus` from store 显示连接状态。离线时 UI 不阻塞操作。`[待实现]`
8. **WebSocket realtime** — 礼簿收礼页通过 WebSocket 实时推送新记录至所有协作终端。使用 `useGuestbookWebSocket(guestbookId)` hook 管理连接。`[待实现]`
9. **Keyboard shortcuts** — 桌面端收礼页支持快捷键（Enter=提交, Tab=切换字段, 1/2/3=收款方式, Ctrl+N=新建, Ctrl+F=搜索, Esc=关闭/返回）。对账页支持 Space=勾选, Ctrl+A=全选。`[待实现]`
10. **Accessibility** — Touch targets ≥ 48px。Font sizes ≥ 16px for body text。Amount display ≥ 32px (use `text-amount` utility class for 40px)。`[已实现]`
11. **Notification bell** — 顶部导航右侧通知铃铛显示未读数角标，下拉列表展示最近通知（5 种类型：approval_approved / approval_rejected / approval_expired / family_member_joined / merge_suggested）。`[待实现]`
12. **Lock screen** — 全局覆盖层，背景模糊当前页面，密码解锁。触发条件：无操作超时 / 手动锁定 / 其他终端活跃。`[待实现]`

## Development Flow

```
Requirement → Identify affected pages/components → Update types if needed → Build UI with Tailwind tokens → Wire data fetching (TanStack Query 或 API client) → Add offline support (Dexie.js) if needed → Test responsive + keyboard → Test in browser
```

## Code Patterns

### Page Component — 当前模式（裸 fetch + useState）

```tsx
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import type { SomeType } from '../types'
import { fetchSomething, updateSomething } from '../lib/api-client'

export default function SomePage() {
  const { id } = useParams<{ id: string }>()
  const { toast, showToast } = useToast()
  const [data, setData] = useState<SomeType | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    fetchSomething(Number(id)).then((res) => {
      setData(res)
      setLoading(false)
    })
  }, [id])

  const handleSave = async (input: Partial<SomeType>) => {
    await updateSomething(Number(id), input)
    showToast({ type: 'success', message: '保存成功' })
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-ink-secondary">加载中…</div>

  return (
    <PageScaffold title="页面标题">
      <div className="rounded-card bg-card p-5 shadow-card">
        <p className="text-amount">¥{((data?.amount ?? 0) / 100).toFixed(2)}</p>
      </div>
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
```

### Page Component — 目标模式（TanStack Query）[待实现]

```tsx
// 需先安装: pnpm add @tanstack/react-query
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
// ... 其余同上，但数据获取改为:
const { data, isLoading } = useQuery({
  queryKey: ['something', id],
  queryFn: () => fetchSomething(Number(id)),
  enabled: !!id,
})

const updateMutation = useMutation({
  mutationFn: (input: Partial<SomeType>) => updateSomething(Number(id), input),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['something', id] })
    showToast({ type: 'success', message: '保存成功' })
  },
})
```

### API Client Function [已实现]

```tsx
// In lib/api-client.ts
import type { SomeType } from '../types'
import { api } from './api'

export async function fetchSomething(id: number): Promise<SomeType> {
  return api.get<SomeType>(`/some-endpoint/${id}`)
}

export async function listSomeThings(page: number = 1, pageSize: number = 20): Promise<{ items: SomeType[]; total: number }> {
  return api.get<{ items: SomeType[]; total: number }>(`/some-endpoint/?page=${page}&page_size=${pageSize}`)
}

export async function createSomething(input: Omit<SomeType, 'id' | 'created_at'>): Promise<number> {
  const res = await api.post<{ id: number }>('/some-endpoint/', input)
  return res.id
}
```

> **分页响应**：当前 api-client 直接返回数据对象。目标分页信封为 `{ items: T[], pagination: { page, page_size, total_count, total_pages } }`，对应 `PaginatedResponse<T>` 类型（待添加到 `types/index.ts`）。

### Dexie.js Offline Store [待实现]

```tsx
// 需先安装: pnpm add dexie
// In lib/dexie.ts
import Dexie, { type Table } from 'dexie'
import type { GbRecord, DailyRecord, Person } from '../types'

export class GiftRegistryDB extends Dexie {
  gbRecords!: Table<GbRecord & { _syncedAt?: number }>
  dailyRecords!: Table<DailyRecord & { _syncedAt?: number }>
  persons!: Table<Person & { _syncedAt?: number }>

  constructor() {
    super('GiftRegistryDB')
    this.version(1).stores({
      gbRecords: 'id, guestbook_id, uuid, guest_name, record_time, _syncedAt',
      dailyRecords: 'id, person_id, type, event_date, _syncedAt',
      persons: 'id, name, phone, relation_tag, _syncedAt',
    })
  }
}

export const db = new GiftRegistryDB()

// 写入本地 + 标记待同步
export async function saveLocalRecord(record: GbRecord) {
  await db.gbRecords.put({ ...record, _syncedAt: 0 })
}
```

### WebSocket Hook (礼簿协作) [待实现]

```tsx
// In hooks/useWebSocket.ts
import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../store/appStore'

export function useGuestbookWebSocket(guestbookId: number | undefined) {
  const wsRef = useRef<WebSocket | null>(null)
  const addRecord = useAppStore((s) => s.appendGbRecord)

  useEffect(() => {
    if (!guestbookId) return
    const token = localStorage.getItem('gr.access_token')
    const ws = new WebSocket(`ws://${location.host}/api/ws/guestbooks/${guestbookId}?token=${token}`)

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'new_record') {
        addRecord(msg.data)
      }
    }

    wsRef.current = ws
    return () => ws.close()
  }, [guestbookId])

  const send = useCallback((data: object) => {
    wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify(data))
  }, [])

  return { send }
}
```

### Zustand Store Slice [已实现]

```tsx
// Extend appStore.ts interface
interface AppState {
  // ... existing fields
  newData: SomeType[]
  setNewData: (data: SomeType[]) => void
}

export const useAppStore = create<AppState>((set) => ({
  // ... existing state
  newData: [],
  setNewData: (newData) => set({ newData }),
}))
```

### ECharts Wrapper [待实现]

```tsx
// 需先安装: pnpm add echarts
// In components/charts/MonthlyTrendChart.tsx
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

interface Props {
  data: { month: string; received: number; sent: number }[]
}

export default function MonthlyTrendChart({ data }: Props) {
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartRef.current) return
    const chart = echarts.init(chartRef.current)
    chart.setOption({
      color: ['#40916C', '#E07B3A'],
      xAxis: { type: 'category', data: data.map(d => d.month) },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `¥${(v / 100).toFixed(0)}` } },
      series: [
        { name: '收到', type: 'line', data: data.map(d => d.received) },
        { name: '送出', type: 'line', data: data.map(d => d.sent) },
      ],
    })
    return () => chart.dispose()
  }, [data])

  return <div ref={chartRef} className="h-80 w-full" />
}
```

### Type Definition [已实现]

```tsx
// In types/index.ts
export interface SomeType {
  id?: number
  name: string
  amount: number  // cents (分)
  created_at: string
}

// 分页响应信封 [待实现 — 需添加到 types/index.ts]
export interface PaginatedResponse<T> {
  items: T[]
  pagination: {
    page: number
    page_size: number
    total_count: number
    total_pages: number
  }
}
```

## Key Types (需求目标，部分待代码同步)

> 以下类型定义与需求文档对齐。标注 `[待同步]` 的表示 `types/index.ts` 中尚未更新。

```tsx
// 礼簿三态生命周期 [待同步 — 当前只有 '收礼中' | '已完成']
export type GuestbookStatus = '收礼中' | '收尾中' | '已归档'

// 对账状态（含待核实）[待同步 — 当前只有 'unchecked' | 'checked']
export type CheckStatus = 'unchecked' | 'checked' | 'disputed'

// 角色体系 [待同步 — 当前 auth.ts 为 'admin'|'editor'|'viewer']
export type UserRole = 'super_admin' | 'admin' | 'editor' | 'viewer' | 'auditor'

// 操作日志通用模式 [待同步 — 当前使用旧式 gb_record_id]
export interface OperationLog {
  id?: number
  owner_id: number
  guestbook_id?: number
  target_table: string    // 'gb_record' | 'daily_record' | 'person' | 'guestbook' | 'payment_account'
  target_id: number
  action_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'MERGE' | 'ARCHIVE' | 'APPROVE' | 'REJECT'
  before_data?: string
  after_data?: string
  operator_name?: string
  client_id?: string
  note?: string
  created_at: string
}
```

## Routing

> 路由使用 react-router-dom v7。`[待实现]` 路由需安装 TanStack Router 后迁移。

| Path | Component | Status | Notes |
|------|-----------|--------|-------|
| `/login` | LoginPage | ✅ | 登录（含锁定警告提示） |
| `/register` | RegisterPage | 🎯 | 注册（安全邮箱 + 密码强度条） |
| `/` | DashboardPage | ✅ | 首页仪表板（摘要卡片 + 礼簿网格） |
| `/records` | RecordsListPage | ✅ | 日常记录列表（送出去/收进来 Tab） |
| `/records/new` | RecordFormPage | ✅ | 新建日常记录 |
| `/guestbooks` | GuestbookListPage | ✅ | 礼簿列表（三态分组：收礼中/收尾中/已归档） |
| `/guestbooks/new` | GuestbookNewPage | ✅ | 礼簿新建（当前为简单表单，目标为 2 步向导） |
| `/guestbooks/:id` | GuestbookDetailPage | ✅ | 礼簿详情（4 Tab：记录/对账/统计/日志） |
| `/guestbooks/:id/collect` | CollectPage | ✅ | 现场收礼（单条+批量） |
| `/guestbooks/:id/terminal` | TerminalSettingsPage | 🎯 | 终端设置（默认账户、收银人、二维码） |
| `/accounts` | AccountsPage | ✅ | 收款账户管理（现金+微信，限额指示） |
| `/people` | PeoplePage | ✅ | 人员管理（搜索、关系标签筛选、卡片列表） |
| `/people/:id` | PersonDetailPage | 🎯 | 人员详情（档案+按宴请分组往来明细） |
| `/stats` | StatsPage | ✅ | 统计报表（年度汇总、月度趋势、事由分布） |
| `/settings` | SettingsPage | ✅ | 个人设置（基本信息、安全邮箱、锁定时间） |
| `/security` | SecurityPage | 🎯 | 安全模式（普通↔增强，助记词管理） |
| `/family` | FamilyPage | 🎯 | 家庭管理（创建/加入家庭组、成员管理、审批队列） |
| `/notifications` | NotificationsPage | 🎯 | 通知中心（5 种通知类型列表） |
| `/authz` | AuthorizationPage | 🎯 | 授权码管理（生成、绑定状态、撤销、操作日志） |
| `/merge/:id` | MergeWizardPage | 🎯 | 人员合并向导（4步：选择→映射→预览→确认） |
| `/import` | DataImportPage | 🎯 | 数据导入（Excel/CSV 上传、预览、校验、确认） |
| `/admin` | AdminDashboardPage | 🎯 | 管理后台仪表盘（仅 super_admin/admin） |
| `/admin/users` | AdminUsersPage | 🎯 | 用户管理（CRUD、禁用/启用、子管理员权限） |
| `/admin/audit` | AdminAuditPage | 🎯 | 审计日志（多维筛选、详情展开、导出） |
| `/admin/settings` | AdminSettingsPage | 🎯 | 系统配置（全局参数） |
| `/admin/announcements` | AdminAnnouncementsPage | 🎯 | 公告管理 |
| `/admin/recycle` | AdminRecyclePage | 🎯 | 回收站（软删除记录管理） |
| `/join` | PlaceholderPage | ✅ | 占位页（"该模块正在开发中"） |

✅ = 已实现（13 条），🎯 = 待实现（15 条）。所有受保护路由在 `<AppLayout />` + `ProtectedRoute` 内渲染。Admin 路由额外要求 `super_admin` 或 `admin` 角色。

## Key Components

### Layout & Navigation

| Component | Path | Status | Purpose |
|-----------|------|--------|---------|
| AppLayout | `components/layout/AppLayout.tsx` | ✅ | 响应式框架：MobileLayout (< xl) + DesktopLayout (≥ xl) |
| MobileBottomTabs | `components/layout/MobileBottomTabs.tsx` | 🎯 | 手机底部 Tab 栏（6 tabs：首页/明细/礼簿/人员/统计/设置） |
| DesktopSidebar | `components/layout/DesktopSidebar.tsx` | 🎯 | 桌面端侧边栏（快捷操作 + 最近访问 + 个人设置入口） |
| TopNavBar | `components/layout/TopNavBar.tsx` | 🎯 | 桌面端顶部导航（Logo + 导航链接 + 通知铃铛 + 用户菜单） |
| NotificationBell | `components/layout/NotificationBell.tsx` | 🎯 | 通知铃铛（未读角标 + 下拉通知列表） |
| AdminLayout | `components/layout/AdminLayout.tsx` | 🎯 | 管理后台独立导航框架 |
| LockScreen | `components/LockScreen.tsx` | 🎯 | 全局锁屏覆盖层（模糊背景 + 密码解锁） |

### Core Pages

| Component | Path | Status | Purpose |
|-----------|------|--------|---------|
| PageScaffold | `components/PageScaffold.tsx` | ✅ | 页面包装器：标题 + 描述 + actions 插槽 + children |
| Toast | `components/Toast.tsx` | ✅ | Toast 通知 + `useToast()` hook |
| Modal | `components/Modal.tsx` | ✅ | 通用模态弹窗 |
| ConfirmDialog | `components/ConfirmDialog.tsx` | 🎯 | 二次确认弹窗（删除、归档等危险操作） |

### Collect Page (现场收礼)

| Component | Path | Status | Purpose |
|-----------|------|--------|---------|
| NameAutocomplete | `components/NameAutocomplete.tsx` | ✅ | 宾客姓名输入 + 人员建议下拉 |
| PaymentMethodSelector | `components/collect/PaymentMethodSelector.tsx` | ✅ | 现金/微信/其他 Tab 选择器 |
| AccountSelector | `components/collect/AccountSelector.tsx` | ✅ | 收款账户选择器（含限额指示器） |
| WechatQrPanel | `components/collect/WechatQrPanel.tsx` | ✅ | 微信收款二维码展示 |
| RecentRecordsPanel | `components/collect/RecentRecordsPanel.tsx` | ✅ | 最近收款记录列表（分页） |
| DuplicateAlert | `components/collect/DuplicateAlert.tsx` | ✅ | 重名宾客警告弹窗 |
| MultiEntryForm | `components/collect/MultiEntryForm.tsx` | ✅ | 批量宾客录入表单 |
| CollaborationStatus | `components/collect/CollaborationStatus.tsx` | 🎯 | 协作终端在线状态面板 |

### Guestbook & Records

| Component | Path | Status | Purpose |
|-----------|------|--------|---------|
| GuestbookCard | `components/guestbook/GuestbookCard.tsx` | 🎯 | 礼簿卡片（状态标签 + 金额 + 笔数） |
| GuestbookCreateWizard | `components/guestbook/GuestbookCreateWizard.tsx` | 🎯 | 礼簿创建向导（2步流程） |
| GuestbookStatusBadge | `components/guestbook/GuestbookStatusBadge.tsx` | 🎯 | 礼簿状态标签（收礼中/收尾中/已归档） |
| ReconciliationPanel | `components/ReconciliationPanel.tsx` | ✅ | 对账视图（已对账/未对账/待核实） |
| OperationLogPanel | `components/OperationLogPanel.tsx` | ✅ | 审计日志展示 |
| RecordTypeTab | `components/records/RecordTypeTab.tsx` | 🎯 | 送出去/收进来 Tab 切换 |

### People & Stats

| Component | Path | Status | Purpose |
|-----------|------|--------|---------|
| PersonCard | `components/people/PersonCard.tsx` | 🎯 | 人员卡片（姓名+关系+收支汇总+差额） |
| RelationTagFilter | `components/people/RelationTagFilter.tsx` | 🎯 | 关系标签水平滚动筛选栏 |
| PersonDetailPanel | `components/people/PersonDetailPanel.tsx` | 🎯 | 人员详情面板（档案+按宴请分组明细） |
| MonthlyTrendChart | `components/charts/MonthlyTrendChart.tsx` | 🎯 | 月度收支趋势折线图（ECharts） |
| EventDistributionChart | `components/charts/EventDistributionChart.tsx` | 🎯 | 事由分布水平条形图（ECharts） |
| GuestbookStatsTable | `components/charts/GuestbookStatsTable.tsx` | 🎯 | 礼簿专项统计表 |
| PersonRankingTable | `components/charts/PersonRankingTable.tsx` | 🎯 | 人员往来排行 Top 10 |

### Family & Admin

| Component | Path | Status | Purpose |
|-----------|------|--------|---------|
| FamilyGroupCard | `components/family/FamilyGroupCard.tsx` | 🎯 | 家庭组卡片（成员列表+邀请码） |
| ApprovalQueue | `components/family/ApprovalQueue.tsx` | 🎯 | 审批队列面板（通过/拒绝操作） |
| InviteCodeModal | `components/family/InviteCodeModal.tsx` | 🎯 | 邀请码生成/复制弹窗 |
| AuthorizationCodeTable | `components/authz/AuthorizationCodeTable.tsx` | 🎯 | 授权码列表（状态+操作） |
| GenerateAuthCodeModal | `components/authz/GenerateAuthCodeModal.tsx` | 🎯 | 生成授权码弹窗 |
| AdminUserTable | `components/admin/AdminUserTable.tsx` | 🎯 | 管理后台用户表格（批量操作） |
| AdminAuditTable | `components/admin/AdminAuditTable.tsx` | 🎯 | 审计日志表格（可展开详情） |
| PermissionCheckboxGroup | `components/admin/PermissionCheckboxGroup.tsx` | 🎯 | 子管理员权限点勾选组 |

### Data & Sync

| Component | Path | Status | Purpose |
|-----------|------|--------|---------|
| MergeWizard | `components/merge/MergeWizard.tsx` | 🎯 | 人员合并向导（4步流程） |
| DataImportPreview | `components/import/DataImportPreview.tsx` | 🎯 | 数据导入预览表格（校验结果高亮） |
| SyncStatusBadge | `components/SyncStatusBadge.tsx` | 🎯 | 同步状态角标（已同步/同步中/离线） |
| ExportButton | `components/ExportButton.tsx` | 🎯 | 数据导出按钮（Excel/CSV，SheetJS） |
| PasswordStrengthBar | `components/auth/PasswordStrengthBar.tsx` | 🎯 | 注册页密码强度条 |

## References

See `references/project-structure.md` for the full directory tree, Vite config, TypeScript config, and file purpose mapping.

See `references/design-system.md` for the complete design token system (colors, typography, spacing, shadows, radii, animation durations), responsive layout specs, modern CSS features, and component interaction patterns from `ui-design-spec.md`.

## Checklist Before Commit

- [ ] No `any` types — all API responses typed in `types/index.ts`
- [ ] No hardcoded colors — use design tokens (`bg-primary`, `text-ink`, etc.)
- [ ] Amounts in cents (integer) — display with `/100`, parse with `*100`
- [ ] Responsive: test at `< 1280px` (mobile) and `≥ 1280px` (desktop)
- [ ] Touch targets ≥ 48px for interactive elements
- [ ] New routes added to `main.tsx` inside `ProtectedRoute` (admin routes inside role guard)
- [ ] New API functions added to `lib/api-client.ts` with proper types
- [ ] `[待实现]` TanStack Query used for server data fetching (not raw `useEffect` + `useState`)
- [ ] `[待实现]` Offline-capable pages use Dexie.js for local-first data
- [ ] `[待实现]` WebSocket pages use `useGuestbookWebSocket` hook for realtime
- [ ] New Zustand state added to `store/appStore.ts` interface and implementation
- [ ] Used `PageScaffold` wrapper for new pages
- [ ] Used `Toast` + `useToast()` for user feedback
- [ ] `[待实现]` Keyboard shortcuts implemented for desktop collect/reconcile pages
- [ ] `[待实现]` Notification bell updated when new notifications arrive
- [ ] `[待实现]` ECharts charts dispose properly on unmount
- [ ] `[待实现]` Export functionality uses SheetJS with proper column mapping
