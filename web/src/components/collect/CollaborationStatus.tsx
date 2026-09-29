import { useAppStore } from '../../store/appStore'

const statusConfig = {
  synced: { label: '已同步', dot: 'bg-success' },
  syncing: { label: '同步中', dot: 'bg-warning' },
  offline: { label: '离线', dot: 'bg-ink-secondary' },
} as const

export default function CollaborationStatus() {
  const syncStatus = useAppStore((s) => s.syncStatus)
  const config = statusConfig[syncStatus]

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-bg px-3 py-1 text-xs">
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      <span className="text-ink-secondary">{config.label}</span>
    </div>
  )
}
