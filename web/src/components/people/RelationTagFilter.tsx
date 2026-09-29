import type { RelationTag } from '../../types'

const allTags: RelationTag[] = ['亲戚', '朋友', '同事', '同学', '邻居', '其他']

interface RelationTagFilterProps {
  value: RelationTag | 'all'
  onChange: (tag: RelationTag | 'all') => void
  counts?: Record<RelationTag, number>
}

export default function RelationTagFilter({ value, onChange, counts }: RelationTagFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      <button
        onClick={() => onChange('all')}
        className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          value === 'all'
            ? 'bg-primary text-white'
            : 'bg-bg text-ink-secondary hover:bg-gray-200'
        }`}
      >
        全部
        {counts && (
          <span className="ml-1.5 text-xs opacity-70">
            {Object.values(counts).reduce((a, b) => a + b, 0)}
          </span>
        )}
      </button>
      {allTags.map((tag) => (
        <button
          key={tag}
          onClick={() => onChange(tag)}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            value === tag
              ? 'bg-primary text-white'
              : 'bg-bg text-ink-secondary hover:bg-gray-200'
          }`}
        >
          {tag}
          {counts && counts[tag] > 0 && (
            <span className="ml-1.5 text-xs opacity-70">{counts[tag]}</span>
          )}
        </button>
      ))}
    </div>
  )
}
