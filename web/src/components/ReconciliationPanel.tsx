import { useState, useEffect, useCallback, useMemo } from 'react'
import dayjs from 'dayjs'
import Toast, { useToast } from './Toast'
import type { GbRecord, PaymentAccount } from '../types'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import {
  getGbRecordsByGuestbook,
  getPaymentAccounts,
  batchUpdateCheckStatus
} from '../lib/api-client'

/**
 * 对账管理面板（需求 F-7.x）
 * 嵌入 GuestbookDetailPage 的「对账」Tab
 */
export default function ReconciliationPanel({
  guestbookId,
  operatorName,
  clientId
}: {
  guestbookId: number
  operatorName: string
  clientId: string
}) {
  const [records, setRecords] = useState<GbRecord[]>([])
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  /* 筛选 */
  const [checkFilter, setCheckFilter] = useState<'all' | 'unchecked' | 'checked'>('all')
  const [accountFilter, setAccountFilter] = useState<number | ''>('')
  const [operatorFilter, setOperatorFilter] = useState('')

  const { toast, showToast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    const [recs, accs] = await Promise.all([
      getGbRecordsByGuestbook(guestbookId),
      getPaymentAccounts()
    ])
    setRecords(recs)
    setAccounts(accs)
    setLoading(false)
  }, [guestbookId])

  useEffect(() => {
    load()
  }, [load])

  /* 筛选后的记录 */
  const filtered = useMemo(() => {
    let list = records
    if (checkFilter === 'unchecked') list = list.filter((r) => r.check_status === 'unchecked')
    if (checkFilter === 'checked') list = list.filter((r) => r.check_status === 'checked')
    if (accountFilter) list = list.filter((r) => r.account_id === accountFilter)
    if (operatorFilter.trim()) {
      const k = operatorFilter.trim().toLowerCase()
      list = list.filter((r) => r.operator_name?.toLowerCase().includes(k))
    }
    return list
  }, [records, checkFilter, accountFilter, operatorFilter])

  /* 统计 */
  const summary = useMemo(() => {
    const total = records.length
    const checkedCount = records.filter((r) => r.check_status === 'checked').length
    const totalAmount = records.reduce((s, r) => s + r.amount, 0)
    const checkedAmount = records
      .filter((r) => r.check_status === 'checked')
      .reduce((s, r) => s + r.amount, 0)
    return { total, checkedCount, totalAmount, checkedAmount }
  }, [records])

  const progressPct = summary.total > 0 ? Math.round((summary.checkedCount / summary.total) * 100) : 0

  /* 选择操作 */
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id!)))
    }
  }

  /* 批量标记 */
  const handleBatchCheck = async (checked: boolean) => {
    if (selectedIds.size === 0) {
      showToast('请先选择记录')
      return
    }
    try {
      await batchUpdateCheckStatus(Array.from(selectedIds), checked ? 'checked' : 'unchecked', operatorName, clientId)
      showToast(checked ? `已标记 ${selectedIds.size} 笔为已对账` : `已取消 ${selectedIds.size} 笔对账标记`)
      setSelectedIds(new Set())
      await load()
    } catch (e) {
      showToast('操作失败：' + (e as Error).message)
    }
  }

  const fmt = (fen: number) => `¥${(fen / 100).toFixed(2)}`

  const accountName = (id?: number) => {
    if (!id) return '—'
    return accounts.find((a) => a.id === id)?.name ?? '—'
  }

  /* 键盘快捷键 */
  const reconcileShortcuts = useMemo(() => [
    { key: ' ', handler: () => { if (selectedIds.size > 0) handleBatchCheck(true) }, description: '标记已对账' },
    { key: 'a', ctrl: true, handler: toggleSelectAll, description: '全选/取消全选' },
  ], [selectedIds.size, handleBatchCheck, toggleSelectAll])

  useKeyboardShortcuts(reconcileShortcuts)

  return (
    <div className="flex flex-col gap-4">
      {/* 进度条 */}
      <div className="rounded-card bg-card p-5 shadow-card">
        <h3 className="text-section-title">对账进度</h3>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <span className="font-medium text-ink">
            已对账 {summary.checkedCount} 笔 / 总 {summary.total} 笔
          </span>
          <span className="text-ink-secondary">
            金额：{fmt(summary.checkedAmount)} / {fmt(summary.totalAmount)}
          </span>
          <span className="font-bold text-success">{progressPct}%</span>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-bg">
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap gap-2">
        <select
          value={checkFilter}
          onChange={(e) => setCheckFilter(e.target.value as 'all' | 'unchecked' | 'checked')}
          className="h-10 rounded-btn border border-line bg-white px-3 text-sm outline-none focus:border-primary"
        >
          <option value="all">全部记录</option>
          <option value="unchecked">仅未对账</option>
          <option value="checked">仅已对账</option>
        </select>
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value ? Number(e.target.value) : '')}
          className="h-10 rounded-btn border border-line bg-white px-3 text-sm outline-none focus:border-primary"
        >
          <option value="">全部账户</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input
          value={operatorFilter}
          onChange={(e) => setOperatorFilter(e.target.value)}
          placeholder="记账员筛选…"
          className="h-10 rounded-btn border border-line px-3 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* 批量操作 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => handleBatchCheck(true)}
          disabled={selectedIds.size === 0}
          className="rounded-btn bg-success px-4 py-2 text-sm font-medium text-white disabled:bg-disabled"
        >
          标记选中为已对账 ({selectedIds.size})
        </button>
        <button
          onClick={() => handleBatchCheck(false)}
          disabled={selectedIds.size === 0}
          className="rounded-btn border border-line px-4 py-2 text-sm font-medium text-ink-secondary disabled:opacity-40"
        >
          取消对账标记
        </button>
        <button
          onClick={toggleSelectAll}
          className="ml-auto text-sm text-info hover:underline"
        >
          {selectedIds.size === filtered.length ? '取消全选' : '全选当前'}
        </button>
      </div>

      {/* 记录列表 */}
      {loading ? (
        <p className="py-8 text-center text-ink-secondary">加载中…</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-ink-secondary">暂无匹配记录</p>
      ) : (
        <div className="flex flex-col gap-1">
          {filtered.map((r) => (
            <label
              key={r.id}
              className={`flex items-center gap-3 rounded-btn px-4 py-3 text-sm transition-colors ${
                selectedIds.has(r.id!) ? 'bg-primary/5' : 'bg-card hover:bg-bg'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(r.id!)}
                onChange={() => toggleSelect(r.id!)}
                className="h-4 w-4 accent-primary"
              />
              <span className="min-w-[80px] font-medium text-ink">{r.guest_name}</span>
              <span className="font-bold text-ink">{fmt(r.amount)}</span>
              <span className="text-xs text-ink-secondary">
                {r.payment_method === 'cash' ? '现金' : r.payment_method === 'wechat' ? '微信' : '其他'}
              </span>
              <span className="text-xs text-ink-secondary">{accountName(r.account_id)}</span>
              <span className="text-xs text-ink-secondary">{r.operator_name ?? '—'}</span>
              <span className="text-xs text-ink-secondary">
                {dayjs(r.record_time).format('HH:mm:ss')}
              </span>
              <span className="ml-auto">
                {r.check_status === 'checked' ? (
                  <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success-deep">
                    ✓ 已对账
                  </span>
                ) : (
                  <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink-secondary">
                    未对账
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      <Toast message={toast} onClose={() => showToast(null)} />
    </div>
  )
}
