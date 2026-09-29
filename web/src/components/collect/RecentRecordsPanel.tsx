import dayjs from 'dayjs'
import type { GbRecord } from '../../types'
import { amountToChinese } from '../../lib/format'

/** 最近收款记录列表（分页） */
export default function RecentRecordsPanel({
  records,
  page,
  pageSize,
  onPageChange,
  selectedIds = [],
  onToggleSelect,
  onClearSelection
}: {
  records: GbRecord[]
  page: number
  pageSize: number
  onPageChange: (p: number) => void
  selectedIds?: number[]
  onToggleSelect?: (id: number) => void
  onClearSelection?: () => void
}) {
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize))
  // 最新的记录显示在最上面
  const sorted = [...records].sort((a, b) =>
    new Date(b.record_time).getTime() - new Date(a.record_time).getTime()
  )
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize)

  // 计算选中记录的合计金额
  const selectedRecords = records.filter((r) => selectedIds.includes(r.id!))
  const selectedCount = selectedRecords.length
  const selectedTotal = selectedRecords.reduce((sum, r) => sum + r.amount, 0)

  return (
    <div className="rounded-card bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-section-title">最近收款</h3>
        <span className="text-caption text-ink-secondary">
          第 {page} / {totalPages} 页
        </span>
      </div>
      {paged.length === 0 ? (
        <p className="mt-3 py-4 text-center text-sm text-ink-secondary">暂无记录</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {paged.map((r) => (
            <li
              key={r.id}
              className={`flex items-center justify-between rounded-btn px-3 py-2.5 text-sm ${
                r.check_status === 'checked' ? 'bg-success-bg/50' : 'bg-bg'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(r.id!)}
                  onChange={() => onToggleSelect?.(r.id!)}
                  className="h-4 w-4 accent-primary"
                />
                <div className="flex flex-col">
                  <span className="font-medium text-ink">
                    {r.guest_name}
                    {r.agent_name && (
                      <span className="text-ink-secondary">（{r.agent_name} 代）</span>
                    )}
                  </span>
                  <span className="text-caption text-ink-secondary">
                    {dayjs(r.record_time).format('HH:mm:ss')} ·{' '}
                    {r.payment_method === 'cash' ? '现金' : r.payment_method === 'wechat' ? '微信' : '其他'}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-bold text-ink">¥{(r.amount / 100).toFixed(2)}</span>
                {r.check_status === 'checked' && (
                  <span className="ml-1 text-xs text-success">✓ 已对账</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {selectedCount > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-btn bg-primary/10 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium text-primary">
              已勾选 {selectedCount} 条，合计 ¥{(selectedTotal / 100).toFixed(2)}
            </span>
            {onClearSelection && (
              <button
                onClick={onClearSelection}
                className="text-xs text-ink-secondary hover:text-danger"
              >
                取消选择
              </button>
            )}
          </div>
          <span className="text-xs text-ink-secondary">{amountToChinese(selectedTotal)}</span>
        </div>
      )}
      {totalPages > 1 && (
        <div className="mt-3 flex justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded-btn border border-line px-3 py-1 text-sm disabled:opacity-40"
          >
            上一页
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="rounded-btn border border-line px-3 py-1 text-sm disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}
