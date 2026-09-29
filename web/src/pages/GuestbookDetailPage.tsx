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
import { useAppStore } from '../store/appStore'
import type { GbRecord } from '../types'
import { limitLevel } from '../types'
import { closeGuestbook, archiveGuestbook, exportGuestbook } from '../lib/api-client'
import ExportButton from '../components/ExportButton'
import {
  useGuestbook,
  useGbRecords,
  usePaymentAccounts,
  useGuestbookSummary,
  useAccountSummary,
  useTerminalSettings,
  useUpdateGuestbook,
  useUpdateGbRecord,
  useDeleteGbRecord,
} from '../hooks/useQueries'

type TabKey = 'records' | 'reconciliation' | 'accounts' | 'logs'

/** 礼簿详情页（需求 §6 礼簿管理） */
export default function GuestbookDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const guestbookId = Number(id)
  const clientId = useAppStore((s) => s.clientId)
  const operatorName = useAppStore((s) => s.operatorName)

  const [activeTab, setActiveTab] = useState<TabKey>('records')
  const { toast, showToast } = useToast()

  const { data: guestbook } = useGuestbook(guestbookId)
  const { data: records = [] } = useGbRecords(guestbookId)
  const { data: accounts = [] } = usePaymentAccounts()
  const { data: summary = { total_records: 0, total_amount: 0, checked_count: 0, unchecked_count: 0 } } = useGuestbookSummary(guestbookId)
  const { data: accSummary = new Map() } = useAccountSummary(guestbookId)
  const { data: terminalSettings } = useTerminalSettings(guestbookId, clientId)

  const updateGbMutation = useUpdateGuestbook()
  const updateRecordMutation = useUpdateGbRecord()
  const deleteRecordMutation = useDeleteGbRecord()

  /* 编辑弹窗 */
  const [editing, setEditing] = useState<GbRecord | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editIsPrivate, setEditIsPrivate] = useState(false)

  /* 确认弹窗 */
  const [confirmAction, setConfirmAction] = useState<{
    type: 'complete' | 'archive' | 'deleteRecord'
    recordId?: number
  } | null>(null)

  /* 结束礼簿（进入收尾中） */
  const handleComplete = async () => {
    try {
      await closeGuestbook(guestbookId)
      showToast('礼簿已结束，进入收尾阶段')
    } catch (e) {
      showToast('操作失败：' + (e as Error).message)
    }
    setConfirmAction(null)
  }

  /* 归档礼簿 */
  const handleArchive = async () => {
    try {
      await archiveGuestbook(guestbookId)
      showToast('礼簿已归档')
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
      { id: recordId, operatorName, clientId },
      {
        onSuccess: () => showToast('记录已删除'),
        onError: (e) => showToast('删除失败：' + e.message),
      },
    )
    setConfirmAction(null)
  }

  /* 账户统计 */
  const accountStats = useMemo(() => {
    const stats: { account: (typeof accounts)[number]; count: number; total: number; remaining?: number; level?: ReturnType<typeof limitLevel> }[] = []
    for (const [accId, data] of accSummary.entries()) {
      const acc = accounts.find((a) => a.id === accId)
      if (!acc) continue
      if (data.total_amount === 0) continue
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
                className="rounded-btn border border-warning px-4 py-2 text-sm font-medium text-warning"
              >
                结束礼簿
              </button>
            </>
          )}
          {guestbook?.status === 'closing' && (
            <button
              onClick={() => setConfirmAction({ type: 'archive' })}
              className="rounded-btn border border-warning px-4 py-2 text-sm font-medium text-warning"
            >
              归档礼簿
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

        {/* 当前账户统计 */}
        <div className="grid grid-cols-3 gap-3">
          {(['cash', 'wechat', 'other'] as const).map((pm) => {
            const label = pm === 'cash' ? '当前现金账户' : pm === 'wechat' ? '当前微信账户' : '其他'
            const defaultId = pm === 'cash'
              ? terminalSettings?.default_cash_account
              : pm === 'wechat'
                ? terminalSettings?.default_wechat_account
                : undefined

            let amount = 0
            if (pm === 'other') {
              // 其他类型：所有活跃的非现金/微信账户
              amount = Array.from(accSummary.entries())
                .filter(([aid]) => {
                  const ac = accounts.find((a) => a.id === aid)
                  return ac && ac.is_active && ac.type !== 'cash' && ac.type !== 'wechat'
                })
                .reduce((s, [, v]) => s + v.total_amount, 0)
            } else if (defaultId) {
              // 现金/微信：只统计默认账户（且必须是活跃的）
              const account = accounts.find((a) => a.id === defaultId && a.is_active && a.type === pm)
              if (account) {
                amount = accSummary.get(defaultId)?.total_amount ?? 0
              }
            }

            return (
              <div key={pm} className="rounded-card bg-card p-3 text-center shadow-card">
                <div className="text-caption text-ink-secondary">{label}</div>
                <div className="mt-1 text-base font-bold text-ink">
                  {amount > 0 ? `¥${(amount / 100).toFixed(0)}` : '—'}
                </div>
              </div>
            )
          })}
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
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmAction?.type === 'complete'}
        title="结束礼簿"
        message="确定结束该礼簿吗？结束后将进入收尾阶段，可进行补录和修正。"
        variant="warning"
        confirmLabel="结束"
        onConfirm={handleComplete}
        onCancel={() => setConfirmAction(null)}
        loading={updateGbMutation.isPending}
      />
      <ConfirmDialog
        open={confirmAction?.type === 'archive'}
        title="归档礼簿"
        message="确定归档该礼簿吗？归档后将锁定为只读，不可修改。"
        variant="warning"
        confirmLabel="归档"
        onConfirm={handleArchive}
        onCancel={() => setConfirmAction(null)}
        loading={updateGbMutation.isPending}
      />
      <ConfirmDialog
        open={confirmAction?.type === 'deleteRecord'}
        title="删除记录"
        message="确定删除该收礼记录吗？"
        variant="danger"
        confirmLabel="删除"
        onConfirm={() => confirmAction?.recordId && handleDeleteRecord(confirmAction.recordId)}
        onCancel={() => setConfirmAction(null)}
        loading={deleteRecordMutation.isPending}
      />

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
