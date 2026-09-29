import { useCallback } from 'react'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { getCurrentUser, clearToken } from '../../lib/auth'

const adminNavItems = [
  { to: '/admin', label: '仪表盘', icon: '📊', end: true },
  { to: '/admin/users', label: '用户管理', icon: '👥' },
  { to: '/admin/audit', label: '审计日志', icon: '📋' },
  { to: '/admin/settings', label: '系统配置', icon: '⚙️' },
  { to: '/admin/announcements', label: '公告管理', icon: '📢' },
  { to: '/admin/recycle', label: '回收站', icon: '🗑️' },
]

function AdminNavLink({ to, label, icon, end }: {
  to: string
  label: string
  icon: string
  end?: boolean
}) {
  const location = useRouterState({ select: (s) => s.location })
  const isActive = end
    ? location.pathname === to
    : location.pathname === to || location.pathname.startsWith(to + '/')
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-btn px-4 py-2.5 text-sm transition-colors ${
        isActive
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-ink-secondary hover:bg-bg hover:text-ink'
      }`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </Link>
  )
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const user = getCurrentUser()

  const handleLogout = useCallback(() => {
    clearToken()
    navigate({ to: '/login', replace: true })
  }, [navigate])

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-card px-6">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-lg font-bold text-ink"
          >
            🧧 随礼记账本
          </Link>
          <span className="text-ink-secondary">/</span>
          <span className="text-sm font-medium text-ink">管理后台</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-ink-secondary">{user?.username}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md px-2 py-1 text-xs text-ink-secondary hover:bg-bg"
          >
            退出
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="w-56 shrink-0 border-r border-line bg-card p-4">
          <nav className="flex flex-col gap-1">
            {adminNavItems.map((item) => (
              <AdminNavLink
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
                end={item.end}
              />
            ))}
          </nav>
          <div className="mt-6 border-t border-line pt-4">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-btn px-4 py-2 text-sm text-ink-secondary hover:bg-bg hover:text-ink"
            >
              <span>←</span>
              返回主应用
            </Link>
          </div>
        </aside>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
