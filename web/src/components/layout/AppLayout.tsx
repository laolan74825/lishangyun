import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { getCurrentUser, clearToken } from '../../lib/auth'
import { APP_VERSION } from '../../lib/version'
import SyncStatusBadge from '../SyncStatusBadge'
import NotificationBell from './NotificationBell'
import MobileBottomTabs from './MobileBottomTabs'
import TopNavBar from './TopNavBar'
import DesktopSidebar from './DesktopSidebar'
import SecurityEmailPrompt from '../SecurityEmailPrompt'

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
        🧧 礼尚云
      </Link>
      <div className="flex items-center gap-3">
        <SyncStatusBadge />
        <NotificationBell variant="light" />
        <MobileUserMenu />
      </div>
    </header>
  )
}

/**
 * 单壳布局：页面内容（<Outlet />）只渲染一份。
 * 窄屏（<md）：移动顶栏 + 整页窗口滚动 + 底部标签导航；
 * 宽屏（≥md）：桌面深色顶栏 + 侧边栏，仅主内容区滚动。
 * 外壳各部件按断点显隐，但每个部件内部不含 <Outlet />，无重复挂载/重复请求。
 */
export default function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col md:h-screen md:overflow-hidden">
      {/* 顶栏：窄屏移动顶栏 / 宽屏桌面导航 */}
      <div className="block md:hidden">
        <MobileHeader />
      </div>
      <div className="hidden md:block">
        <TopNavBar />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="hidden md:block">
          <DesktopSidebar />
        </div>
        {/* min-w-0 必需：flex 子项默认 min-width:auto=min-content，子树里任何
            未约束的宽内容（如 min-w-[860px] 表格）会把整页撑宽；w-full 让宽度
            确定为视口宽（max-w-6xl 封顶、mx-auto 居中），内部 overflow-x-auto
            容器才能真正收住横向滚动。
            pb-24 给窄屏底部导航留位；宽屏主区独立滚动（md:overflow-y-auto） */}
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-24 pt-4 md:overflow-y-auto md:p-8">
          <Outlet />
        </main>
      </div>

      {/* 底栏：窄屏底部标签 / 宽屏页脚 */}
      <div className="block md:hidden">
        <MobileBottomTabs />
      </div>
      <SecurityEmailPrompt />
      <footer className="hidden h-8 shrink-0 items-center justify-between border-t border-line bg-card px-6 text-xs text-ink-secondary md:flex">
        <span>礼尚云 v{APP_VERSION}</span>
        <span>Ctrl+N 记一笔 · Ctrl+F 搜索 · Esc 返回</span>
      </footer>
    </div>
  )
}
