import { Link } from '@tanstack/react-router'
import { useGuestbooks } from '../../hooks/useQueries'
import { isAdmin } from '../../lib/auth'
import type { GuestbookStatus } from '../../types'

const STATUS_LABELS: Record<GuestbookStatus, string> = {
  active: '收礼中',
  closing: '收尾中',
  archived: '已归档',
}

const quickActions = [
  { to: '/guestbooks/new', label: '新建礼簿', icon: '🧧' },
  { to: '/records/new', label: '记一笔', icon: '✏️' },
]

export default function DesktopSidebar() {
  const { data: guestbooks } = useGuestbooks()
  const recentGuest = (guestbooks ?? []).slice(0, 5)

  return (
    <aside className="flex shrink-0 flex-col border-r border-line bg-card" style={{ width: 'clamp(200px, calc(-77.27px + 36.04vw), 280px)' }}>
      <div className="flex-1 overflow-y-auto p-4">
        <section className="mb-6">
          <h3 className="mb-2 text-label text-ink-secondary">快捷操作</h3>
          <div className="flex flex-col gap-1">
            {quickActions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink hover:bg-bg"
              >
                <span>{action.icon}</span>
                {action.label}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-label text-ink-secondary">最近礼簿</h3>
          {recentGuest.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-secondary">暂无礼簿</p>
          ) : (
            <div className="flex flex-col gap-1">
              {recentGuest.map((gb) => (
                <Link
                  key={gb.id}
                  to="/guestbooks/$id"
                  params={{ id: String(gb.id) }}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-ink hover:bg-bg"
                >
                  <span className="truncate">{gb.name}</span>
                  <span className="shrink-0 text-xs text-ink-secondary">{STATUS_LABELS[gb.status] ?? gb.status}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="shrink-0 border-t border-line p-4">
        <div className="flex flex-col gap-1">
          {isAdmin() && (
            <Link
              to="/admin"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
            >
              <span>🛠️</span>
              管理后台
            </Link>
          )}
          <Link
            to="/family"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink hover:bg-bg"
          >
            <span>👨‍👩‍👧‍👦</span>
            家庭管理
          </Link>
          <Link
            to="/collaboration"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink hover:bg-bg"
          >
            <span>🤝</span>
            协作管理
          </Link>
          <Link
            to="/security"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink hover:bg-bg"
          >
            <span>🛡️</span>
            安全模式
          </Link>
          <Link
            to="/settings"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink hover:bg-bg"
          >
            <span>⚙️</span>
            系统设置
          </Link>
        </div>
      </div>
    </aside>
  )
}
