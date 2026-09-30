import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import ConfirmDialog from '../components/ConfirmDialog'
import Toast, { useToast } from '../components/Toast'
import GuestbookStatusBadge from '../components/guestbook/GuestbookStatusBadge'
import type { CollaborationInvitePending, Guestbook } from '../types'
import {
  useGuestbooks,
  useDailyRecords,
  useDailyRecordsSummary,
  useGuestbookSummary,
  useRecentGbRecords,
  usePendingInvites,
  useAcceptCollaborationInvite,
  useRejectCollaborationInvite,
} from '../hooks/useQueries'

const thisMonthStart = dayjs().startOf('month').format('YYYY-MM-DD')
const thisMonthEnd = dayjs().endOf('month').format('YYYY-MM-DD')
const thisYearStart = dayjs().startOf('year').format('YYYY-MM-DD')
const thisYearEnd = dayjs().endOf('year').format('YYYY-MM-DD')

function ActiveGuestbookItem({ gb }: { gb: Guestbook }) {
  const { data: summary } = useGuestbookSummary(gb.id!)
  const pct = summary && summary.total_records > 0
    ? Math.round((summary.checked_count / summary.total_records) * 100)
    : 0

  return (
    <li key={gb.id}>
      <Link
        to="/guestbooks/$id"
        params={{ id: String(gb.id) }}
        className="flex flex-col gap-2 rounded-btn bg-bg p-4 transition-colors hover:bg-primary/5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GuestbookStatusBadge status={gb.status} size="sm" />
            <span className="font-bold text-ink">{gb.name}</span>
          </div>
          <span className="rounded-btn bg-primary px-3 py-1.5 text-xs font-medium text-white">
            查看详情
          </span>
        </div>
        <div className="text-xs text-ink-secondary">
          {gb.event_type} · {gb.event_date}
          {summary && (
            <span className="ml-2">
              · {summary.total_records} 笔 ¥{(summary.total_amount / 100).toFixed(0)}
            </span>
          )}
        </div>
        {summary && summary.total_records > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-success transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-ink-secondary">对账 {pct}%</span>
          </div>
        )}
      </Link>
    </li>
  )
}

function RecentGuestbookRecords({ gb }: { gb: Guestbook }) {
  const { data: records = [] } = useRecentGbRecords(gb.id!, 5)

  if (records.length === 0) return null

  return (
    <section className="rounded-card bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-section-title">「{gb.name}」最近收款</h2>
        <Link
          to="/guestbooks/$id/collect"
          params={{ id: String(gb.id) }}
          className="text-sm text-info"
        >
          进入收礼 →
        </Link>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {records.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between rounded-btn bg-bg px-3 py-2.5 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">{r.guest_name}</span>
              <span className="text-xs text-ink-secondary">
                {r.payment_method === 'cash' ? '现金' : r.payment_method === 'wechat' ? '微信' : '其他'}
              </span>
            </div>
            <span className="font-bold text-ink">¥{(r.amount / 100).toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const invitePermissionLabels: Record<string, string> = {
  record: '仅记账',
  reconcile: '仅对账',
  both: '记账 + 对账',
}

/** 首页顶部待处理协作邀请（邀请信号，10 分钟有效，30s 轮询） */
function PendingInvitesBanner() {
  const { data: invites = [] } = usePendingInvites()
  const acceptMutation = useAcceptCollaborationInvite()
  const rejectMutation = useRejectCollaborationInvite()
  const { toast, showToast } = useToast()
  const [codeById, setCodeById] = useState<Record<number, string>>({})
  const [acceptingId, setAcceptingId] = useState<number | null>(null)
  const [rejectTarget, setRejectTarget] = useState<CollaborationInvitePending | null>(null)
  const [now, setNow] = useState(() => dayjs())

  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 1000)
    return () => clearInterval(timer)
  }, [])

  if (invites.length === 0) return null

  function handleAccept(invite: CollaborationInvitePending) {
    const code = (codeById[invite.id] || '').trim()
    if (!/^\d{6}$/.test(code)) {
      showToast('请输入 6 位数字邀请码')
      return
    }
    acceptMutation.mutate(
      { inviteId: invite.id, inviteCode: code },
      {
        onSuccess: (data) => {
          showToast(
            `已接受协作邀请，协作时段 ${dayjs(data.collaboration_start_at).format('MM-DD HH:mm')} ～ ${dayjs(data.collaboration_end_at).format('MM-DD HH:mm')}`,
          )
          setAcceptingId(null)
        },
        onError: (e) => showToast('接受失败：' + e.message),
      },
    )
  }

  function handleReject() {
    if (!rejectTarget) return
    rejectMutation.mutate(rejectTarget.id, {
      onSuccess: () => {
        showToast('已拒绝该协作邀请')
        setRejectTarget(null)
      },
      onError: (e) => showToast('操作失败：' + e.message),
    })
  }

  return (
    <section className="flex flex-col gap-3">
      {invites.map((invite) => {
        const remainSec = Math.max(0, dayjs(invite.signal_expires_at).diff(now, 'second'))
        const remainLabel =
          remainSec < 60 ? `${remainSec} 秒后消失` : `${Math.floor(remainSec / 60)} 分钟后消失`
        return (
          <div
            key={invite.id}
            className="rounded-card border border-info/40 bg-info/5 p-4 shadow-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                {invite.inviter_username} 邀请你协助管理「{invite.guestbook_name}」礼簿
              </p>
              <span className="text-xs text-info">邀请信号 {remainLabel}</span>
            </div>
            <p className="mt-1 text-xs text-ink-secondary">
              权限：{invitePermissionLabels[invite.permissions] || invite.permissions} ·
              接受后需输入邀请人告知的 6 位邀请码
            </p>

            {acceptingId === invite.id ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={codeById[invite.id] || ''}
                  onChange={(e) =>
                    setCodeById((prev) => ({ ...prev, [invite.id]: e.target.value.replace(/\D/g, '').slice(0, 6) }))
                  }
                  placeholder="输入 6 位邀请码"
                  inputMode="numeric"
                  className="h-10 w-40 rounded-btn border border-line bg-card px-3 text-center font-mono text-base tracking-widest outline-none focus:border-2 focus:border-primary"
                />
                <button
                  onClick={() => handleAccept(invite)}
                  disabled={acceptMutation.isPending}
                  className="rounded-btn bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {acceptMutation.isPending ? '确认中…' : '确认接受'}
                </button>
                <button
                  onClick={() => setAcceptingId(null)}
                  className="rounded-btn border border-line px-4 py-2.5 text-sm text-ink-secondary"
                >
                  返回
                </button>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setAcceptingId(invite.id)}
                  className="rounded-btn bg-primary px-5 py-2.5 text-sm font-semibold text-white"
                >
                  接受邀请
                </button>
                <button
                  onClick={() => setRejectTarget(invite)}
                  className="rounded-btn border border-line px-4 py-2.5 text-sm text-ink-secondary hover:border-danger hover:text-danger"
                >
                  拒绝
                </button>
              </div>
            )}
          </div>
        )
      })}

      <ConfirmDialog
        open={rejectTarget !== null}
        title="拒绝协作邀请"
        message="确定拒绝此协作邀请？"
        variant="warning"
        confirmLabel="拒绝"
        onConfirm={handleReject}
        onCancel={() => setRejectTarget(null)}
        loading={rejectMutation.isPending}
      />

      <Toast message={toast} onClose={() => showToast(null)} />
    </section>
  )
}

