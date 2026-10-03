import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { getCurrentUser, clearToken } from '../../lib/auth'
import SyncStatusBadge from '../SyncStatusBadge'
import NotificationBell from './NotificationBell'

const navItems = [
  { to: '/guestbooks', label: '礼簿管理' },
  { to: '/people', label: '人员管理' },
  { to: '/stats', label: '统计报表' },
  { to: '/accounts', label: '账户管理' },
  { to: '/import', label: '数据导入' },
]

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useRouterState({ select: (s) => s.location })
  const isActive = location.pathname.startsWith(to)
  return (
    <Link
      to={to}
      className={isActive ? 'text-primary-light' : 'text-white/80 hover:text-white'}
    >
      {children}
    </Link>
  )
}

function HomeLink() {
  const location = useRouterState({ select: (s) => s.location })
  // 首页仅在路径为 / 时激活（不能用 startsWith，否则所有页面都匹配）
  const isActive = location.pathname === '/'
  return (
    <Link to="/" className="text-lg font-bold text-white">
      🧧 礼云随笔
      {/* 「首页」与右侧导航项同一套激活态模式 */}
      <span
        className={`ml-1.5 rounded-md px-1.5 py-0.5 align-middle text-xs font-normal transition-colors ${
          isActive
            ? 'bg-primary-light/20 text-primary-light'
            : 'bg-white/10 text-white/60 hover:text-white'
        }`}
      >
        首页
      </span>
    </Link>
  )
}

function UserMenu() {
  const navigate = useNavigate()
  const user = getCurrentUser()

  function handleLogout() {
    clearToken()
    navigate({ to: '/login', replace: true })
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

export default function TopNavBar() {
  return (
    <header className="sticky top-0 z-10 bg-ink text-white">
      <div className="flex h-16 w-full items-center gap-8 px-8">
        <HomeLink />
        <nav className="flex gap-6">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <SyncStatusBadge />
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
