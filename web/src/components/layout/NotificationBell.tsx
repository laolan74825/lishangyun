import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useUnreadNotificationCount } from '../../hooks/useQueries'
import { queryKeys } from '../../hooks/queryKeys'
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../lib/api-client'
import type { Notification } from '../../types'

const TYPE_LABELS: Record<string, string> = {
  approval_approved: '审批通过',
  approval_rejected: '审批拒绝',
  approval_expired: '审批过期',
  approval_submitted: '审批提交',
  family_member_joined: '成员加入',
  merge_suggested: '合并建议',
}

export default function NotificationBell({ variant = 'dark' }: { variant?: 'dark' | 'light' } = {}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 与顶栏另一个铃铛实例共享缓存，全应用只发一次未读数请求
  const { data: unreadData, refetch: refreshUnread } = useUnreadNotificationCount()
  const unreadCount = unreadData?.unread_count ?? 0
  /** 本地同步未读数（标记已读/全部已读后写回共享缓存，两个铃铛实例同步更新） */
  function setUnreadCount(update: number | ((count: number) => number)) {
    queryClient.setQueryData<{ unread_count: number }>(
      queryKeys.notifications.unreadCount(),
      (old) => {
        const current = old?.unread_count ?? 0
        return { unread_count: typeof update === 'function' ? update(current) : update }
      },
    )
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function handleToggle() {
    if (!open) {
      setLoading(true)
      try {
        const [data] = await Promise.all([
          listNotifications({ page_size: 8 }),
          refreshUnread(),
        ])
        setNotifications(data)
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }
    setOpen((v) => !v)
  }

  async function handleMarkRead(n: Notification) {
    if (n.is_read) return
    try {
      await markNotificationRead(n.id!)
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch { /* ignore */ }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead()
      setNotifications((prev) => prev.map((x) => ({ ...x, is_read: true })))
      setUnreadCount(0)
    } catch { /* ignore */ }
  }

  function goToNotifications() {
    setOpen(false)
    navigate({ to: '/notifications' })
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleToggle}
        className={`relative rounded-md p-1.5 ${
          variant === 'dark'
            ? 'text-white/70 hover:bg-white/10 hover:text-white'
            : 'text-ink-secondary hover:bg-bg hover:text-ink'
        }`}
        aria-label="通知"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-card border border-line bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-bold text-ink">通知</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary hover:text-primary/80"
              >
                全部已读
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="py-6 text-center text-sm text-ink-secondary">加载中…</p>
            ) : notifications.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-secondary">暂无通知</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleMarkRead(n)}
                  className={`flex w-full flex-col gap-0.5 border-b border-line/50 px-4 py-3 text-left transition-colors hover:bg-bg ${
                    !n.is_read ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {!n.is_read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <span className="text-xs font-medium text-ink-secondary">
                      {TYPE_LABELS[n.type] ?? n.type}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  {n.content && (
                    <p className="line-clamp-2 text-xs text-ink-secondary">{n.content}</p>
                  )}
                  <span className="text-[11px] text-ink-secondary/60">
                    {formatTime(n.created_at)}
                  </span>
                </button>
              ))
            )}
          </div>

          <button
            onClick={goToNotifications}
            className="w-full border-t border-line py-2.5 text-center text-xs font-medium text-primary hover:bg-bg"
          >
            查看全部通知
          </button>
        </div>
      )}
    </div>
  )
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} 小时前`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay} 天前`
  return d.toLocaleDateString('zh-CN')
}
