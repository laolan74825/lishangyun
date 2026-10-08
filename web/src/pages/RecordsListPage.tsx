import { useState, useMemo } from 'react'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import ExportButton from '../components/ExportButton'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import RecordTypeTab from '../components/records/RecordTypeTab'
import type { DailyRecord, RecordType } from '../types'
import { exportDailyRecords } from '../lib/api-client'
import { eventTypeLabel } from '../lib/eventType'
import {
  useDailyRecords,
  useDailyRecordsSummary,
  useUpdateDailyRecord,
  useDeleteDailyRecord,
} from '../hooks/useQueries'
import { formatFen } from '../lib/format'

/** 明细列表页（需求 F-1.4：按时间倒序、筛选搜索、底部汇总） */
export default function RecordsListPage() {
  /* 筛选状态 */
  const [activeType, setActiveType] = useState<RecordType | 'all'>('all')
  const [keyword, setKeyword] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  /* 编辑弹窗 */
  const [editing, setEditing] = useState<DailyRecord | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editIsPrivate, setEditIsPrivate] = useState(false)

  /* 确认弹窗 */
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const { toast, showToast } = useToast()

  const filters = useMemo(() => ({
    type: activeType === 'all' ? undefined : activeType,
    keyword: keyword.trim() || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  }), [activeType, keyword, startDate, endDate])

  const { data: records = [], isLoading: loading } = useDailyRecords(filters)
  const { data: summary = { total_records: 0, total_out: 0, total_in: 0, net: 0 } } = useDailyRecordsSummary(filters)
  const updateMutation = useUpdateDailyRecord()
  const deleteMutation = useDeleteDailyRecord()

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => showToast('记录已删除'),
      onError: (e) => showToast('删除失败：' + e.message),
    })
    setDeletingId(null)
  }

  const openEdit = (r: DailyRecord) => {
    setEditing(r)
    setEditAmount((r.amount / 100).toString())
    setEditNote(r.note ?? '')
    setEditDate(r.event_date)
    setEditIsPrivate(r.is_private ?? false)
  }

  const handleEditSubmit = () => {
    if (!editing?.id) return
    const amountFen = Math.round(parseFloat(editAmount) * 100)
    if (isNaN(amountFen) || amountFen <= 0) {
      showToast('金额无效')
      return
    }
    updateMutation.mutate(
      {
        id: editing.id,
        changes: {
          amount: amountFen,
          note: editNote.trim() || undefined,
          event_date: editDate,
          is_private: editIsPrivate,
        },
      },
      {
        onSuccess: () => {
          showToast('记录已更新')
          setEditing(null)
        },
        onError: (e) => showToast('更新失败：' + e.message),
      },
    )
  }

  return (
    <PageScaffold
      title="明细"
      description="全部日常礼金往来记录"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-ink-secondary">
            共 {summary.total_records} 笔
          </span>
          <ExportButton
            mode="server"
            filename="日常记录.xlsx"
            exportFn={() => exportDailyRecords('xlsx', {
              type: activeType === 'all' ? undefined : activeType,
              start_date: startDate || undefined,
              end_date: endDate || undefined,
            })}
            label="导出"
          />
        </div>
      }
    >
      {/* 筛选栏 */}
      <div className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
        {/* 类型 Tab */}
        <RecordTypeTab value={activeType} onChange={setActiveType} />

        {/* 搜索 + 日期 */}
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索姓名、事由、备注…"
            className="h-11 rounded-btn border border-line px-4 text-sm outline-none focus:border-primary"
          />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            placeholder="开始日期"
            className="h-11 rounded-btn border border-line px-4 text-sm outline-none focus:border-primary"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            placeholder="结束日期"
            className="h-11 rounded-btn border border-line px-4 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '送出合计', value: summary.total_out, color: 'text-danger' },
          { label: '收到合计', value: summary.total_in, color: 'text-success' },
          { label: '净差额', value: summary.net, color: summary.net >= 0 ? 'text-success' : 'text-danger' }
        ].map((card) => (
          <div key={card.label} className="min-w-0 rounded-card bg-card p-4 text-center shadow-card">
            <div className="text-caption text-ink-secondary">{card.label}</div>
            <div className={`mt-1 break-all text-lg font-bold ${card.color}`}>
              {formatFen(card.value)}
            </div>
          </div>
        ))}
      </div>

      {/* 记录列表 */}
      {loading ? (
        <p className="py-10 text-center text-ink-secondary">加载中…</p>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <span className="text-4xl">📒</span>
          <p className="text-ink-secondary">暂无记录</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-card bg-card p-4 shadow-card"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.type === 'out'
                        ? 'bg-danger-bg text-danger'
                        : 'bg-success-bg text-success-deep'
                    }`}
                  >
                    {r.type === 'out' ? '送' : '收'}
                  </span>
                  <span className="font-bold text-ink">{r.person_name}</span>
                  {r.is_private && (
                    <span className="rounded-full bg-info/10 px-1.5 py-0.5 text-xs text-info">隐私</span>
                  )}
                  {r.phone && (
                    <span className="text-xs text-ink-secondary">{r.phone}</span>
                  )}
                </div>
                <div className="text-xs text-ink-secondary">
                  {eventTypeLabel(r.event_type)} · {r.event_date}
                  {r.payment_method && (
                    <span>
                      {' '}
                      · {r.payment_method === 'cash' ? '现金' : r.payment_method === 'wechat' ? '微信' : '其他'}
                    </span>
                  )}
                  {r.note && <span> · {r.note}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-lg font-bold ${
                    r.type === 'out' ? 'text-danger' : 'text-success'
                  }`}
                >
                  {r.type === 'out' ? '-' : '+'}${formatFen(r.amount)}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(r)}
                    className="rounded-btn px-2 py-1 text-xs text-info hover:bg-info/10"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => setDeletingId(r.id!)}
                    className="rounded-btn px-2 py-1 text-xs text-danger hover:bg-danger-bg"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 编辑弹窗 */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="编辑记录"
        actions={
          <>
            <button
              onClick={() => setEditing(null)}
              className="flex-1 rounded-btn border border-line py-2.5 font-medium text-ink-secondary"
            >
              取消
            </button>
            <button
              onClick={handleEditSubmit}
              disabled={updateMutation.isPending}
              className="flex-1 rounded-btn bg-primary py-2.5 font-medium text-white disabled:bg-disabled"
            >
              {updateMutation.isPending ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        {editing && (
          <>
            <p className="mt-1 text-sm text-ink-secondary">
              {editing.person_name} · {eventTypeLabel(editing.event_type)}
            </p>
            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">金额（元）</span>
              <input
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                inputMode="decimal"
                className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
              />
            </label>
            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">日期</span>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
              />
            </label>
            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">备注</span>
              <input
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
              />
            </label>
            <label className="mt-3 flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={editIsPrivate}
                onChange={(e) => setEditIsPrivate(e.target.checked)}
                className="h-5 w-5 rounded border-line accent-primary"
              />
              <div>
                <span className="text-sm font-medium text-ink">隐私记录</span>
                <span className="ml-1 text-xs text-ink-secondary">同步云端但仅本人可见</span>
              </div>
            </label>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={deletingId !== null}
        title="删除记录"
        message="确定删除这条记录吗？"
        variant="danger"
        confirmLabel="删除"
        onConfirm={() => deletingId && handleDelete(deletingId)}
        onCancel={() => setDeletingId(null)}
        loading={deleteMutation.isPending}
      />

      {/* Toast */}
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
