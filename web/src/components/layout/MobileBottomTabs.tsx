import { Link, useRouterState } from '@tanstack/react-router'

const navItems = [
  { to: '/', label: '首页', icon: '🏠' },
  { to: '/records', label: '明细', icon: '📒' },
  { to: '/guestbooks', label: '礼簿', icon: '🧧' },
  { to: '/people', label: '人员', icon: '👥' },
  { to: '/stats', label: '统计', icon: '📊' },
  { to: '/settings', label: '设置', icon: '⚙️' },
]

export default function MobileBottomTabs() {
  const location = useRouterState({ select: (s) => s.location })

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex h-16 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
      {navItems.map((item) => {
        const isActive = item.to === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(item.to)
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-label ${
              isActive ? 'font-semibold text-primary' : 'text-ink-secondary'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
