import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import { getDailyRecords, getAllGuestbookSummaries, getPersonRanking } from '../lib/api-client'
import type { DailyRecord } from '../types'

/** 统计报表页（含礼簿专项 F-10.5、对账进度 F-10.8、人员排行 F-10.3） */
export default function StatsPage() {
  const [records, setRecords] = useState<DailyRecord[]>([])
  const [gbSummaries, setGbSummaries] = useState<Awaited<ReturnType<typeof getAllGuestbookSummaries>>>([])
  const [rankings, setRankings] = useState<Awaited<ReturnType<typeof getPersonRanking>>>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(dayjs().year().toString())
  const [gbFilter, setGbFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const [daily, gbSum, rank] = await Promise.all([
      getDailyRecords(),
      getAllGuestbookSummaries(),
      getPersonRanking(10)
    ])
    setRecords(daily)
    setGbSummaries(gbSum)
    setRankings(rank)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 按月聚合日常记录
  const monthlyData = useMemo(() => {
    const map = new Map<string, { out: number; in: number }>()
    for (const r of records) {
      const ym = r.event_date.slice(0, 7)
      const item = map.get(ym) ?? { out: 0, in: 0 }
      if (r.type === 'out') item.out += r.amount
      else item.in += r.amount
      map.set(ym, item)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [records])

  // 按事由统计
  const eventTypeStats = useMemo(() => {
    const map = new Map<string, { out: number; in: number; count: number }>()
    for (const r of records) {
      const item = map.get(r.event_type) ?? { out: 0, in: 0, count: 0 }
      if (r.type === 'out') item.out += r.amount
      else item.in += r.amount
      item.count += 1
      map.set(r.event_type, item)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].out + b[1].in - (a[1].out + a[1].in))
  }, [records])

  // 年度筛选
  const yearRecords = useMemo(() => {
    return records.filter((r) => r.event_date.startsWith(year))
  }, [records, year])

  const yearOut = yearRecords.filter((r) => r.type === 'out').reduce((s, r) => s + r.amount, 0)
  const yearIn = yearRecords.filter((r) => r.type === 'in').reduce((s, r) => s + r.amount, 0)

  // 礼簿按事由筛选
  const filteredGbSummaries = useMemo(() => {
    if (gbFilter === 'all') return gbSummaries
    return gbSummaries.filter((gb) => gb.event_type === gbFilter)
  }, [gbSummaries, gbFilter])

  const gbEventTypes = useMemo(() => {
    const types = new Set(gbSummaries.map((gb) => gb.event_type))
    return Array.from(types)
  }, [gbSummaries])

  const formatY = (fen: number) => `¥${(fen / 100).toFixed(2)}`

  const Bar = ({ label, out, inn }: { label: string; out: number; inn: number }) => {
    return (
      <div className="flex flex-col gap-1 py-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-ink">{label}</span>
          <span className="text-xs text-ink-secondary">
            送 {formatY(out)} / 收 {formatY(inn)}
          </span>
        </div>
        <div className="flex h-4 gap-1">
          <div
            className="rounded-l-sm bg-danger"
            style={{ width: `${(out / (out + inn || 1)) * 100}%` }}
          />
          <div
            className="rounded-r-sm bg-success"
            style={{ width: `${(inn / (out + inn || 1)) * 100}%` }}
          />
        </div>
      </div>
    )
  }

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
            <div className="mt-3 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-bold text-danger">{formatY(yearOut)}</div>
                <div className="text-xs text-ink-secondary">{year}年送出</div>
              </div>
              <div>
                <div className="text-lg font-bold text-success">{formatY(yearIn)}</div>
                <div className="text-xs text-ink-secondary">{year}年收到</div>
              </div>
              <div>
                <div className={`text-lg font-bold ${yearIn - yearOut >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatY(yearIn - yearOut)}
                </div>
                <div className="text-xs text-ink-secondary">净差额</div>
              </div>
            </div>
          </div>

          {/* 按月趋势 */}
          <div className="rounded-card bg-card p-5 shadow-card">
            <h2 className="text-section-title">月度收支趋势</h2>
            {monthlyData.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-secondary">暂无数据</p>
            ) : (
              <div className="mt-3 flex flex-col gap-1">
                {monthlyData.map(([ym, data]) => (
                  <Bar key={ym} label={ym} out={data.out} inn={data.in} />
                ))}
              </div>
            )}
          </div>

          {/* 按事由统计 */}
          <div className="rounded-card bg-card p-5 shadow-card">
            <h2 className="text-section-title">按事由统计</h2>
            {eventTypeStats.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-secondary">暂无数据</p>
            ) : (
              <div className="mt-3 flex flex-col gap-1">
                {eventTypeStats.map(([type, data]) => (
                  <Bar key={type} label={`${type}（${data.count}笔）`} out={data.out} inn={data.in} />
                ))}
              </div>
            )}
          </div>

          {/* 礼簿专项统计（F-10.5） */}
          <div className="rounded-card bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="text-section-title">礼簿汇总</h2>
              <select
                value={gbFilter}
                onChange={(e) => setGbFilter(e.target.value)}
                className="h-9 rounded-btn border border-line bg-white px-3 text-sm outline-none focus:border-primary"
              >
                <option value="all">全部事由</option>
                {gbEventTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {filteredGbSummaries.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-secondary">暂无礼簿</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {filteredGbSummaries.map((gb) => (
                  <li
                    key={gb.id}
                    className="flex flex-col gap-2 rounded-btn bg-bg px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/guestbooks/${gb.id}`}
                          className="font-medium text-ink hover:text-primary"
                        >
                          {gb.name}
                        </Link>
                        <span className="text-xs text-ink-secondary">{gb.event_type}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            gb.status === '收礼中'
                              ? 'bg-success-bg text-success-deep'
                              : 'bg-gray-100 text-ink-secondary'
                          }`}
                        >
                          {gb.status}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-ink">{formatY(gb.total_amount)}</span>
                        <span className="ml-1 text-xs text-ink-secondary">{gb.total_records} 笔</span>
                      </div>
                    </div>
                    {/* 对账进度条（F-10.8） */}
                    {gb.total_records > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full bg-success transition-all"
                            style={{
                              width: `${gb.total_records > 0 ? (gb.checked_count / gb.total_records) * 100 : 0}%`
                            }}
                          />
                        </div>
                        <span className="text-xs text-ink-secondary whitespace-nowrap">
                          已对账 {gb.checked_count}/{gb.total_records} 笔
                          {gb.checked_count < gb.total_records && (
                            <span className="text-warning"> · 未对 {formatY(gb.unchecked_amount)}</span>
                          )}
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
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
