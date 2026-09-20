import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import type { Guestbook, DailyRecord } from '../types'
import {
  getAllGuestbooks,
  getDailyRecords,
  dailyRecordsSummary,
  getRecentRecords,
  guestbookSummary
} from '../lib/api-client'

/** 首页 / 礼簿总览仪表板（需求 §6 首页） */
export default function DashboardPage() {
  const [loading, setLoading] = useState(true)

  // 收支总览
  const [monthly, setMonthly] = useState({ total_out: 0, total_in: 0, net: 0 })
  const [yearly, setYearly] = useState({ total_out: 0, total_in: 0, net: 0 })

  // 进行中的礼簿（含对账进度）
  const [activeGuestbooks, setActiveGuestbooks] = useState<(Guestbook & { summary?: Awaited<ReturnType<typeof guestbookSummary>> })[]>([])

  // 已完成的礼簿
  const [completedGuestbooks, setCompletedGuestbooks] = useState<Guestbook[]>([])

  // 最近记录
  const [recentDaily, setRecentDaily] = useState<DailyRecord[]>([])
  const [recentGuestbook, setRecentGuestbook] = useState<{
    gb: Guestbook | null
    records: Awaited<ReturnType<typeof getRecentRecords>>
  }>({ gb: null, records: [] })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const thisMonthStart = dayjs().startOf('month').format('YYYY-MM-DD')
      const thisMonthEnd = dayjs().endOf('month').format('YYYY-MM-DD')
      const thisYearStart = dayjs().startOf('year').format('YYYY-MM-DD')
      const thisYearEnd = dayjs().endOf('year').format('YYYY-MM-DD')

      const [monthSum, yearSum, allGuestbooks, daily] = await Promise.all([
        dailyRecordsSummary({ startDate: thisMonthStart, endDate: thisMonthEnd }),
        dailyRecordsSummary({ startDate: thisYearStart, endDate: thisYearEnd }),
        getAllGuestbooks(),
        getDailyRecords({ limit: 5 })
      ])

      setMonthly({
        total_out: monthSum.total_out,
        total_in: monthSum.total_in,
        net: monthSum.net
      })
      setYearly({
        total_out: yearSum.total_out,
        total_in: yearSum.total_in,
        net: yearSum.net
      })

      const active = allGuestbooks.filter((g) => g.status === '收礼中')
      const completed = allGuestbooks.filter((g) => g.status === '已完成')
      setCompletedGuestbooks(completed.slice(0, 5))

      // 加载进行中礼簿的对账进度
      const activeWithSummary = await Promise.all(
        active.slice(0, 3).map(async (gb) => {
          const sum = gb.id ? await guestbookSummary(gb.id) : undefined
          return { ...gb, summary: sum }
        })
      )
      setActiveGuestbooks(activeWithSummary)

      setRecentDaily(daily)

      // 取第一个进行中的礼簿的最近记录
      if (active.length > 0 && active[0].id) {
        const rec = await getRecentRecords(active[0].id, 5)
        setRecentGuestbook({ gb: active[0], records: rec })
      } else {
        setRecentGuestbook({ gb: null, records: [] })
      }
    } catch (e) {
      console.error('Dashboard load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
              <div key={card.label} className="rounded-card bg-card p-5 shadow-card">
                <div className="text-caption text-ink-secondary">{card.label}</div>
                <div className={`mt-2 text-amount ${card.color}`}>{formatAmount(card.value)}</div>
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
              账户设置
            </Link>
            <Link to="/settings" className="rounded-btn border border-line px-6 py-3 font-semibold text-ink">
              加入协作
            </Link>
          </div>

          {/* ===== 本年汇总 ===== */}
          <div className="rounded-card bg-card p-5 shadow-card">
            <h2 className="text-section-title">本年汇总</h2>
            <div className="mt-3 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-bold text-danger">{formatAmount(yearly.total_out)}</div>
                <div className="text-xs text-ink-secondary">送出合计</div>
              </div>
              <div>
                <div className="text-lg font-bold text-success">{formatAmount(yearly.total_in)}</div>
                <div className="text-xs text-ink-secondary">收到合计</div>
              </div>
              <div>
                <div className={`text-lg font-bold ${yearly.net >= 0 ? 'text-success' : 'text-danger'}`}>
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
                  {activeGuestbooks.map((gb) => {
                    const pct = gb.summary && gb.summary.total_records > 0
                      ? Math.round((gb.summary.checked_count / gb.summary.total_records) * 100)
                      : 0
                    return (
                      <li key={gb.id}>
                        <Link
                          to={`/guestbooks/${gb.id}`}
                          className="flex flex-col gap-2 rounded-btn bg-bg p-4 transition-colors hover:bg-primary/5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="relative flex h-2.5 w-2.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
                              </span>
                              <span className="font-bold text-ink">{gb.name}</span>
                            </div>
                            <span className="rounded-btn bg-primary px-3 py-1.5 text-xs font-medium text-white">
                              查看详情
                            </span>
                          </div>
                          <div className="text-xs text-ink-secondary">
                            {gb.event_type} · {gb.event_date}
                            {gb.summary && (
                              <span className="ml-2">
                                · {gb.summary.total_records} 笔 ¥{(gb.summary.total_amount / 100).toFixed(0)}
                              </span>
                            )}
                          </div>
                          {/* 对账进度条 */}
                          {gb.summary && gb.summary.total_records > 0 && (
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
                  })}
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
                <h2 className="text-section-title">已完成的礼簿</h2>
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
                        to={`/guestbooks/${gb.id}`}
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
          {recentGuestbook.gb && recentGuestbook.records.length > 0 && (
            <section className="rounded-card bg-card p-6 shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="text-section-title">「{recentGuestbook.gb.name}」最近收款</h2>
                <Link
                  to={`/guestbooks/${recentGuestbook.gb.id}/collect`}
                  className="text-sm text-info"
                >
                  进入收礼 →
                </Link>
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {recentGuestbook.records.map((r) => (
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
          )}
        </div>
      )}
    </PageScaffold>
  )
}
