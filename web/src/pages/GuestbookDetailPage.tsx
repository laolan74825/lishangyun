import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import ReconciliationPanel from '../components/ReconciliationPanel'
import OperationLogPanel from '../components/OperationLogPanel'
import { useAppStore } from '../store/appStore'
import type { Guestbook, GbRecord, PaymentAccount } from '../types'
import { limitLevel } from '../types'
import {
  getGuestbookById,
  getGbRecordsByGuestbook,
  getPaymentAccounts,
  guestbookSummary,
  accountSummary,
  completeGuestbook,
  deleteGuestbook,
  updateGbRecord,
  deleteGbRecord
} from '../lib/api-client'

type TabKey = 'records' | 'reconciliation' | 'accounts' | 'logs'

/** 礼簿详情页（需求 §6 礼簿管理） */
export default function GuestbookDetailPage() {
  const { id } = useParams<{ id: string }>()
  const guestbookId = Number(id)
  const navigate = useNavigate()
  const clientId = useAppStore((s) => s.clientId)
  const operatorName = useAppStore((s) => s.operatorName)

  const [guestbook, setGuestbook] = useState<Guestbook | undefined>()
  const [records, setRecords] = useState<GbRecord[]>([])
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [summary, setSummary] = useState({ total_records: 0, total_amount: 0, checked_count: 0, unchecked_count: 0 })
  const [accSummary, setAccSummary] = useState<Map<number, { record_count: number; total_amount: number }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('records')
  const { toast, showToast } = useToast()

  /* 编辑弹窗 */
  const [editing, setEditing] = useState<GbRecord | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!guestbookId || isNaN(guestbookId)) return
    setLoading(true)
    const [gb, recs, accs, sum, accSum] = await Promise.all([
      getGuestbookById(guestbookId),
      getGbRecordsByGuestbook(guestbookId),
      getPaymentAccounts(),
      guestbookSummary(guestbookId),
      accountSummary(guestbookId)
    ])
    setGuestbook(gb)
    setRecords(recs)
    setAccounts(accs)
    setSummary(sum)
    setAccSummary(accSum)
    setLoading(false)
  }, [guestbookId])

  useEffect(() => {
    load()
  }, [load])

  /* 结束礼簿 */
  const handleComplete = async () => {
    if (!confirm('确定结束该礼簿吗？结束后将锁定不可再记账。')) return
    try {
      await completeGuestbook(guestbookId)
      showToast('礼簿已结束')
      await load()
    } catch (e) {
      showToast('操作失败：' + (e as Error).message)
    }
  }

  /* 删除礼簿 */
  const handleDelete = async () => {
    if (!confirm('确定删除该礼簿吗？此操作不可恢复。')) return
    try {
      await deleteGuestbook(guestbookId)
      showToast('礼簿已删除')
      navigate('/guestbooks')
    } catch (e) {
      showToast('删除失败：' + (e as Error).message)
    }
  }

  /* 编辑记录 */
  const openEdit = (r: GbRecord) => {
    setEditing(r)
    setEditAmount((r.amount / 100).toString())
    setEditNote(r.note ?? '')
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
      await updateGbRecord(editing.id, {
        amount: amountFen,
        note: editNote.trim() || undefined
      }, operatorName, clientId)
      showToast('记录已更新')
      setEditing(null)
      await load()
    } catch (e) {
      showToast('更新失败：' + (e as Error).message)
    } finally {
      setEditSubmitting(false)
    }
  }

  /* 删除记录 */
  const handleDeleteRecord = async (recordId: number) => {
    if (!confirm('确定删除该收礼记录吗？')) return
    try {
      await deleteGbRecord(recordId, operatorName, clientId)
      showToast('记录已删除')
      await load()
    } catch (e) {
      showToast('删除失败：' + (e as Error).message)
    }
  }

  /* 账户统计 */
  const accountStats = useMemo(() => {
    const stats: { account: PaymentAccount; count: number; total: number; remaining?: number; level?: ReturnType<typeof limitLevel> }[] = []
    for (const [accId, data] of accSummary.entries()) {
      const acc = accounts.find((a) => a.id === accId)
      if (!acc) continue
      if (data.total_amount === 0) continue // F-6.6 零金额账户隐藏
      const item: typeof stats[0] = { account: acc, count: data.record_count, total: data.total_amount }
      if (acc.type === 'wechat') {
        const received = accSummary.get(accId)?.total_amount ?? 0
        const remaining = acc.daily_limit - received
        item.remaining = remaining
        item.level = limitLevel(remaining)
      }
      stats.push(item)
    }
    return stats.sort((a, b) => b.total - a.total)
  }, [accSummary, accounts])

  const fmt = (fen: number) => `¥${(fen / 100).toFixed(2)}`

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'records', label: '收礼记录' },
    { key: 'reconciliation', label: '对账管理' },
    { key: 'accounts', label: '账户统计' },
    { key: 'logs', label: '操作日志' }
  ]

  if (!guestbookId || isNaN(guestbookId)) {
    return (
      <PageScaffold title="礼簿详情">
        <p className="py-10 text-center text-ink-secondary">礼簿 ID 无效</p>
      </PageScaffold>
    )
  }

  return (
    <PageScaffold
      title={guestbook?.name ?? '礼簿详情'}
      description={`${guestbook?.event_type ?? ''} · ${guestbook?.event_date ?? ''}`}
      actions={
        <div className="flex items-center gap-2">
          {guestbook?.status === '收礼中' && (
            <>
              <Link
                to={`/guestbooks/${guestbookId}/collect`}
                className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-white"
              >
                进入收礼
              </Link>
              <button
                onClick={handleComplete}
                className="rounded-btn border border-warning px-4 py-2 text-sm font-medium text-warning"
              >
                结束礼簿
              </button>
            </>
          )}
          {summary.total_records === 0 && (
            <button
              onClick={handleDelete}
              className="rounded-btn border border-danger px-4 py-2 text-sm font-medium text-danger"
            >
              删除
            </button>
          )}
        </div>
      }
    >
      {loading ? (
        <p className="py-10 text-center text-ink-secondary">加载中…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* 汇总卡片 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-card bg-card p-4 text-center shadow-card">
              <div className="text-caption text-ink-secondary">总金额</div>
              <div className="mt-1 text-lg font-bold text-ink">{fmt(summary.total_amount)}</div>
            </div>
            <div className="rounded-card bg-card p-4 text-center shadow-card">
              <div className="text-caption text-ink-secondary">总笔数</div>
              <div className="mt-1 text-lg font-bold text-ink">{summary.total_records}</div>
            </div>
            <div className="rounded-card bg-card p-4 text-center shadow-card">
              <div className="text-caption text-ink-secondary">已对账</div>
              <div className="mt-1 text-lg font-bold text-success">{summary.checked_count}</div>
            </div>
            <div className="rounded-card bg-card p-4 text-center shadow-card">
              <div className="text-caption text-ink-secondary">未对账</div>
              <div className="mt-1 text-lg font-bold text-warning">{summary.unchecked_count}</div>
            </div>
          </div>

          {/* 状态标签 */}
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                guestbook?.status === '收礼中'
                  ? 'bg-success-bg text-success-deep'
                  : 'bg-bg text-ink-secondary'
              }`}
            >
              {guestbook?.status}
            </span>
            {guestbook?.completed_at && (
              <span className="text-xs text-ink-secondary">
                完成于 {dayjs(guestbook.completed_at).format('YYYY-MM-DD HH:mm')}
              </span>
            )}
          </div>

          {/* Tab 切换 */}
          <div className="flex rounded-btn bg-bg p-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 rounded-btn py-2.5 text-sm font-semibold transition-colors ${
                  activeTab === tab.key ? 'bg-primary text-white' : 'text-ink-secondary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 内容 */}
          {activeTab === 'records' && (
            <div className="flex flex-col gap-2">
              {records.length === 0 ? (
                <p className="py-8 text-center text-ink-secondary">暂无收礼记录</p>
              ) : (
                records.map((r) => (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between rounded-card bg-card p-4 shadow-card ${
                      r.check_status === 'checked' ? 'border-l-4 border-l-success' : ''
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink">{r.guest_name}</span>
                        {r.agent_name && (
                          <span className="text-xs text-ink-secondary">（{r.agent_name} 代）</span>
                        )}
                        {r.check_status === 'checked' && (
                          <span className="rounded-full bg-success-bg px-1.5 py-0.5 text-xs text-success-deep">✓</span>
                        )}
                      </div>
                      <div className="text-xs text-ink-secondary">
                        {r.payment_method === 'cash' ? '现金' : r.payment_method === 'wechat' ? '微信' : '其他'}
                        {' · '}
                        {accounts.find((a) => a.id === r.account_id)?.name ?? '—'}
                        {' · '}
                        {dayjs(r.record_time).format('HH:mm:ss')}
                        {r.operator_name && ` · ${r.operator_name}`}
                        {r.note && ` · ${r.note}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-ink">{fmt(r.amount)}</span>
                      {guestbook?.status === '收礼中' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEdit(r)}
                            className="rounded-btn px-2 py-1 text-xs text-info hover:bg-info/10"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(r.id!)}
                            className="rounded-btn px-2 py-1 text-xs text-danger hover:bg-danger-bg"
                          >
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'reconciliation' && (
            <ReconciliationPanel
              guestbookId={guestbookId}
              operatorName={operatorName}
              clientId={clientId}
            />
          )}

          {activeTab === 'accounts' && (
            <div className="flex flex-col gap-4">
              {accountStats.length === 0 ? (
                <p className="py-8 text-center text-ink-secondary">暂无收款数据</p>
              ) : (
                <>
                  {accountStats.map((s) => (
                    <div key={s.account.id} className="rounded-card bg-card p-5 shadow-card">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{s.account.type === 'cash' ? '💵' : '💚'}</span>
                          <span className="font-bold text-ink">{s.account.name}</span>
                          {s.level === 'warning' && (
                            <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs text-warning">
                              限额紧张
                            </span>
                          )}
                          {s.level === 'exhausted' && (
                            <span className="rounded-full bg-danger-bg px-2 py-0.5 text-xs text-danger">
                              已限额
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-ink">{fmt(s.total)}</div>
                          <div className="text-xs text-ink-secondary">{s.count} 笔</div>
                        </div>
                      </div>
                      {s.account.type === 'wechat' && s.remaining !== undefined && (
                        <div className="mt-2 text-xs text-ink-secondary">
                          限额 {fmt(s.account.daily_limit)} · 剩余 {fmt(s.remaining)}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="rounded-card bg-card p-5 text-center shadow-card">
                    <div className="text-caption text-ink-secondary">合计</div>
                    <div className="mt-1 text-2xl font-bold text-ink">
                      {fmt(summary.total_amount)}
                    </div>
                    <div className="text-sm text-ink-secondary">
                      {summary.total_records} 笔
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <OperationLogPanel guestbookId={guestbookId} />
          )}
        </div>
      )}

      {/* 编辑弹窗 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-[24rem] rounded-card bg-card p-6 shadow-xl">
            <h3 className="text-lg font-bold text-ink">编辑收礼记录</h3>
            <p className="mt-1 text-sm text-ink-secondary">
              {editing.guest_name} · {dayjs(editing.record_time).format('HH:mm:ss')}
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

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
