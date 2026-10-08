import { useState, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import MonthlyTrendChart from '../components/charts/MonthlyTrendChart'
import EventDistributionChart from '../components/charts/EventDistributionChart'
import GuestbookStatsTable from '../components/charts/GuestbookStatsTable'
import { relationTagLabel } from '../lib/api-client'
import { formatFen } from '../lib/format'
import {
  useAllGuestbookSummaries,
  usePersonRanking,
  useMonthlyTrend,
  useEventDistribution,
  useStatsOverview,
} from '../hooks/useQueries'

/** 卡片内加载占位 */
function CardLoading() {
  return <p className="py-6 text-center text-sm text-ink-secondary">加载中…</p>
}

/** 分段切换按钮组 */
function PillGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-0.5 rounded-btn bg-bg p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
            value === o.value ? 'bg-white font-semibold text-ink shadow-sm' : 'text-ink-secondary hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const navBtnCls =
  'flex h-8 w-8 items-center justify-center rounded-btn border border-line bg-white text-lg text-ink-secondary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40'

export default function StatsPage() {
  const navigate = useNavigate()
  const currentYear = dayjs().year()
  const minYear = currentYear - 10
  const maxYear = currentYear + 1

  const [year, setYear] = useState(currentYear)
  const [trendMonths, setTrendMonths] = useState<12 | 24 | 36>(12)
  const [distDirection, setDistDirection] = useState<'in' | 'out'>('in')
  const [rankSort, setRankSort] = useState<'net' | 'out' | 'in'>('net')
  const [rankLimit, setRankLimit] = useState(10)

  const { data: gbSummaries = [], isLoading: gbSumLoading } = useAllGuestbookSummaries()
  const { data: rankings = [], isLoading: rankLoading } = usePersonRanking(rankLimit, rankSort)
  const { data: monthlyTrend = [], isLoading: trendLoading } = useMonthlyTrend(trendMonths)
  const { data: eventDist = [], isLoading: distLoading } = useEventDistribution(distDirection)

  // 年度总览：日常随礼 + 礼簿收礼（与首页总览同一口径）
  const yearFilters = useMemo(
    () => ({ startDate: `${year}-01-01`, endDate: `${year}-12-31` }),
    [year],
  )
  const { data: yearOverview, isLoading: yearLoading } = useStatsOverview(yearFilters)
  // 全量累计（不传日期 = 所有年份）
  const { data: totalOverview, isLoading: totalLoading } = useStatsOverview({})

  const yearOut = yearOverview?.total_out ?? 0
  const yearIn = yearOverview?.total_in ?? 0
  const yearNet = yearOverview?.net_with_adjustment ?? 0
  const yearAdj = yearOverview?.adjustment_total ?? 0
  const totalNet = totalOverview?.net_with_adjustment ?? 0
  const totalAdj = totalOverview?.adjustment_total ?? 0

  const netColor = (v: number) => (v >= 0 ? 'text-success' : 'text-danger')

  return (
    <PageScaffold title="统计报表" description="礼金往来数据分析">
      <div className="flex flex-col gap-5">
        {/* 年度总览 */}
        <div className="rounded-card bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">年度总览</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="上一年"
                disabled={year <= minYear}
                onClick={() => setYear((y) => Math.max(minYear, y - 1))}
                className={navBtnCls}
              >
                ‹
              </button>
              <span className="w-16 text-center text-sm font-semibold text-ink">{year}年</span>
              <button
                type="button"
                aria-label="下一年"
                disabled={year >= maxYear}
                onClick={() => setYear((y) => Math.min(maxYear, y + 1))}
                className={navBtnCls}
              >
                ›
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-secondary">
            收到含日常随礼与礼簿现场收礼；净差额已含差额调整
          </p>
          {yearLoading || totalLoading ? (
            <CardLoading />
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="min-w-0 text-center">
                  <div className="break-all text-lg font-bold text-danger">{formatFen(yearOut)}</div>
                  <div className="text-xs text-ink-secondary">{year}年送出</div>
                </div>
                <div className="min-w-0 text-center">
                  <div className="break-all text-lg font-bold text-success">{formatFen(yearIn)}</div>
                  <div className="text-xs text-ink-secondary">{year}年收到</div>
                </div>
                <div className="min-w-0 text-center">
                  <div className={`break-all text-lg font-bold ${netColor(yearNet)}`}>{formatFen(yearNet)}</div>
                  <div className="text-xs text-ink-secondary">本年净差额</div>
                </div>
                <div className="min-w-0 text-center">
                  <div className={`break-all text-lg font-bold ${netColor(totalNet)}`}>{formatFen(totalNet)}</div>
                  <div className="text-xs text-ink-secondary">累计净差额</div>
                </div>
              </div>
              {(yearAdj !== 0 || totalAdj !== 0) && (
                <p className="mt-2 text-xs text-ink-secondary">
                  差额调整：本年 {formatFen(yearAdj)} · 累计 {formatFen(totalAdj)}（已计入净差额）
                </p>
              )}
            </>
          )}
        </div>

        {/* 月度收支趋势（ECharts） */}
        <div className="rounded-card bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-section-title">月度收支趋势</h2>
              <p className="mt-1 text-xs text-ink-secondary">全部时间 · 按数据日期归月</p>
            </div>
            <PillGroup
              options={[
                { value: 12, label: '12个月' },
                { value: 24, label: '24个月' },
                { value: 36, label: '36个月' },
              ]}
              value={trendMonths}
              onChange={setTrendMonths}
            />
          </div>
          <div className="mt-3">
            {trendLoading ? <CardLoading /> : <MonthlyTrendChart data={monthlyTrend} />}
          </div>
        </div>

        {/* 事由分布（ECharts） */}
        <div className="rounded-card bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-section-title">按事由统计</h2>
              <p className="mt-1 text-xs text-ink-secondary">
                全部时间 · {distDirection === 'in' ? '收到含日常随礼与礼簿收礼' : '送出仅含日常随礼（礼簿为收礼场景）'}
              </p>
            </div>
            <PillGroup
              options={[
                { value: 'in', label: '收到' },
                { value: 'out', label: '送出' },
              ]}
              value={distDirection}
              onChange={setDistDirection}
            />
          </div>
          <div className="mt-3">
            {distLoading ? <CardLoading /> : <EventDistributionChart data={eventDist} />}
          </div>
        </div>

        {/* 礼簿汇总 + 对账进度（原两张卡片合并，统一走 /guestbooks/summaries 一份数据） */}
        <div className="rounded-card bg-card p-5 shadow-card">
          <h2 className="text-section-title">礼簿汇总</h2>
          <p className="mt-1 text-xs text-ink-secondary">全部礼簿 · 点击礼簿名查看详情</p>
          {gbSumLoading ? (
            <CardLoading />
          ) : (
            (() => {
              const totalRecords = gbSummaries.reduce((s, gb) => s + gb.total_records, 0)
              const totalChecked = gbSummaries.reduce((s, gb) => s + gb.checked_count, 0)
              const totalCheckedAmount = gbSummaries.reduce((s, gb) => s + gb.checked_amount, 0)
              const totalAmount = gbSummaries.reduce((s, gb) => s + gb.total_amount, 0)
              const pct = totalRecords > 0 ? Math.round((totalChecked / totalRecords) * 100) : 0
              return (
                <>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink-secondary">
                        已对账 <span className="font-bold text-success">{totalChecked}</span> / {totalRecords} 笔
                        <span className="ml-2 text-xs">（未对账 {totalRecords - totalChecked} 笔）</span>
                      </span>
                      <span className="font-bold text-info">{pct}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-success transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-ink-secondary">已对账金额：</span>
                      <span className="font-bold text-success">{formatFen(totalCheckedAmount)}</span>
                      <span className="text-ink-secondary">/ 共 {formatFen(totalAmount)}</span>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-line pt-3">
                    <GuestbookStatsTable data={gbSummaries} />
                  </div>
                </>
              )
            })()
          )}
        </div>

        {/* 人员往来排行（F-10.3） */}
        <div className="rounded-card bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-section-title">人员往来排行</h2>
              <p className="mt-1 text-xs text-ink-secondary">
                全部时间 · 按
                {rankSort === 'net' ? '净额' : rankSort === 'out' ? '送出' : '收到'}
                排序 · 净额含差额调整
              </p>
            </div>
            <div className="flex items-center gap-2">
              <PillGroup
                options={[
                  { value: 'net', label: '按净额' },
                  { value: 'out', label: '按送出' },
                  { value: 'in', label: '按收到' },
                ]}
                value={rankSort}
                onChange={setRankSort}
              />
              <select
                value={rankLimit}
                onChange={(e) => setRankLimit(Number(e.target.value))}
                className="h-8 rounded-btn border border-line bg-white px-2 text-xs outline-none focus:border-primary"
              >
                {[10, 20, 50].map((n) => (
                  <option key={n} value={n}>
                    Top {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {rankLoading ? (
            <CardLoading />
          ) : rankings.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-secondary">暂无数据</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {rankings.map((r, idx) => (
                <li
                  key={r.person_id ?? r.person_name}
                  onClick={() => {
                    if (r.person_id != null) {
                      navigate({ to: '/people/$id', params: { id: String(r.person_id) } })
                    }
                  }}
                  className={`flex items-center justify-between rounded-btn bg-bg px-4 py-2.5 text-sm ${
                    r.person_id != null ? 'cursor-pointer transition-colors hover:bg-gray-100' : ''
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        idx < 3 ? 'bg-primary text-white' : 'bg-gray-200 text-ink-secondary'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-ink">
                          {r.person_name}
                          {r.nickname ? <span className="text-ink-secondary">（{r.nickname}）</span> : null}
                        </span>
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          {relationTagLabel(r.relationship_tag)}
                        </span>
                      </div>
                      {r.note ? (
                        <div className="mt-0.5 truncate text-xs text-ink-secondary" title={r.note}>
                          {r.note}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-danger">送 {formatFen(r.total_out)}</span>
                    <span className="text-success">收 {formatFen(r.total_in)}</span>
                    <span className={`font-bold ${netColor(r.net)}`}>净 {formatFen(r.net)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageScaffold>
  )
}
