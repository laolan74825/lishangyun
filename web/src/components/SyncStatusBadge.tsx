import { useSyncStore } from '../store/syncStore'

export default function SyncStatusBadge() {
  const { status, pendingCount, conflictCount, lastSyncedAt } = useSyncStore()

  const config = {
    idle: { label: '就绪', color: 'bg-gray-100 text-gray-600' },
    syncing: { label: '同步中', color: 'bg-info/20 text-info' },
    synced: { label: '已同步', color: 'bg-success-bg text-success-deep' },
    offline: { label: '离线', color: 'bg-warning-bg text-warning' },
    error: { label: '同步失败', color: 'bg-danger-bg text-danger' },
    conflict: { label: `${conflictCount} 个冲突`, color: 'bg-danger-bg text-danger' },
  }

  const { label, color } = config[status]

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins} 分钟前`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} 小时前`
    return `${Math.floor(diffMins / 1440)} 天前`
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`rounded-full px-3 py-1 text-xs font-medium ${color}`}>
        {label}
        {pendingCount > 0 && status !== 'conflict' && status !== 'error' && (
          <span className="ml-1">({pendingCount} 待同步)</span>
        )}
      </div>
      {lastSyncedAt && status === 'synced' && (
        <span className="text-xs text-ink-secondary">{formatTime(lastSyncedAt)}</span>
      )}
    </div>
  )
}
