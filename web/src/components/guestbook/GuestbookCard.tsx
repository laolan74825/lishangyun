import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import GuestbookStatusBadge from './GuestbookStatusBadge'
import type { Guestbook } from '../../types'
import { formatFen } from '../../lib/format'

interface GuestbookCardProps {
  guestbook: Guestbook
  summary?: {
    total_records: number
    total_amount: number
    checked_count: number
    unchecked_count: number
  }
  onNavigate?: (id: number) => void
}

export default function GuestbookCard({ guestbook, summary, onNavigate }: GuestbookCardProps) {
  const pct = summary && summary.total_records > 0
    ? Math.round((summary.checked_count / summary.total_records) * 100)
    : 0

  const handleNavigate = () => {
    if (onNavigate && guestbook.id) {
      onNavigate(guestbook.id)
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-card bg-card p-5 shadow-card transition-shadow hover:shadow-lg">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h3 className="text-lg font-bold text-ink">{guestbook.name}</h3>
            <p className="mt-1 text-sm text-ink-secondary">
              {guestbook.event_type} · {guestbook.event_date}
            </p>
          </div>
        </div>
        <GuestbookStatusBadge status={guestbook.status} />
      </div>

      {summary && summary.total_records > 0 && (
        <>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-bold text-ink">
              {formatFen(summary.total_amount)}
            </span>
            <span className="text-ink-secondary">{summary.total_records} 笔</span>
            <span className="text-ink-secondary">对账 {pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      )}

      <div className="flex items-center gap-3 text-xs text-ink-secondary">
        <span>创建于 {dayjs(guestbook.created_at).format('YYYY-MM-DD HH:mm')}</span>
        {guestbook.operator_note && <span>备注：{guestbook.operator_note}</span>}
      </div>

      <div className="mt-auto flex gap-2">
        {guestbook.status === 'active' && (
          <Link
            to="/guestbooks/$id/collect"
            params={{ id: String(guestbook.id) }}
            className="flex-1 rounded-btn bg-primary py-2.5 text-center text-sm font-semibold text-white"
          >
            进入收礼
          </Link>
        )}
        <button
          onClick={handleNavigate}
          className="rounded-btn border border-line px-4 py-2.5 text-sm font-medium text-ink-secondary hover:border-primary"
        >
          礼簿详情
        </button>
      </div>
    </div>
  )
}
