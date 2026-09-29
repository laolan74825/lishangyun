import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { getCurrentUser, clearToken } from '../../lib/auth'
import SyncStatusBadge from '../SyncStatusBadge'
import NotificationBell from './NotificationBell'

const navItems = [
  { to: '/guestbooks', label: '礼簿管理' },
  { to: '/people', label: '人员管理' },
  { to: '/stats', label: '统计报表' },
  { to: '/accounts', label: '收款账户' },
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
        <Link to="/" className="text-lg font-bold text-white">
          🧧 随礼记账本
        </Link>
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
