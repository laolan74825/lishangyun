import { useState } from 'react'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import {
  useNotificationsList,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useUnreadNotificationCount,
} from '../hooks/useQueries'
import type { Notification, NotificationType } from '../types'

const TYPE_LABELS: Record<string, string> = {
  approval_approved: '审批通过',
  approval_rejected: '审批拒绝',
  approval_expired: '审批过期',
  approval_submitted: '审批提交',
  family_member_joined: '成员加入',
  merge_suggested: '合并建议',
}

type FilterType = '' | NotificationType

export default function NotificationsPage() {
  const { toast, showToast } = useToast()
  const [filter, setFilter] = useState<FilterType>('')
  const [readFilter, setReadFilter] = useState<'all' | 'unread'>('all')

  // 共享查询：与铃铛面板/角标联动，筛选切换 30s 内走缓存，60s 静默轮询
  const { data: notifications = [], isLoading: loading } = useNotificationsList({
    unreadOnly: readFilter === 'unread',
    type: filter,
  })
  // 未读数直接读共享缓存（顶栏铃铛同一数据源），全部已读后即时归零
  const { data: unreadData } = useUnreadNotificationCount()
  const unreadCount = unreadData?.unread_count ?? 0

  const markReadMutation = useMarkNotificationRead()
  const markAllMutation = useMarkAllNotificationsRead()
  const deleteMutation = useDeleteNotification()

  async function handleMarkRead(n: Notification) {
    if (n.is_read || markReadMutation.isPending) return
    try {
      await markReadMutation.mutateAsync(n)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '操作失败')
    }
  }

  async function handleMarkAllRead() {
    if (markAllMutation.isPending) return
    try {
      await markAllMutation.mutateAsync()
      showToast('已全部标记为已读')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '操作失败')
    }
  }

  async function handleDelete(n: Notification) {
    if (deleteMutation.isPending) return
    try {
      await deleteMutation.mutateAsync(n)
      showToast('已删除')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '删除失败')
    }
  }

  const typeFilters: { key: FilterType; label: string }[] = [
    { key: '', label: '全部类型' },
    { key: 'approval_approved', label: '审批通过' },
    { key: 'approval_rejected', label: '审批拒绝' },
    { key: 'approval_submitted', label: '审批提交' },
    { key: 'approval_expired', label: '审批过期' },
    { key: 'family_member_joined', label: '成员加入' },
  ]

  return (
    <PageScaffold
      title="通知中心"
      description="查看审批结果、家庭组动态等通知"
      actions={
        unreadCount > 0 ? (
          <button
            onClick={handleMarkAllRead}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            全部已读 ({unreadCount})
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            <button
              onClick={() => setReadFilter('all')}
              className={`rounded-btn px-3 py-1.5 text-xs font-medium transition-colors ${
                readFilter === 'all'
                  ? 'bg-primary text-white'
                  : 'border border-line text-ink-secondary hover:border-primary'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setReadFilter('unread')}
              className={`rounded-btn px-3 py-1.5 text-xs font-medium transition-colors ${
                readFilter === 'unread'
                  ? 'bg-primary text-white'
                  : 'border border-line text-ink-secondary hover:border-primary'
              }`}
            >
              未读
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {typeFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`whitespace-nowrap rounded-btn px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === f.key
                    ? 'bg-ink text-white'
                    : 'border border-line text-ink-secondary hover:border-ink'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-ink-secondary">加载中…</p>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-ink-secondary">
            <span className="text-4xl">🔔</span>
            <p className="text-sm">暂无通知</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleMarkRead(n)}
                className={`flex cursor-pointer items-start justify-between gap-4 rounded-lg border px-4 py-3 transition-colors ${
                  n.is_read
                    ? 'border-line hover:bg-bg'
                    : 'border-primary/30 bg-primary/5 hover:bg-primary/10'
                }`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {!n.is_read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <span className="rounded bg-ink/5 px-1.5 py-0.5 text-xs text-ink-secondary">
                      {TYPE_LABELS[n.type] ?? n.type}
                    </span>
                    <span className="text-[11px] text-ink-secondary/60">
                      {new Date(n.created_at).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <p className={`text-sm ${n.is_read ? 'text-ink-secondary' : 'font-medium text-ink'}`}>
                    {n.title}
                  </p>
                  {n.content && (
                    <p className="text-xs text-ink-secondary">{n.content}</p>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(n) }}
                  className="shrink-0 rounded-md p-1 text-ink-secondary/40 hover:text-danger"
                  aria-label="删除通知"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
