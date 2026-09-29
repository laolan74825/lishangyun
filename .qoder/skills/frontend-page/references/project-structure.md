# Project Structure Reference

> **状态标注约定**
> - ✅ `[已实现]` — 文件已存在，代码可用
> - 🎯 `[待实现]` — 需求已定义，代码尚未开发
>
> 当前代码库共 32 个源文件（14 组件 + 11 页面 + 4 lib + 1 store + 1 styles + 1 types + main.tsx）

## Directory Tree

```
web/
├── index.html                          ✅ Vite entry HTML
├── package.json                        ✅ pnpm dependencies
├── vite.config.ts                      ✅ Vite + React + Tailwind + PWA config
│                                       ⚠️ 当前仅有 /api proxy；/ws proxy [待实现]
├── tsconfig.json                       ✅ Strict TS, ES2022, react-jsx, noEmit
│
├── src/
│   ├── main.tsx                        ✅ React root, react-router-dom v7 路由, ProtectedRoute
│   │                                   ⚠️ 需求目标为 TanStack Router [待迁移]
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx           ✅ 响应式布局框架（当前 <xl / ≥xl 二分）
│   │   │   ├── MobileBottomTabs.tsx    🎯 手机底部 Tab 栏（6 tabs）
│   │   │   ├── DesktopSidebar.tsx      🎯 桌面端侧边栏（快捷操作 + 最近访问）
│   │   │   ├── TopNavBar.tsx           🎯 桌面端顶部导航（Logo + nav links + 通知铃铛）
│   │   │   ├── NotificationBell.tsx    🎯 通知铃铛（未读角标 + 下拉通知列表）
│   │   │   └── AdminLayout.tsx         🎯 管理后台独立导航框架
│   │   │
│   │   ├── collect/                    ✅ 目录已存在
│   │   │   ├── AccountSelector.tsx     ✅ 收款账户选择器
│   │   │   ├── CollaborationStatus.tsx 🎯 协作终端在线状态面板
│   │   │   ├── DuplicateAlert.tsx      ✅ 重名提醒弹窗
│   │   │   ├── MultiEntryForm.tsx      ✅ 批量录入表单
│   │   │   ├── PaymentMethodSelector.tsx ✅ 支付方式选择
│   │   │   ├── RecentRecordsPanel.tsx  ✅ 最近收礼记录面板
│   │   │   └── WechatQrPanel.tsx       ✅ 微信收款二维码面板
│   │   │
│   │   ├── guestbook/                  🎯 目录待创建
│   │   │   ├── GuestbookCard.tsx       🎯 礼簿卡片（状态标签 + 金额 + 笔数）
│   │   │   ├── GuestbookCreateWizard.tsx 🎯 礼簿创建向导（2步流程）
│   │   │   └── GuestbookStatusBadge.tsx 🎯 礼簿状态标签（收礼中/收尾中/已归档）
│   │   │
│   │   ├── people/                     🎯 目录待创建
│   │   │   ├── PersonCard.tsx          🎯 人员卡片（姓名+关系+收支汇总+差额）
│   │   │   ├── PersonDetailPanel.tsx   🎯 人员详情面板（档案+按宴请分组明细）
│   │   │   └── RelationTagFilter.tsx   🎯 关系标签水平滚动筛选栏
│   │   │
│   │   ├── records/                    🎯 目录待创建
│   │   │   └── RecordTypeTab.tsx       🎯 送出去/收进来 Tab 切换
│   │   │
│   │   ├── charts/                     🎯 目录待创建（依赖 ECharts [待安装]）
│   │   │   ├── MonthlyTrendChart.tsx   🎯 月度收支趋势折线图
│   │   │   ├── EventDistributionChart.tsx 🎯 事由分布水平条形图
│   │   │   ├── GuestbookStatsTable.tsx 🎯 礼簿专项统计表
│   │   │   └── PersonRankingTable.tsx  🎯 人员往来排行 Top 10
│   │   │
│   │   ├── family/                     🎯 目录待创建
│   │   │   ├── FamilyGroupCard.tsx     🎯 家庭组卡片（成员列表+邀请码）
│   │   │   ├── ApprovalQueue.tsx       🎯 审批队列面板（通过/拒绝操作）
│   │   │   └── InviteCodeModal.tsx     🎯 邀请码生成/复制弹窗
│   │   │
│   │   ├── authz/                      🎯 目录待创建
│   │   │   ├── AuthorizationCodeTable.tsx   🎯 授权码列表（状态+操作）
│   │   │   └── GenerateAuthCodeModal.tsx    🎯 生成授权码弹窗
│   │   │
│   │   ├── admin/                      🎯 目录待创建
│   │   │   ├── AdminUserTable.tsx      🎯 管理后台用户表格（批量操作）
│   │   │   ├── AdminAuditTable.tsx     🎯 审计日志表格（可展开详情）
│   │   │   └── PermissionCheckboxGroup.tsx 🎯 子管理员权限点勾选组
│   │   │
│   │   ├── merge/                      🎯 目录待创建
│   │   │   └── MergeWizard.tsx         🎯 人员合并向导（4步流程）
│   │   │
│   │   ├── import/                     🎯 目录待创建
│   │   │   └── DataImportPreview.tsx   🎯 数据导入预览表格（校验结果高亮）
│   │   │
│   │   ├── auth/                       🎯 目录待创建
│   │   │   └── PasswordStrengthBar.tsx 🎯 注册页密码强度条
│   │   │
│   │   ├── LockScreen.tsx              🎯 全局锁屏覆盖层（模糊背景 + 密码解锁）
│   │   ├── ConfirmDialog.tsx           🎯 二次确认弹窗（删除、归档等危险操作）
│   │   ├── ExportButton.tsx            🎯 数据导出按钮（Excel/CSV，依赖 SheetJS [待安装]）
│   │   ├── Modal.tsx                   ✅ 通用模态弹窗
│   │   ├── NameAutocomplete.tsx        ✅ 宾客姓名输入 + 人员建议下拉
│   │   ├── OperationLogPanel.tsx       ✅ 审计日志展示
│   │   ├── PageScaffold.tsx           ✅ 页面包装器：标题 + 描述 + actions 插槽
│   │   ├── ReconciliationPanel.tsx     ✅ 对账视图（当前仅已对账/未对账；待核实 [待实现]）
│   │   ├── SyncStatusBadge.tsx         🎯 同步状态角标（已同步/同步中/离线）
│   │   └── Toast.tsx                   ✅ Toast 通知 + useToast() hook
│   │
│   ├── pages/
│   │   ├── LoginPage.tsx               ✅ 登录页
│   │   ├── RegisterPage.tsx            🎯 注册页（安全邮箱 + 密码强度条）
│   │   ├── DashboardPage.tsx           ✅ 首页仪表板
│   │   ├── RecordsListPage.tsx         ✅ 日常记录列表
│   │   ├── RecordFormPage.tsx          ✅ 新建日常记录
│   │   ├── GuestbookPage.tsx           ✅ 礼簿列表 + 新建（named exports）
│   │   ├── GuestbookCreateWizardPage.tsx 🎯 礼簿创建向导页（2步）
│   │   ├── GuestbookDetailPage.tsx     ✅ 礼簿详情页
│   │   ├── CollectPage.tsx             ✅ 现场收礼页
│   │   ├── TerminalSettingsPage.tsx    🎯 终端设置（默认账户、收银人、二维码）
│   │   ├── AccountsPage.tsx            ✅ 收款账户管理
│   │   ├── PeoplePage.tsx              ✅ 人员管理
│   │   ├── PersonDetailPage.tsx        🎯 人员详情（档案+按宴请分组往来明细）
│   │   ├── StatsPage.tsx               ✅ 统计报表
│   │   ├── SettingsPage.tsx            ✅ 个人设置
│   │   ├── SecurityPage.tsx            🎯 安全模式（普通↔增强，助记词管理）
│   │   ├── FamilyPage.tsx              🎯 家庭管理（创建/加入家庭组、成员、审批）
│   │   ├── NotificationsPage.tsx       🎯 通知中心（5 种通知类型列表）
│   │   ├── AuthorizationPage.tsx       🎯 授权码管理（生成、状态、撤销、日志）
│   │   ├── MergeWizardPage.tsx         🎯 人员合并向导页
│   │   ├── DataImportPage.tsx          🎯 数据导入（Excel/CSV 上传、预览、校验）
│   │   ├── admin/                      🎯 目录待创建
│   │   │   ├── AdminDashboardPage.tsx  🎯 管理后台仪表盘
│   │   │   ├── AdminUsersPage.tsx      🎯 用户管理（CRUD、禁用、子管理员）
│   │   │   ├── AdminAuditPage.tsx      🎯 审计日志（多维筛选、详情、导出）
│   │   │   ├── AdminSettingsPage.tsx   🎯 系统配置（全局参数）
│   │   │   ├── AdminAnnouncementsPage.tsx 🎯 公告管理
│   │   │   └── AdminRecyclePage.tsx    🎯 回收站（软删除记录管理）
│   │
│   ├── hooks/                          🎯 目录待创建（全部 hooks [待实现]）
│   │   ├── useWebSocket.ts             🎯 礼簿协作 WebSocket hook
│   │   ├── useKeyboardShortcuts.ts     🎯 桌面端键盘快捷键 hook
│   │   ├── useLockScreen.ts            🎯 锁屏逻辑 hook（超时检测、锁定/解锁）
│   │   ├── useNotifications.ts         🎯 通知轮询/WebSocket hook
│   │   └── useSyncStatus.ts            🎯 同步状态 hook（在线/离线/同步中）
│   │
│   ├── store/
│   │   └── appStore.ts                 ✅ Zustand v5 global store
│   │                                   ⚠️ 当前：syncStatus, currentGuestbook, gbRecords,
│   │                                     operatorName, terminalSettings, wechatLimitCache, toast
│   │                                   ⚠️ 缺少：notifications, lockState [待实现]
│   │
│   ├── lib/
│   │   ├── api.ts                      ✅ HTTP client: fetch wrapper + JWT auth + 401 redirect
│   │   ├── api-client.ts               ✅ API functions organized by domain
│   │   ├── auth.ts                     ✅ JWT token + user info in localStorage
│   │   │                               ⚠️ 角色为 admin|editor|viewer；需求目标 super_admin|admin|editor|viewer|auditor [待同步]
│   │   ├── client.ts                   ✅ Client ID (gr.client_id) + UUID generator + nowIso()
│   │   ├── dexie.ts                    🎯 Dexie.js IndexedDB wrapper [待安装 dexie]
│   │   ├── sync.ts                     🎯 IndexedDB ↔ Server sync engine [待实现]
│   │   ├── websocket.ts                🎯 WebSocket connection manager [待实现]
│   │   ├── encryption.ts               🎯 Client-side AES-256-GCM encryption [待实现]
│   │   ├── export.ts                   🎯 SheetJS export utilities [待安装 xlsx]
│   │   └── charts.ts                   🎯 ECharts shared option factories [待安装 echarts]
│   │
│   ├── styles/
│   │   └── index.css                   ✅ Tailwind @import + @theme design tokens + custom utilities
│   │                                   ⚠️ 缺少：duration tokens, semantic color mappings, shadow-input-focus [待实现]
│   │
│   └── types/
│       └── index.ts                    ✅ Domain types (Person, Guestbook, GbRecord, DailyRecord, ...)
│                                       ⚠️ GuestbookStatus 仅二态 [待同步→三态]
│                                       ⚠️ CheckStatus 缺 disputed [待同步]
│                                       ⚠️ OperationLog 用旧式 gb_record_id [待同步→target_table+target_id]
│                                       ⚠️ 缺 PaginatedResponse<T> [待实现]
```

