import type { Person } from '../../types'

interface PersonCardProps {
  person: Person
  summary?: {
    total_out: number
    total_in: number
    net: number
  }
  onEdit?: (person: Person) => void
  onDelete?: (person: Person) => void
  onViewDetail?: (person: Person) => void
}

const tagColors: Record<string, string> = {
  '亲戚': 'bg-danger-bg text-danger',
  '朋友': 'bg-success-bg text-success-deep',
  '同事': 'bg-warning-bg text-warning',
  '同学': 'bg-info/10 text-info',
  '邻居': 'bg-gray-100 text-ink-secondary',
  '其他': 'bg-gray-100 text-ink-secondary',
}

const tagColor = (tag: string) => tagColors[tag] ?? 'bg-gray-100 text-ink-secondary'

const fmt = (fen: number) => `¥${(fen / 100).toFixed(2)}`

export default function PersonCard({ person, summary, onEdit, onDelete, onViewDetail }: PersonCardProps) {
  return (
    <div className="flex flex-col rounded-card bg-card shadow-card">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-ink">{person.name}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs ${tagColor(person.relation_tag)}`}>
                {person.relation_tag}
              </span>
            </div>
            {person.nickname && (
              <p className="text-sm text-ink-secondary">称谓：{person.nickname}</p>
            )}
            {person.phone && (
              <p className="text-sm text-ink-secondary">电话：{person.phone}</p>
            )}
            {person.aliases.length > 0 && (
              <p className="text-xs text-ink-secondary">别名：{person.aliases.join('、')}</p>
            )}
            {person.note && (
              <p className="mt-1 text-xs text-ink-secondary">{person.note}</p>
            )}
          </div>
          <div className="flex gap-1">
            {onEdit && (
              <button
                onClick={() => onEdit(person)}
                className="rounded-btn px-2 py-1 text-xs text-info hover:bg-info/10"
              >
                编辑
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(person)}
                className="rounded-btn px-2 py-1 text-xs text-danger hover:bg-danger-bg"
              >
                删除
              </button>
            )}
          </div>
        </div>

        {summary && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-btn bg-bg p-2">
              <div className="text-xs text-ink-secondary">送出</div>
              <div className="text-sm font-bold text-danger">{fmt(summary.total_out)}</div>
            </div>
            <div className="rounded-btn bg-bg p-2">
              <div className="text-xs text-ink-secondary">收到</div>
              <div className="text-sm font-bold text-success">{fmt(summary.total_in)}</div>
            </div>
            <div className="rounded-btn bg-bg p-2">
              <div className="text-xs text-ink-secondary">净差额</div>
              <div className={`text-sm font-bold ${summary.net >= 0 ? 'text-success' : 'text-danger'}`}>
                {fmt(summary.net)}
              </div>
            </div>
          </div>
        )}
      </div>

      {onViewDetail && (
        <button
          onClick={() => onViewDetail(person)}
          className="border-t border-line px-5 py-2.5 text-left text-sm font-medium text-info hover:bg-bg"
        >
          查看往来明细 ▼
        </button>
      )}
    </div>
  )
}
