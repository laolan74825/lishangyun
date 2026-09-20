import { useState, useEffect, useCallback } from 'react'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import type { DailyRecord, RecordType } from '../types'
import {
  getDailyRecords,
  dailyRecordsSummary,
  updateDailyRecord,
  deleteDailyRecord
} from '../lib/api-client'

/** 明细列表页（需求 F-1.4：按时间倒序、筛选搜索、底部汇总） */
export default function RecordsListPage() {
  const [records, setRecords] = useState<DailyRecord[]>([])
  const [summary, setSummary] = useState({ total_records: 0, total_out: 0, total_in: 0, net: 0 })
  const [loading, setLoading] = useState(true)

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
  const [editSubmitting, setEditSubmitting] = useState(false)

  const { toast, showToast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    const type = activeType === 'all' ? undefined : activeType
    const opts = {
      type,
      keyword: keyword.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined
    }
    const [list, sum] = await Promise.all([
      getDailyRecords(opts),
      dailyRecordsSummary(opts)
    ])
    setRecords(list)
    setSummary(sum)
    setLoading(false)
  }, [activeType, keyword, startDate, endDate])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这条记录吗？')) return
    try {
      await deleteDailyRecord(id)
      showToast('记录已删除')
      await load()
    } catch (e) {
      showToast('删除失败：' + (e as Error).message)
    }
  }

  const openEdit = (r: DailyRecord) => {
    setEditing(r)
    setEditAmount((r.amount / 100).toString())
    setEditNote(r.note ?? '')
    setEditDate(r.event_date)
  }

  const handleEditSubmit = async () => {
    if (!editing?.id) return
    const amountFen = Math.round(parseFloat(editAmount) * 100)
    if (isNaN(amountFen) || amountFen <= 0) {
      showToast('金额无效')
      return
    }
    setEditSubmitting(true)
    try {
      await updateDailyRecord(editing.id, {
        amount: amountFen,
        note: editNote.trim() || undefined,
        event_date: editDate
      })
      showToast('记录已更新')
      setEditing(null)
      await load()
    } catch (e) {
      showToast('更新失败：' + (e as Error).message)
    } finally {
      setEditSubmitting(false)
    }
  }

  const typeTabs: { value: RecordType | 'all'; label: string }[] = [
    { value: 'all', label: '全部' },
    { value: 'out', label: '送出去' },
    { value: 'in', label: '收进来' }
  ]

  return (
    <PageScaffold
      title="明细"
      description="全部日常礼金往来记录"
      actions={
        <div className="flex items-center gap-2">
          <span className="text-caption text-ink-secondary">
            共 {summary.total_records} 笔
          </span>
        </div>
      }
    >
      {/* 筛选栏 */}
      <div className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
        {/* 类型 Tab */}
        <div className="flex rounded-btn bg-bg p-1">
          {typeTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveType(tab.value)}
              className={`flex-1 rounded-btn py-2 text-sm font-semibold transition-colors ${
                activeType === tab.value ? 'bg-primary text-white' : 'text-ink-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

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
          <div key={card.label} className="rounded-card bg-card p-4 text-center shadow-card">
            <div className="text-caption text-ink-secondary">{card.label}</div>
            <div className={`mt-1 text-lg font-bold ${card.color}`}>
              {card.value >= 0 ? '' : '-'}¥{Math.abs(card.value / 100).toFixed(2)}
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
                  {r.phone && (
                    <span className="text-xs text-ink-secondary">{r.phone}</span>
                  )}
                </div>
                <div className="text-xs text-ink-secondary">
                  {r.event_type} · {r.event_date}
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
                  {r.type === 'out' ? '-' : '+'}¥{(r.amount / 100).toFixed(2)}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(r)}
                    className="rounded-btn px-2 py-1 text-xs text-info hover:bg-info/10"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(r.id!)}
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
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[24rem] rounded-card bg-card p-6 shadow-xl">
            <h3 className="text-lg font-bold text-ink">编辑记录</h3>
            <p className="mt-1 text-sm text-ink-secondary">
              {editing.person_name} · {editing.event_type}
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

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 rounded-btn border border-line py-2.5 font-medium text-ink-secondary"
              >
                取消
              </button>
              <button
                onClick={handleEditSubmit}
                disabled={editSubmitting}
                className="flex-1 rounded-btn bg-primary py-2.5 font-medium text-white disabled:bg-disabled"
              >
                {editSubmitting ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
