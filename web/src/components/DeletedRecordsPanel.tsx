import { useState } from 'react'
import dayjs from 'dayjs'
import Toast, { useToast } from './Toast'
import ConfirmDialog from './ConfirmDialog'
import type { GbRecord } from '../types'
import { useDeletedRecords, useRestoreGbRecord, usePaymentAccounts } from '../hooks/useQueries'
import { useAppStore } from '../store/appStore'

/**
 * 删除记录面板（回收站）
 * 查看本礼簿已删除的收礼记录，并支持恢复；恢复操作写入操作日志
 */
export default function DeletedRecordsPanel({ guestbookId }: { guestbookId: number }) {
  const { data: records = [], isLoading } = useDeletedRecords(guestbookId)
  const { data: accounts = [] } = usePaymentAccounts()
  const restoreMutation = useRestoreGbRecord()
  const { toast, showToast } = useToast()
  const operatorName = useAppStore((s) => s.operatorName)

  const [restoreTarget, setRestoreTarget] = useState<GbRecord | null>(null)
  const [restoreRemark, setRestoreRemark] = useState('')

  const fmt = (fen: number) => `¥${(fen / 100).toFixed(2)}`

  const handleRestore = () => {
    if (!restoreTarget?.id) return
    restoreMutation.mutate(
      { id: restoreTarget.id, remark: restoreRemark.trim() || undefined, operatorName: operatorName.trim() || undefined },
      {
        onSuccess: () => {
          showToast('记录已恢复')
          setRestoreTarget(null)
          setRestoreRemark('')
        },
        onError: (e) => showToast('恢复失败：' + e.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-secondary">
        共 {records.length} 条已删除记录，可恢复；所有恢复操作均记录到操作日志。
      </p>

      {isLoading ? (
        <p className="py-8 text-center text-ink-secondary">加载中…</p>
      ) : records.length === 0 ? (
        <p className="py-8 text-center text-ink-secondary">暂无已删除的记录</p>
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-card bg-card p-4 shadow-card opacity-80"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink">{r.guest_name}</span>
                  {r.agent_name && (
                    <span className="text-xs text-ink-secondary">（{r.agent_name} 代）</span>
                  )}
                  {r.is_private && (
                    <span className="rounded-full bg-info/10 px-1.5 py-0.5 text-xs text-info">隐私</span>
                  )}
                </div>
                <div className="text-xs text-ink-secondary">
                  {r.payment_method === 'cash' ? '现金' : r.payment_method === 'wechat' ? '微信' : '其他'}
                  {' · '}
                  {accounts.find((a) => a.id === r.account_id)?.name ?? '—'}
                  {' · '}
                  收礼 {dayjs(r.record_time).format('MM-DD HH:mm:ss')}
                  {r.deleted_at && ` · 删除于 ${dayjs(r.deleted_at).format('MM-DD HH:mm:ss')}`}
                  {r.operator_name && ` · ${r.operator_name}`}
                  {r.note && ` · ${r.note}`}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-ink-secondary line-through">{fmt(r.amount)}</span>
                <button
                  onClick={() => { setRestoreTarget(r); setRestoreRemark('') }}
                  className="rounded-btn border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
                >
                  恢复
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={restoreTarget !== null}
        title="恢复记录"
        message={`确定恢复 ${restoreTarget?.guest_name ?? ''} 的这条收礼记录吗？恢复后将重新出现在收礼记录中。`}
        variant="info"
        confirmLabel="恢复"
        onConfirm={handleRestore}
        onCancel={() => { setRestoreTarget(null); setRestoreRemark('') }}
        loading={restoreMutation.isPending}
        extraContent={
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">恢复备注（选填）</span>
            <input
              value={restoreRemark}
              onChange={(e) => setRestoreRemark(e.target.value)}
              maxLength={200}
              placeholder="例如：误删恢复"
              className="h-11 w-full rounded-btn border border-line px-4 text-sm outline-none focus:border-2 focus:border-primary"
            />
            <span className="text-xs text-ink-secondary">将记录到操作日志</span>
          </label>
        }
      />

      <Toast message={toast} onClose={() => showToast(null)} />
    </div>
  )
}