/** 首页 / 礼簿总览仪表板（需求 §6 首页） */
export default function DashboardPage() {
  const monthlyFilters = useMemo(() => ({ startDate: thisMonthStart, endDate: thisMonthEnd }), [])
  const yearlyFilters = useMemo(() => ({ startDate: thisYearStart, endDate: thisYearEnd }), [])
  const recentDailyFilters = useMemo(() => ({ limit: 5 }), [])

  const { data: monthSum } = useDailyRecordsSummary(monthlyFilters)
  const { data: yearSum } = useDailyRecordsSummary(yearlyFilters)
  const { data: allGuestbooks = [], isLoading: gbLoading } = useGuestbooks()
  const { data: recentDaily = [], isLoading: dailyLoading } = useDailyRecords(recentDailyFilters)

  const loading = gbLoading || dailyLoading

  const activeGuestbooks = useMemo(
    () => allGuestbooks.filter((g) => g.status === 'active').slice(0, 3),
    [allGuestbooks],
  )
  const completedGuestbooks = useMemo(
    () => allGuestbooks.filter((g) => g.status === 'closing' || g.status === 'archived').slice(0, 5),
    [allGuestbooks],
  )
  const firstActiveGb = activeGuestbooks[0] ?? null

  const monthly = monthSum ?? { total_out: 0, total_in: 0, net: 0 }
  const yearly = yearSum ?? { total_out: 0, total_in: 0, net: 0 }

  const formatAmount = (fen: number) => {
    const sign = fen >= 0 ? '' : '-'
    return `${sign}¥${Math.abs(fen / 100).toFixed(2)}`
  }

  return (
    <PageScaffold title="欢迎回来" description="您的礼金往来总览">
      <div className="flex flex-col gap-5">
        <PendingInvitesBanner />
        {loading ? (
        <p className="py-10 text-center text-ink-secondary">加载中…</p>
      ) : (
        <div className="flex flex-col gap-5">
          {/* ===== 本月收支卡片 ===== */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '本月送出', value: monthly.total_out, color: 'text-danger' },
              { label: '本月收到', value: monthly.total_in, color: 'text-success' },
              { label: '净差额', value: monthly.net, color: monthly.net >= 0 ? 'text-success' : 'text-danger' }
            ].map((card) => (
              <div key={card.label} className="min-w-0 rounded-card bg-card p-5 shadow-card">
                <div className="text-caption text-ink-secondary">{card.label}</div>
                <div className={`mt-2 break-all text-2xl font-bold xl:text-amount ${card.color}`}>{formatAmount(card.value)}</div>
              </div>
            ))}
          </div>

          {/* ===== 快捷入口 ===== */}
          <div className="flex flex-wrap gap-3">
            <Link
              to="/records/new"
              className="rounded-btn bg-primary px-6 py-3 font-semibold text-white"
            >
              ＋ 记一笔
            </Link>
            <Link
              to="/guestbooks/new"
              className="rounded-btn border border-primary px-6 py-3 font-semibold text-primary"
            >
              ＋ 新建礼簿
            </Link>
            <Link to="/accounts" className="rounded-btn border border-line px-6 py-3 font-semibold text-ink">
              系统账户设置
            </Link>
            <Link to="/family" className="rounded-btn border border-line px-6 py-3 font-semibold text-ink">
              家庭协作
            </Link>
          </div>

          {/* ===== 本年汇总 ===== */}
          <div className="rounded-card bg-card p-5 shadow-card">
            <h2 className="text-section-title">本年汇总</h2>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <div className="min-w-0 text-center">
                <div className="text-lg font-bold text-danger break-all">{formatAmount(yearly.total_out)}</div>
                <div className="text-xs text-ink-secondary">送出合计</div>
              </div>
              <div className="min-w-0 text-center">
                <div className="text-lg font-bold text-success break-all">{formatAmount(yearly.total_in)}</div>
                <div className="text-xs text-ink-secondary">收到合计</div>
              </div>
              <div className="min-w-0 text-center">
                <div className={`text-lg font-bold break-all ${yearly.net >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatAmount(yearly.net)}
                </div>
                <div className="text-xs text-ink-secondary">净差额</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* ===== 进行中的礼簿（含对账进度） ===== */}
            <section className="rounded-card bg-card p-6 shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="text-section-title">进行中的礼簿</h2>
                <Link to="/guestbooks" className="text-sm text-info">
                  查看全部 →
                </Link>
              </div>
              {activeGuestbooks.length === 0 ? (
                <p className="mt-4 py-4 text-center text-sm text-ink-secondary">
                  暂无进行中的礼簿
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {activeGuestbooks.map((gb) => (
                    <ActiveGuestbookItem key={gb.id} gb={gb} />
                  ))}
                </ul>
              )}
            </section>

            {/* ===== 最近日常记录 ===== */}
            <section className="rounded-card bg-card p-6 shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="text-section-title">最近日常记录</h2>
                <Link to="/records" className="text-sm text-info">
                  查看全部 →
                </Link>
              </div>
              {recentDaily.length === 0 ? (
                <p className="mt-4 py-4 text-center text-sm text-ink-secondary">
                  暂无记录，点击「记一笔」开始
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {recentDaily.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between rounded-btn bg-bg px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                            r.type === 'out'
                              ? 'bg-danger-bg text-danger'
                              : 'bg-success-bg text-success-deep'
                          }`}
                        >
                          {r.type === 'out' ? '送' : '收'}
                        </span>
                        <span className="font-medium text-ink">{r.person_name}</span>
                        <span className="text-xs text-ink-secondary">{r.event_type}</span>
                      </div>
                      <span
                        className={`font-bold ${
                          r.type === 'out' ? 'text-danger' : 'text-success'
                        }`}
                      >
                        {r.type === 'out' ? '-' : '+'}¥{(r.amount / 100).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* ===== 已完成礼簿（含合并入口） ===== */}
          {completedGuestbooks.length > 0 && (
            <section className="rounded-card bg-card p-6 shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="text-section-title">已归档的礼簿</h2>
                <Link to="/guestbooks" className="text-sm text-info">
                  查看全部 →
                </Link>
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {completedGuestbooks.map((gb) => (
                  <li key={gb.id} className="flex items-center justify-between rounded-btn bg-bg px-4 py-3">
                    <div>
                      <span className="font-medium text-ink">{gb.name}</span>
                      <span className="ml-2 text-xs text-ink-secondary">{gb.event_type} · {gb.event_date}</span>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        to="/guestbooks/$id"
                        params={{ id: String(gb.id) }}
                        className="rounded-btn border border-line px-3 py-1.5 text-xs font-medium text-ink-secondary hover:border-primary"
                      >
                        查看
                      </Link>
                      <button
                        className="rounded-btn border border-info px-3 py-1.5 text-xs font-medium text-info hover:bg-info/10"
                        title="合并到其他礼簿（即将推出）"
                        onClick={() => alert('合并向导功能即将推出')}
                      >
                        合并
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ===== 最近礼簿收礼（如果有进行中的礼簿） ===== */}
          {firstActiveGb && <RecentGuestbookRecords gb={firstActiveGb} />}
        </div>
          )}
      </div>
    </PageScaffold>
  )
}
