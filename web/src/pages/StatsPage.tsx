import { useState, useMemo } from 'react'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import MonthlyTrendChart from '../components/charts/MonthlyTrendChart'
import EventDistributionChart from '../components/charts/EventDistributionChart'
import GuestbookStatsTable from '../components/charts/GuestbookStatsTable'
import {
  useAllGuestbookSummaries,
  usePersonRanking,
  useMonthlyTrend,
  useEventDistribution,
  useGuestbookStats,
  useStatsOverview,
} from '../hooks/useQueries'

export default function StatsPage() {
  const { data: gbSummaries = [], isLoading: gbLoading } = useAllGuestbookSummaries()
  const { data: rankings = [], isLoading: rankLoading } = usePersonRanking(10)
  const { data: monthlyTrend = [], isLoading: trendLoading } = useMonthlyTrend()
  const { data: eventDist = [], isLoading: distLoading } = useEventDistribution()
  const { data: gbStats = [], isLoading: gbStatsLoading } = useGuestbookStats()
  const [year, setYear] = useState(dayjs().year().toString())

  // 年度总览：日常随礼 + 礼簿收礼（与首页总览同一口径）
  const yearFilters = useMemo(
    () => ({ startDate: `${year}-01-01`, endDate: `${year}-12-31` }),
    [year],
  )
  const { data: yearOverview, isLoading: yearLoading } = useStatsOverview(yearFilters)
  const loading = gbLoading || rankLoading || trendLoading || distLoading || gbStatsLoading || yearLoading

  const yearOut = yearOverview?.total_out ?? 0
  const yearIn = yearOverview?.total_in ?? 0

  const formatY = (fen: number) => `¥${(fen / 100).toFixed(2)}`

  return (
    <PageScaffold title="统计报表" description="礼金往来数据分析">
      {loading ? (
        <p className="py-10 text-center text-ink-secondary">加载中…</p>
      ) : (
        <div className="flex flex-col gap-5">
          {/* 年度总览 */}
          <div className="rounded-card bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="text-section-title">年度总览</h2>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="h-9 rounded-btn border border-line bg-white px-3 text-sm outline-none focus:border-primary"
              >
                {[2023, 2024, 2025, 2026].map((y) => (
                  <option key={y} value={y}>
                    {y}年
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-xs text-ink-secondary">收到含日常随礼与礼簿现场收礼</p>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <div className="min-w-0 text-center">
                <div className="break-all text-lg font-bold text-danger">{formatY(yearOut)}</div>
                <div className="text-xs text-ink-secondary">{year}年送出</div>
              </div>
              <div className="min-w-0 text-center">
                <div className="break-all text-lg font-bold text-success">{formatY(yearIn)}</div>
                <div className="text-xs text-ink-secondary">{year}年收到</div>
              </div>
              <div className="min-w-0 text-center">
                <div className={`break-all text-lg font-bold ${yearIn - yearOut >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatY(yearIn - yearOut)}
                </div>
                <div className="text-xs text-ink-secondary">净差额</div>
              </div>
            </div>
          </div>

          {/* 月度收支趋势（ECharts） */}
          <div className="rounded-card bg-card p-5 shadow-card">
            <h2 className="text-section-title">月度收支趋势</h2>
            <div className="mt-3">
              <MonthlyTrendChart data={monthlyTrend} />
            </div>
          </div>

          {/* 事由分布（ECharts） */}
          <div className="rounded-card bg-card p-5 shadow-card">
            <h2 className="text-section-title">按事由统计（收到）</h2>
            <div className="mt-3">
              <EventDistributionChart data={eventDist} />
            </div>
          </div>

          {/* 礼簿汇总（表格组件） */}
          <div className="rounded-card bg-card p-5 shadow-card">
            <h2 className="text-section-title">礼簿汇总</h2>
            <div className="mt-3">
              <GuestbookStatsTable data={gbStats} />
            </div>
          </div>

          {/* 对账进度报表（F-10.8） */}
          <div className="rounded-card bg-card p-5 shadow-card">
            <h2 className="text-section-title">对账进度总览</h2>
            {(() => {
              const totalRecords = gbSummaries.reduce((s, gb) => s + gb.total_records, 0)
              const totalChecked = gbSummaries.reduce((s, gb) => s + gb.checked_count, 0)
              const totalCheckedAmount = gbSummaries.reduce((s, gb) => s + gb.checked_amount, 0)
              const totalAmount = gbSummaries.reduce((s, gb) => s + gb.total_amount, 0)
              const pct = totalRecords > 0 ? Math.round((totalChecked / totalRecords) * 100) : 0
              return (
                <div className="mt-3">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-ink">{totalRecords}</div>
                      <div className="text-xs text-ink-secondary">总笔数</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-success">{totalChecked}</div>
                      <div className="text-xs text-ink-secondary">已对账</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-warning">{totalRecords - totalChecked}</div>
                      <div className="text-xs text-ink-secondary">未对账</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-info">{pct}%</div>
                      <div className="text-xs text-ink-secondary">完成率</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <span className="text-ink-secondary">金额对账：</span>
                    <span className="font-bold text-success">{formatY(totalCheckedAmount)}</span>
                    <span className="text-ink-secondary">/</span>
                    <span className="text-ink">{formatY(totalAmount)}</span>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* 人员往来排行（F-10.3） */}
          <div className="rounded-card bg-card p-5 shadow-card">
            <h2 className="text-section-title">人员往来排行 Top 10</h2>
            {rankings.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-secondary">暂无数据</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {rankings.map((r, idx) => (
                  <li
                    key={r.name}
                    className="flex items-center justify-between rounded-btn bg-bg px-4 py-2.5 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                          idx < 3 ? 'bg-primary text-white' : 'bg-gray-200 text-ink-secondary'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="font-medium text-ink">{r.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-danger">送 {formatY(r.total_out)}</span>
                      <span className="text-success">收 {formatY(r.total_in)}</span>
                      <span className={`font-bold ${r.net >= 0 ? 'text-success' : 'text-danger'}`}>
                        净 {formatY(r.net)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </PageScaffold>
  )
}
