import dayjs from 'dayjs'
import type { GbRecord } from '../../types'

/** 重名提醒弹窗（需求 F-2.21：支持多条重名记录编辑） */
export default function DuplicateAlert({
  records,
  newNote,
  onNewNoteChange,
  existingNotes,
  onExistingNoteChange,
  onConfirm,
  onCancel,
  onEditExisting
}: {
  records: GbRecord[]
  newNote: string
  onNewNoteChange: (note: string) => void
  existingNotes: Map<number, string>
  onExistingNoteChange: (id: number, note: string) => void
  onConfirm: () => void
  onCancel: () => void
  onEditExisting?: (record: GbRecord) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-[28rem] rounded-card bg-card p-6 shadow-xl">
        <h3 className="text-lg font-bold text-warning">⚠️ 重名提醒</h3>
        <p className="mt-2 text-sm text-ink-secondary">
          该礼簿中已存在 {records.length} 条同名记录，请确认是否为同一人：
        </p>

        {/* 重名记录列表 */}
        <div className="mt-3 max-h-48 overflow-y-auto rounded-btn bg-bg p-3">
          <ul className="flex flex-col gap-3 text-sm">
            {records.map((r) => (
              <li key={r.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.guest_name}</span>
                  <span className="text-ink-secondary">
                    ¥{(r.amount / 100).toFixed(2)} · {dayjs(r.record_time).format('MM-DD HH:mm')}
                  </span>
                </div>
                <input
                  value={existingNotes.get(r.id!) ?? ''}
                  onChange={(e) => onExistingNoteChange(r.id!, e.target.value)}
                  placeholder="备注（选填）"
                  className="h-9 w-full rounded-btn border border-line px-3 text-sm outline-none focus:border-primary"
                />
              </li>
            ))}
          </ul>
        </div>

        {/* 新增记录备注 */}
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">新增记录备注</span>
          <input
            value={newNote}
            onChange={(e) => onNewNoteChange(e.target.value)}
            placeholder="选填"
            className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
          />
        </label>

        <div className="mt-4 flex flex-col gap-2">
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-btn border border-line py-2.5 font-medium text-ink-secondary"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 rounded-btn bg-primary py-2.5 font-medium text-white"
            >
              确认新增
            </button>
          </div>
          {onEditExisting && records.length > 0 && (
            <button
              onClick={() => onEditExisting(records[0])}
              className="w-full rounded-btn border border-info py-2.5 text-sm font-medium text-info"
            >
              编辑原有记录（第一条）
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
