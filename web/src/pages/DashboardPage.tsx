import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import GuestbookStatusBadge from '../components/guestbook/GuestbookStatusBadge'
import type { Guestbook } from '../types'
import {
  useGuestbooks,
  useDailyRecords,
  useDailyRecordsSummary,
  useGuestbookSummary,
  useRecentGbRecords,
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
    </PageScaffold>
  )
}
