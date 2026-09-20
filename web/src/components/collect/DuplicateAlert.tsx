import dayjs from 'dayjs'
import type { GbRecord } from '../../types'

/** 重名提醒弹窗（需求 F-2.21：增加「编辑原有记录」选项） */
export default function DuplicateAlert({
  records,
  onConfirm,
  onCancel,
  onEditExisting
}: {
  records: GbRecord[]
  onConfirm: () => void
  onCancel: () => void
  onEditExisting?: (record: GbRecord) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-[24rem] rounded-card bg-card p-6 shadow-xl">
        <h3 className="text-lg font-bold text-warning">⚠️ 重名提醒</h3>
        <p className="mt-2 text-sm text-ink-secondary">
          该礼簿中已存在同名记录，请确认是否为同一人：
        </p>
        <ul className="mt-3 max-h-40 overflow-y-auto rounded-btn bg-bg p-3 text-sm">
          {records.map((r) => (
            <li key={r.id} className="flex justify-between py-1">
              <span>{r.guest_name}</span>
              <span className="text-ink-secondary">
                ¥{(r.amount / 100).toFixed(2)} · {dayjs(r.record_time).format('MM-DD HH:mm')}
              </span>
            </li>
          ))}
        </ul>
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
              编辑原有记录
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
