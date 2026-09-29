import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { getCurrentUser, clearToken } from '../../lib/auth'
import SyncStatusBadge from '../SyncStatusBadge'
import NotificationBell from './NotificationBell'
import MobileBottomTabs from './MobileBottomTabs'
import TopNavBar from './TopNavBar'
import DesktopSidebar from './DesktopSidebar'

function MobileUserMenu() {
  const navigate = useNavigate()
  const user = getCurrentUser()
  function handleLogout() {
    clearToken()
    navigate({ to: '/login', replace: true })
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

function MobileHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-card px-4">
      <Link to="/" className="text-lg font-bold text-ink">
        🧧 随礼记账本
      </Link>
      <div className="flex items-center gap-3">
        <SyncStatusBadge />
        <NotificationBell variant="light" />
        <MobileUserMenu />
      </div>
    </header>
  )
}

function MobileLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <MobileHeader />
      <main className="mx-auto max-w-6xl flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>
      <MobileBottomTabs />
    </div>
  )
}

function DesktopLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopNavBar />
      <div className="flex min-h-0 flex-1">
        <DesktopSidebar />
        <main className="mx-auto max-w-6xl flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
      <footer className="flex h-8 shrink-0 items-center justify-between border-t border-line bg-card px-6 text-xs text-ink-secondary">
        <span>随礼记账本 v0.1.0</span>
        <span>Ctrl+N 记一笔 · Ctrl+F 搜索 · Esc 返回</span>
      </footer>
    </div>
  )
}

export default function AppLayout() {
  return (
    <>
      <div className="block md:hidden">
        <MobileLayout />
      </div>
      <div className="hidden md:block">
        <DesktopLayout />
      </div>
    </>
  )
}