## Key Entry Points

| File | Purpose | Status |
|------|---------|--------|
| `main.tsx` | 路由定义 + ProtectedRoute + 角色守卫 + 应用启动 | ✅ 当前 react-router-dom v7；目标 TanStack Router 🎯 |
| `components/layout/AppLayout.tsx` | 响应式布局框架 | ✅ 当前二分区分；目标六断点 🎯 |
| `components/layout/TopNavBar.tsx` | 桌面端顶部导航 | 🎯 |
| `components/LockScreen.tsx` | 全局锁屏覆盖层 | 🎯 |
| `lib/api.ts` | 基础 HTTP 客户端（fetch + JWT + 错误处理） | ✅ |
| `lib/api-client.ts` | 所有领域 API 函数（按模块分组） | ✅ |
| `lib/dexie.ts` | IndexedDB 离线存储 | 🎯 |
| `lib/sync.ts` | 离线↔服务端同步引擎 | 🎯 |
| `lib/websocket.ts` | WebSocket 连接管理器 | 🎯 |
| `lib/encryption.ts` | 客户端 AES-256-GCM 加密 | 🎯 |
| `store/appStore.ts` | Zustand 全局状态 | ✅ 部分（缺 notifications/lockState） |
| `types/index.ts` | 所有 TypeScript 类型定义 | ✅ 部分（待同步多项） |
| `styles/index.css` | 设计令牌（Tailwind @theme） | ✅ 部分（缺 duration/semantic） |
| `hooks/useWebSocket.ts` | 实时协作 hook | 🎯 |
| `hooks/useKeyboardShortcuts.ts` | 桌面端键盘快捷键 | 🎯 |

