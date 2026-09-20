import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAppStore, type SyncStatus } from '../../store/appStore'
import { getCurrentUser, clearToken } from '../../lib/auth'

/**
 * 响应式应用框架（ui-design-spec 第三、四节）
 * - < 1280px（手机/平板）：顶部栏 + 底部固定 Tab 栏（单手操作）
 * - ≥ 1280px（电脑桌面端）：顶部导航 64px + 侧边栏 280px + 主内容区
 */

const navItems = [
  { to: '/', label: '首页', icon: '🏠' },
  { to: '/records', label: '明细', icon: '📒' },
  { to: '/guestbooks', label: '礼簿', icon: '🧧' },
  { to: '/people', label: '人员', icon: '👥' },
  { to: '/stats', label: '统计', icon: '📊' },
  { to: '/settings', label: '设置', icon: '⚙️' }
]

const desktopNavItems = [
  { to: '/guestbooks', label: '礼簿管理' },
  { to: '/people', label: '人员管理' },
  { to: '/stats', label: '统计报表' },
  { to: '/accounts', label: '账户设置' },
  { to: '/settings', label: '系统设置' }
]

function SyncBadge() {
  const status: SyncStatus = useAppStore((s) => s.syncStatus)
  const map = {
    synced: { text: '已连接', className: 'text-success' },
    syncing: { text: '同步中…', className: 'text-warning' },
    offline: { text: '离线', className: 'text-danger' }
  } as const
  const { text, className } = map[status]
  return <span className={`text-label font-medium ${className}`}>{text}</span>
}

function UserMenu() {
  const navigate = useNavigate()
  const user = getCurrentUser()
  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }
  if (!user) return null
  return (
    <div className="flex items-center gap-2">
      <span className="text-label text-white/70">{user.username}</span>
      <button
        type="button"
        onClick={handleLogout}
        className="rounded-md px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
      >
        退出
      </button>
    </div>
  )
}

function MobileUserMenu() {
  const navigate = useNavigate()
  const user = getCurrentUser()
  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }
  if (!user) return null
  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-md px-2 py-1 text-xs text-ink-secondary hover:bg-bg"
    >
      {user.username} · 退出
    </button>
  )
}

function DesktopLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* 顶部导航栏 64px，深色背景 */}
      <header className="sticky top-0 z-10 flex h-16 items-center gap-8 bg-ink px-6 text-white">
        <NavLink to="/" className="text-lg font-bold">
          🧧 随礼记账本
        </NavLink>
        <nav className="flex gap-6">
          {desktopNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? 'text-primary-light' : 'text-white/80 hover:text-white'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <SyncBadge />
          <UserMenu />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1">
        {/* 侧边栏 280px */}
        <aside className="hidden w-[280px] shrink-0 border-r border-line bg-card p-6 xl:block">
          <div className="flex flex-col gap-3">
            <NavLink
              to="/records/new"
              className="rounded-btn bg-primary py-3 text-center font-semibold text-white"
            >
              ＋ 记一笔
            </NavLink>
            <NavLink
              to="/guestbooks/new"
              className="rounded-btn border border-primary py-3 text-center font-semibold text-primary"
            >
              ＋ 新建礼簿
            </NavLink>
            <NavLink
              to="/join"
              className="rounded-btn border border-line py-3 text-center font-semibold text-ink"
            >
              加入协作
            </NavLink>
          </div>
        </aside>

        {/* 主内容区 */}
        <main className="min-w-0 flex-1 p-8">
          <Outlet />
        </main>
      </div>

      {/* 底部状态栏 32px（ui-design-spec 4.0） */}
      <footer className="flex h-8 items-center justify-between bg-ink px-6 text-xs text-white/60">
        <span>随礼记账本 v0.1.0</span>
        <span>Ctrl+N 记一笔 · Ctrl+F 搜索 · Esc 返回</span>
      </footer>
    </div>
  )
}

function MobileLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* 顶部栏 56px */}
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-card px-4">
        <NavLink to="/" className="text-lg font-bold">
          🧧 随礼记账本
        </NavLink>
        <div className="flex items-center gap-3">
          <SyncBadge />
          <MobileUserMenu />
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>

      {/* 底部固定 Tab 栏（拇指热区，单手操作） */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex h-16 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-0.5 text-label ${
                isActive ? 'font-semibold text-primary' : 'text-ink-secondary'
              }`
            }
          >
            <span className="text-xl">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function AppLayout() {
  // 1280px 以下为手机/平板布局，以上进入桌面端布局（ui-design-spec 第六节断点）
  return (
    <>
      <div className="xl:hidden">
        <MobileLayout />
      </div>
      <div className="hidden xl:block">
        <DesktopLayout />
      </div>
    </>
  )
}
