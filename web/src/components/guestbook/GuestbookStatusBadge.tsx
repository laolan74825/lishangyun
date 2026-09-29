import type { GuestbookStatus } from '../../types'

const statusConfig: Record<GuestbookStatus, { label: string; className: string; dot?: boolean }> = {
  'active': {
    label: '收礼中',
    className: 'bg-success-bg text-success-deep',
    dot: true,
  },
  'closing': {
    label: '收尾中',
    className: 'bg-warning-bg text-warning',
  },
  'archived': {
    label: '已归档',
    className: 'bg-gray-100 text-ink-secondary',
  },
}

interface GuestbookStatusBadgeProps {
  status: GuestbookStatus
  size?: 'sm' | 'md'
}

export default function GuestbookStatusBadge({ status, size = 'md' }: GuestbookStatusBadgeProps) {
  const config = statusConfig[status]
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-xs'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClass} ${config.className}`}>
      {config.dot && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
      )}
      {config.label}
    </span>
  )
}