## Vite Config

- ✅ Proxy: `/api` → `http://localhost:8001` (backend)
- 🎯 Proxy: `/ws` → `ws://localhost:8001` (WebSocket) — 当前 vite.config.ts 未配置
- ✅ PWA: autoUpdate, theme_color `#E07B3A`, background `#F5F5F0`, display standalone
- ✅ Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite-plugin-pwa`

## TypeScript Config

- ✅ Target: ES2022, Module: ESNext (bundler resolution)
- ✅ Strict mode enabled, `noUnusedLocals`, `noUnusedParameters`, `isolatedModules`
- ✅ `verbatimModuleSyntax` — use `import type` for type-only imports
- ✅ No emit (Vite handles bundling)

## Auth Flow

| Step | Description | Status |
|------|-------------|--------|
| 1 | `LoginPage` calls `api.post('/auth/login', ...)` → receives JWT token | ✅ |
| 2 | Token stored in `localStorage` as `gr.access_token` | ✅ |
| 3 | User info stored as `gr.current_user` (JSON: `{ id, username, role }`) | ✅ |
| 4 | `ProtectedRoute` checks `isAuthenticated()` (token exists) before rendering | ✅ |
| 5 | Admin routes check role — 当前 `role === 'admin'`；目标 `super_admin \| admin` | ⚠️ 待同步 |
| 6 | `api.ts` attaches `Authorization: Bearer <token>` to every request | ✅ |
| 7 | 401 response → `clearToken()` + redirect to `/login` | ✅ |
| 8 | Lock screen: `useLockScreen` hook monitors inactivity timeout | 🎯 |
| 9 | LockScreen component renders when `isLocked === true`, overlay z-index 100 | 🎯 |

## localStorage Keys

| Key | Content | Status |
|-----|---------|--------|
| `gr.access_token` | JWT token string | ✅ |
| `gr.current_user` | JSON `{ id, username, role, email? }` | ✅ |
| `gr.client_id` | Stable UUID for this terminal/client | ✅ |
| `gr_operator_name` | Operator name preference | ✅ |
| `gr.lock_timeout` | Auto-lock timeout in minutes (user preference) | 🎯 |

## IndexedDB (Dexie.js) Tables

> 🎯 **整个 IndexedDB 离线层 [待实现]** — 需安装 `dexie` 依赖，创建 `lib/dexie.ts` 和 `lib/sync.ts`

| Table | Key Path | Indexes | Purpose |
|-------|----------|---------|---------|
| `gbRecords` | `id` | `guestbook_id`, `uuid`, `guest_name`, `record_time`, `_syncedAt` | Offline gift records |
| `dailyRecords` | `id` | `person_id`, `type`, `event_date`, `_syncedAt` | Offline daily records |
| `persons` | `id` | `name`, `phone`, `relation_tag`, `_syncedAt` | Offline person cache |

> 每张表包含 `_syncedAt` 字段：`0` = 待同步, timestamp = 最后同步时间。同步引擎在重连时处理 `_syncedAt === 0` 的条目。

## Page → Component → API Mapping

| Page | Key Components | API Module | Status |
|------|---------------|------------|--------|
| CollectPage | NameAutocomplete ✅, PaymentMethodSelector ✅, AccountSelector ✅, WechatQrPanel ✅, RecentRecordsPanel ✅, CollaborationStatus 🎯, MultiEntryForm ✅ | `gb_records`, `terminal_settings`, `payment_accounts` | ✅ |
| GuestbookDetailPage | ReconciliationPanel ✅, OperationLogPanel ✅, GuestbookStatusBadge 🎯, MonthlyTrendChart 🎯, ExportButton 🎯 | `guestbooks`, `gb_records`, `operation_logs`, `stats` | ✅ 部分 |
| GuestbookCreateWizardPage | GuestbookCreateWizard 🎯 | `guestbooks`, `payment_accounts` | 🎯 |
| PeoplePage | PersonCard 🎯, RelationTagFilter 🎯 | `persons` | ✅ |
| PersonDetailPage | PersonDetailPanel 🎯 | `persons`, `gb_records`, `daily_records` | 🎯 |
| StatsPage | MonthlyTrendChart 🎯, EventDistributionChart 🎯, GuestbookStatsTable 🎯, PersonRankingTable 🎯 | `stats` | ✅ |
| FamilyPage | FamilyGroupCard 🎯, ApprovalQueue 🎯, InviteCodeModal 🎯 | `family` | 🎯 |
| AuthorizationPage | AuthorizationCodeTable 🎯, GenerateAuthCodeModal 🎯 | `authz` | 🎯 |
| AdminUsersPage | AdminUserTable 🎯, PermissionCheckboxGroup 🎯 | `admin` | 🎯 |
| AdminAuditPage | AdminAuditTable 🎯, ExportButton 🎯 | `admin`, `operation_logs` | 🎯 |
| DataImportPage | DataImportPreview 🎯 | `import` | 🎯 |
| SecurityPage | PasswordStrengthBar 🎯 | `security` | 🎯 |
| SettingsPage | — | `account`, `auth` | ✅ |
| LoginPage | — | `auth` | ✅ |
| RegisterPage | PasswordStrengthBar 🎯 | `auth` | 🎯 |
| LockScreen | — | `auth` | 🎯 |
| NotificationsPage | — | `notifications` | 🎯 |
| MergeWizardPage | MergeWizard 🎯 | `persons`, `merge` | 🎯 |
| TerminalSettingsPage | — | `terminal_settings` | 🎯 |

## 统计摘要

| 分类 | 已实现 ✅ | 待实现 🎯 | 合计 |
|------|----------|----------|------|
| 组件 | 14 | 30 | 44 |
| 页面 | 11 | 17 | 28 |
| Hooks | 0 | 5 | 5 |
| Lib 工具 | 5 | 6 | 11 |
| **合计** | **30** | **58** | **88** |

> 已实现占比约 34%。核心框架（路由、API 客户端、状态管理、设计令牌）已就位；
> 主要缺口在：布局组件、业务子组件、hooks、离线/同步层、图表/导出、管理后台。
