import { useSyncStore, type SyncConflict } from '../store/syncStore'
import { resolveConflictUseLocal, resolveConflictUseRemote, resolveConflictDelete } from '../lib/sync-engine'
import { formatFen } from '../lib/format'

const TABLE_LABELS: Record<string, string> = {
  gb_records: '收礼记录',
  daily_records: '日常记录',
  persons: '人员',
}

const CONFLICT_TYPE_LABELS: Record<string, string> = {
  update_update: '双方均修改',
  update_delete: '一方修改、一方删除',
  create_create: '重复创建',
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') {
    if (key === 'amount' && typeof value === 'number') return formatFen(value)
    return String(value)
  }
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

function getDisplayFields(conflict: SyncConflict): string[] {
  const skip = new Set(['id', 'owner_id', 'sync_version', 'is_deleted', 'deleted_at', 'created_at', 'updated_at', '_syncedAt', '_pendingSync', '_updatedAt', '_deleted'])
  const keys = new Set<string>()
  for (const k of Object.keys(conflict.local)) {
    if (!skip.has(k)) keys.add(k)
  }
  for (const k of Object.keys(conflict.remote)) {
    if (!skip.has(k)) keys.add(k)
  }
  return Array.from(keys)
}

const FIELD_LABELS: Record<string, string> = {
  guest_name: '宾客姓名',
  amount: '金额',
  payment_method: '支付方式',
  guestbook_id: '礼簿',
  person_id: '人员',
  type: '类型',
  event_date: '日期',
  name: '姓名',
  phone: '电话',
  relation_tag: '关系',
  record_time: '时间',
  note: '备注',
  is_private: '隐私',
}

function ConflictCard({ conflict }: { conflict: SyncConflict }) {
  const fields = getDisplayFields(conflict)

  return (
    <div className="rounded-card border border-danger/30 bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">
            {TABLE_LABELS[conflict.table] || conflict.table}
          </span>
          <span className="text-xs text-ink-secondary">
            {CONFLICT_TYPE_LABELS[conflict.conflict_type] || conflict.conflict_type}
          </span>
        </div>
        <span className="text-xs text-ink-secondary">
          {new Date(conflict.detected_at).toLocaleTimeString()}
        </span>
      </div>

      <div className="mb-4 overflow-hidden rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg text-xs text-ink-secondary">
              <th className="px-3 py-2 text-left font-medium">字段</th>
              <th className="px-3 py-2 text-left font-medium">本地版本</th>
              <th className="px-3 py-2 text-left font-medium">远程版本</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => {
              const localVal = conflict.local[field]
              const remoteVal = conflict.remote[field]
              const isDiff = JSON.stringify(localVal) !== JSON.stringify(remoteVal)
              return (
                <tr key={field} className={isDiff ? 'bg-warning-bg/30' : ''}>
                  <td className="px-3 py-1.5 text-ink-secondary">{FIELD_LABELS[field] || field}</td>
                  <td className={`px-3 py-1.5 ${isDiff ? 'font-medium text-ink' : 'text-ink-secondary'}`}>
                    {formatFieldValue(field, localVal)}
                  </td>
                  <td className={`px-3 py-1.5 ${isDiff ? 'font-medium text-ink' : 'text-ink-secondary'}`}>
                    {formatFieldValue(field, remoteVal)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => resolveConflictUseLocal(conflict.id)}
          className="flex-1 rounded-btn bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
        >
          保留本地
        </button>
        <button
          onClick={() => resolveConflictUseRemote(conflict.id)}
          className="flex-1 rounded-btn border border-line bg-card px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-bg"
        >
          使用远程
        </button>
        <button
          onClick={() => resolveConflictDelete(conflict.id)}
          className="rounded-btn border border-danger/30 px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-bg"
        >
          放弃
        </button>
      </div>
    </div>
  )
}

export default function ConflictResolutionPanel() {
  const conflicts = useSyncStore((s) => s.conflicts)
  const clearConflicts = useSyncStore((s) => s.clearConflicts)

  if (conflicts.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-danger">
          {conflicts.length} 个同步冲突需要处理
        </h3>
        <button
          onClick={clearConflicts}
          className="text-xs text-ink-secondary hover:text-ink"
        >
          全部忽略
        </button>
      </div>
      {conflicts.map((conflict) => (
        <ConflictCard key={conflict.id} conflict={conflict} />
      ))}
    </div>
  )
}
