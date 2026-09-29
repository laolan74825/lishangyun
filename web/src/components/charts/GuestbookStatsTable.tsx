import { Link } from '@tanstack/react-router'
import type { GuestbookStatsItem } from '../../types'

interface Props {
  data: GuestbookStatsItem[]
}

const formatY = (fen: number) => `¥${(fen / 100).toFixed(2)}`

export default function GuestbookStatsTable({ data }: Props) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-secondary">暂无礼簿数据</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-secondary">
            <th className="pb-2 pr-3 font-medium">礼簿</th>
            <th className="pb-2 pr-3 font-medium">事由</th>
            <th className="pb-2 pr-3 font-medium">日期</th>
            <th className="pb-2 pr-3 text-right font-medium">笔数</th>
            <th className="pb-2 pr-3 text-right font-medium">金额</th>
            <th className="pb-2 text-right font-medium">对账</th>
          </tr>
        </thead>
        <tbody>
          {data.map((gb) => {
            const pct = gb.total_records > 0 ? Math.round((gb.checked_count / gb.total_records) * 100) : 0
            return (
              <tr key={gb.guestbook_id} className="border-b border-line/50 last:border-0">
                <td className="py-2.5 pr-3">
                  <Link
                    to="/guestbooks/$id"
                    params={{ id: String(gb.guestbook_id) }}
                    className="font-medium text-ink hover:text-primary"
                  >
                    {gb.guestbook_name}
                  </Link>
                </td>
                <td className="py-2.5 pr-3 text-ink-secondary">{gb.event_type}</td>
                <td className="py-2.5 pr-3 text-ink-secondary">{gb.event_date}</td>
                <td className="py-2.5 pr-3 text-right font-medium text-ink">{gb.total_records}</td>
                <td className="py-2.5 pr-3 text-right font-bold text-ink">{formatY(gb.total_amount)}</td>
                <td className="py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-success transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-ink-secondary">{pct}%</span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
