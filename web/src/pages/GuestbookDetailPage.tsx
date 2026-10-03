import { useState, useMemo } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import GuestbookStatusBadge from '../components/guestbook/GuestbookStatusBadge'
import ReconciliationPanel from '../components/ReconciliationPanel'
import OperationLogPanel from '../components/OperationLogPanel'
import DeletedRecordsPanel from '../components/DeletedRecordsPanel'
import { useAppStore } from '../store/appStore'
import type { GbRecord } from '../types'
import { limitLevel } from '../types'
import { exportGuestbook } from '../lib/api-client'
import ExportButton from '../components/ExportButton'
import {
  useGuestbook,
  useGbRecords,
  usePaymentAccounts,
  useGuestbookSummary,
  useAccountsReceivedSummary,
  useUpdateGbRecord,
  useDeleteGbRecord,
  useCloseGuestbook,
  useReopenGuestbook,
  useArchiveGuestbook,
  useUnarchiveGuestbook,
} from '../hooks/useQueries'

type TabKey = 'records' | 'reconciliation' | 'accounts' | 'trash' | 'logs'

/** 礼簿详情页（需求 §6 礼簿管理） */
export default function GuestbookDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const guestbookId = Number(id)
  const clientId = useAppStore((s) => s.clientId)
  const operatorName = useAppStore((s) => s.operatorName)

  const [activeTab, setActiveTab] = useState<TabKey>('records')
  const [recordKeyword, setRecordKeyword] = useState('')
  const { toast, showToast } = useToast()

  const { data: guestbook } = useGuestbook(guestbookId)
  const { data: records = [] } = useGbRecords(guestbookId)
  const { data: accounts = [] } = usePaymentAccounts()
  const { data: summary = { total_records: 0, total_amount: 0, checked_count: 0, unchecked_count: 0 } } = useGuestbookSummary(guestbookId)
  // 账户统计口径：各账户在"收礼中"礼簿的收款汇总（账户统一后跨礼簿）
  const { data: receivedSummary = [] } = useAccountsReceivedSummary('active')

  const updateRecordMutation = useUpdateGbRecord()
  const deleteRecordMutation = useDeleteGbRecord()

  /* 编辑弹窗 */
  const [editing, setEditing] = useState<GbRecord | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editIsPrivate, setEditIsPrivate] = useState(false)
  const [editRemark, setEditRemark] = useState('')

  /* 确认弹窗 */
  const [confirmAction, setConfirmAction] = useState<{
    type: 'complete' | 'archive' | 'reopen' | 'unarchive' | 'deleteRecord'
    recordId?: number
  } | null>(null)
  const [closingSummary, setClosingSummary] = useState('')
  const [deleteRemark, setDeleteRemark] = useState('')

  const closeMutation = useCloseGuestbook()
  const reopenMutation = useReopenGuestbook()
  const archiveMutation = useArchiveGuestbook()
  const unarchiveMutation = useUnarchiveGuestbook()

  /* 结束礼簿（进入收尾中），可填写收礼总结说明 */
  const handleComplete = async () => {
    try {
      await closeMutation.mutateAsync({ id: guestbookId, summary: closingSummary })
      showToast('礼簿已结束，进入收尾阶段')
      setClosingSummary('')
    } catch (e) {
      showToast('操作失败：' + (e as Error).message)
    }
    setConfirmAction(null)
  }

  /* 返回收礼中（收尾中 → 收礼中） */
  const handleReopen = async () => {
    try {
      await reopenMutation.mutateAsync(guestbookId)
      showToast('礼簿已返回收礼中')
    } catch (e) {
      showToast('操作失败：' + (e as Error).message)
    }
    setConfirmAction(null)
  }

  /* 归档礼簿 */
  const handleArchive = async () => {
    try {
      await archiveMutation.mutateAsync(guestbookId)
      showToast('礼簿已归档')
    } catch (e) {
      showToast('操作失败：' + (e as Error).message)
    }
    setConfirmAction(null)
  }

  /* 恢复为收尾中（已归档 → 收尾中） */
  const handleUnarchive = async () => {
    try {
      await unarchiveMutation.mutateAsync(guestbookId)
      showToast('礼簿已恢复为收尾中')
    } catch (e) {
      showToast('操作失败：' + (e as Error).message)
    }
    setConfirmAction(null)
  }

  /* 编辑记录 */
  const openEdit = (r: GbRecord) => {
    setEditing(r)
    setEditAmount((r.amount / 100).toString())
    setEditNote(r.note ?? '')
    setEditIsPrivate(r.is_private ?? false)
    setEditRemark('')
  }

  const handleEditSubmit = () => {
    if (!editing?.id) return
    const amountFen = Math.round(parseFloat(editAmount) * 100)
    if (isNaN(amountFen) || amountFen <= 0) {
      showToast('金额无效')
      return
    }
    updateRecordMutation.mutate(
      {
        id: editing.id,
        changes: {
          amount: amountFen,
          note: editNote.trim() || undefined,
          is_private: editIsPrivate,
        },
        operatorName,
        clientId,
        remark: editRemark.trim() || undefined,
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

  /* 删除记录 */
  const handleDeleteRecord = (recordId: number) => {
    deleteRecordMutation.mutate(
      { id: recordId, operatorName, clientId, remark: deleteRemark.trim() || undefined },
      {
        onSuccess: () => {
          showToast('记录已删除')
          setDeleteRemark('')
        },
        onError: (e) => showToast('删除失败：' + e.message),
      },
    )
    setConfirmAction(null)
  }

  /* 账户统计：各账户在"收礼中"礼簿的收款（含今日已收，用于微信限额） */
  const accountStats = useMemo(() => {
    const stats: {
      account: (typeof accounts)[number]
      count: number
      total: number
      todayReceived: number
      remaining?: number
      level?: ReturnType<typeof limitLevel>
    }[] = []
    for (const item of receivedSummary) {
      const acc = accounts.find((a) => a.id === item.account_id)
      if (!acc) continue
      const entry: typeof stats[0] = {
        account: acc,
        count: item.record_count,
        total: item.total_amount,
        todayReceived: item.today_received,
      }
      if (acc.type === 'wechat') {
        const remaining = acc.daily_limit - item.today_received
        entry.remaining = remaining
        entry.level = limitLevel(remaining)
      }
      stats.push(entry)
    }
    return stats.sort((a, b) => b.total - a.total)
  }, [receivedSummary, accounts])

  const accountStatsTotal = useMemo(
    () => accountStats.reduce((s, x) => s + x.total, 0),
    [accountStats],
  )

  const fmt = (fen: number) => `¥${(fen / 100).toFixed(2)}`

  /* 收礼记录查询：按宾客姓名、电话、代送人、记账员、备注模糊匹配 */
  const filteredRecords = useMemo(() => {
    const k = recordKeyword.trim().toLowerCase()
    if (!k) return records
    return records.filter((r) =>
      [r.guest_name, r.phone, r.agent_name, r.operator_name, r.note]
        .some((f) => f?.toLowerCase().includes(k)),
    )
  }, [records, recordKeyword])

  const filteredAmount = useMemo(
    () => filteredRecords.reduce((s, r) => s + r.amount, 0),
    [filteredRecords],
  )

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'records', label: '收礼记录' },
    { key: 'reconciliation', label: '对账管理' },
    { key: 'accounts', label: '账户统计' },
    { key: 'trash', label: '删除记录' },
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
          {guestbook && (
            <ExportButton
              mode="server"
              filename={`礼簿_${guestbook.name}.xlsx`}
              exportFn={() => exportGuestbook(guestbookId)}
              label="导出礼簿"
            />
          )}
          {guestbook?.status === 'active' && (
            <>
              <Link
                to="/guestbooks/$id/collect"
                params={{ id: String(guestbookId) }}
                className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-white"
              >
                进入收礼
              </Link>
              <button
                onClick={() => setConfirmAction({ type: 'complete' })}
                disabled={summary.unchecked_count > 0}
                title={summary.unchecked_count > 0 ? `还有 ${summary.unchecked_count} 笔未对账，全部对账后才能结束` : undefined}
                className="rounded-btn border border-warning px-4 py-2 text-sm font-medium text-warning disabled:cursor-not-allowed disabled:border-disabled disabled:text-disabled disabled:hover:bg-transparent"
              >
                结束礼簿
              </button>
            </>
          )}
          {/* 收尾中可继续补录宾客记录（F-2.8 收尾期补录） */}
          {guestbook?.status === 'closing' && (
            <Link
              to="/guestbooks/$id/collect"
              params={{ id: String(guestbookId) }}
              className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              进入补录
            </Link>
          )}
          {guestbook?.status === 'closing' && (
            <>
              <button
                onClick={() => setConfirmAction({ type: 'reopen' })}
                className="rounded-btn border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
              >
                返回收礼中
              </button>
              <button
                onClick={() => setConfirmAction({ type: 'archive' })}
                className="rounded-btn border border-warning px-4 py-2 text-sm font-medium text-warning"
              >
                归档礼簿
              </button>
            </>
          )}
          {guestbook?.status === 'archived' && (
            <button
              onClick={() => setConfirmAction({ type: 'unarchive' })}
              className="rounded-btn border border-warning px-4 py-2 text-sm font-medium text-warning hover:bg-warning/10"
            >
              恢复收尾中
            </button>
          )}
        </div>
      }
    >
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
          {guestbook && <GuestbookStatusBadge status={guestbook.status} />}
          {guestbook?.closing_at && (
            <span className="text-xs text-ink-secondary">
              结束于 {dayjs(guestbook.closing_at).format('YYYY-MM-DD HH:mm')}
            </span>
          )}
          {guestbook?.archived_at && (
            <span className="text-xs text-ink-secondary">
              归档于 {dayjs(guestbook.archived_at).format('YYYY-MM-DD HH:mm')}
            </span>
          )}
        </div>
        {guestbook?.closing_summary && (
          <div className="rounded-card bg-card p-4 shadow-card">
            <div className="text-caption text-ink-secondary">收礼总结</div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{guestbook.closing_summary}</p>
          </div>
        )}

        {/* 当前账户统计 */}
        <div className="grid grid-cols-3 gap-3">
          {(() => {
            // 当前账户：系统当前账户（每种类型 is_active=true 的默认账户）；
            // 曾经收过款、但不是当前账户的（含现金/微信/其他）全部计入「其他」
            const currentCashId = accounts.find((a) => a.type === 'cash' && a.is_active && !a.is_disabled)?.id
            const currentWechatId = accounts.find((a) => a.type === 'wechat' && a.is_active && !a.is_disabled)?.id
            const cashAmount = records
              .filter((r) => r.payment_method === 'cash' && r.account_id === currentCashId)
              .reduce((s, r) => s + r.amount, 0)
            const wechatAmount = records
              .filter((r) => r.payment_method === 'wechat' && r.account_id === currentWechatId)
              .reduce((s, r) => s + r.amount, 0)
            const otherAmount = records
              .filter((r) => r.payment_method !== 'cash' || r.account_id !== currentCashId)
              .filter((r) => r.payment_method !== 'wechat' || r.account_id !== currentWechatId)
              .reduce((s, r) => s + r.amount, 0)

            const cards = [
              { label: '当前现金账户', amount: cashAmount, title: '当前收银员（礼簿默认/系统激活的现金账户）实收合计' },
              { label: '当前微信账户', amount: wechatAmount, title: '当前微信账户（礼簿默认/系统激活）实收合计' },
              { label: '其他', amount: otherAmount, title: '曾经收款、现在不是当前账户的金额合计（含现金、微信及其他支付方式）' },
            ]
            return cards.map((c) => (
              <div key={c.label} className="rounded-card bg-card p-3 text-center shadow-card" title={c.title}>
                <div className="text-caption text-ink-secondary">{c.label}</div>
                <div className="mt-1 text-base font-bold text-ink">
                  {c.amount > 0 ? `¥${(c.amount / 100).toFixed(0)}` : '—'}
                </div>
              </div>
            ))
          })()}
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
            {/* 记录查询 */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  value={recordKeyword}
                  onChange={(e) => setRecordKeyword(e.target.value)}
                  placeholder="查询收礼记录：宾客姓名、电话、代送人、记账员、备注…"
                  className="h-11 w-full rounded-btn border border-line px-4 pr-9 text-sm outline-none focus:border-2 focus:border-primary"
                />
                {recordKeyword && (
                  <button
                    onClick={() => setRecordKeyword('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-secondary hover:bg-bg"
                    title="清空查询"
                  >
                    ✕
                  </button>
                )}
              </div>
              {recordKeyword.trim() && (
                <span className="whitespace-nowrap text-sm text-ink-secondary">
                  匹配 {filteredRecords.length} 笔 · 共 {fmt(filteredAmount)}
                </span>
              )}
            </div>
            {records.length === 0 ? (
              <p className="py-8 text-center text-ink-secondary">暂无收礼记录</p>
            ) : filteredRecords.length === 0 ? (
              <p className="py-8 text-center text-ink-secondary">没有匹配「{recordKeyword.trim()}」的记录</p>
            ) : (
              filteredRecords.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between rounded-card bg-card p-4 shadow-card ${
                    r.check_status === 'checked' ? 'border-l-4 border-l-success' : ''
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink">{r.guest_name}</span>
                      {r.is_private && (
                        <span className="rounded-full bg-info/10 px-1.5 py-0.5 text-xs text-info">隐私</span>
                      )}
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
                    {guestbook?.status === 'active' && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(r)}
                          className="rounded-btn px-2 py-1 text-xs text-info hover:bg-info/10"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => setConfirmAction({ type: 'deleteRecord', recordId: r.id! })}
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
            <p className="text-sm text-ink-secondary">
              各账户在<span className="font-medium text-ink">收礼中礼簿</span>的收款合计（账户统一后跨礼簿统计）；微信限额按今日已收计算。
            </p>
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
                        {s.account.is_active && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">当前账户</span>
                        )}
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
                        限额 {fmt(s.account.daily_limit)} · 今日已收 {fmt(s.todayReceived)} · 剩余 {fmt(s.remaining)}
                      </div>
                    )}
                  </div>
                ))}
                <div className="rounded-card bg-card p-5 text-center shadow-card">
                  <div className="text-caption text-ink-secondary">收礼中礼簿收款合计</div>
                  <div className="mt-1 text-2xl font-bold text-ink">
                    {fmt(accountStatsTotal)}
                  </div>
                  <div className="text-sm text-ink-secondary">
                    {accountStats.reduce((n, x) => n + x.count, 0)} 笔
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <OperationLogPanel guestbookId={guestbookId} />
        )}
        {activeTab === 'trash' && (
          <DeletedRecordsPanel guestbookId={guestbookId} />
        )}
      </div>

      {/* 编辑弹窗 */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="编辑收礼记录"
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
              disabled={updateRecordMutation.isPending}
              className="flex-1 rounded-btn bg-primary py-2.5 font-medium text-white disabled:bg-disabled"
            >
              {updateRecordMutation.isPending ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        {editing && (
          <>
            <p className="text-sm text-ink-secondary">
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
            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">修改备注（选填）</span>
              <input
                value={editRemark}
                onChange={(e) => setEditRemark(e.target.value)}
                maxLength={200}
                placeholder="例如：金额录入错误，已核对后修正"
                className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
              />
              <span className="text-xs text-ink-secondary">将记录到操作日志，便于日后追溯修改原因</span>
            </label>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmAction?.type === 'complete'}
        title="结束收礼"
        message="确定结束收礼吗？结束后礼簿进入收尾阶段，可进行补录和修正；进行中的协助收礼任务将被中止，待接受和协作中的邀请会被撤销。"
        variant="warning"
        confirmLabel="结束收礼"
        onConfirm={handleComplete}
        onCancel={() => { setConfirmAction(null); setClosingSummary('') }}
        loading={closeMutation.isPending}
        extraContent={
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">收礼总结说明（选填）</span>
            <textarea
              value={closingSummary}
              onChange={(e) => setClosingSummary(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="例如：宴席共收礼金若干、现金已交接给某某、特殊情况说明…"
              className="w-full rounded-btn border border-line px-3 py-2 text-sm outline-none focus:border-2 focus:border-primary"
            />
            <span className="text-right text-xs text-ink-secondary">{closingSummary.length}/2000</span>
          </label>
        }
      />
      <ConfirmDialog
        open={confirmAction?.type === 'reopen'}
        title="返回收礼中"
        message="确定将礼簿返回收礼中状态吗？返回后可继续正常收礼。"
        variant="warning"
        confirmLabel="返回收礼中"
        onConfirm={handleReopen}
        onCancel={() => setConfirmAction(null)}
        loading={reopenMutation.isPending}
      />
      <ConfirmDialog
        open={confirmAction?.type === 'archive'}
        title="归档礼簿"
        message="确定归档该礼簿吗？归档后将锁定为只读，不可修改。"
        variant="warning"
        confirmLabel="归档"
        onConfirm={handleArchive}
        onCancel={() => setConfirmAction(null)}
        loading={archiveMutation.isPending}
      />
      <ConfirmDialog
        open={confirmAction?.type === 'unarchive'}
        title="恢复为收尾中"
        message="将该礼簿从已归档恢复为收尾中？恢复后可以补录和修正记录，确认无误后可重新归档。"
        variant="warning"
        confirmLabel="恢复"
        onConfirm={handleUnarchive}
        onCancel={() => setConfirmAction(null)}
        loading={unarchiveMutation.isPending}
      />
      <ConfirmDialog
        open={confirmAction?.type === 'deleteRecord'}
        title="删除记录"
        message="确定删除该收礼记录吗？删除后可填写备注说明原因，将记录到操作日志。"
        variant="danger"
        confirmLabel="删除"
        onConfirm={() => confirmAction?.recordId && handleDeleteRecord(confirmAction.recordId)}
        onCancel={() => { setConfirmAction(null); setDeleteRemark('') }}
        loading={deleteRecordMutation.isPending}
        extraContent={
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">删除备注（选填）</span>
            <input
              value={deleteRemark}
              onChange={(e) => setDeleteRemark(e.target.value)}
              maxLength={200}
              placeholder="例如：重复录入的记录"
              className="h-11 w-full rounded-btn border border-line px-4 text-sm outline-none focus:border-2 focus:border-primary"
            />
          </label>
        }
      />

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
