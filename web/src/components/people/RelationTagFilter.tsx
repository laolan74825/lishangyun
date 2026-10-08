import { DEFAULT_RELATION_TAGS } from '../../types'
import type { RelationTag } from '../../types'

interface RelationTagFilterProps {
  value: RelationTag | 'all'
  onChange: (tag: RelationTag | 'all') => void
  counts?: Record<RelationTag, number>
  /** 现有人员已使用的自定义类别（追加在默认类别之后） */
  extraTags?: RelationTag[]
}

export default function RelationTagFilter({ value, onChange, counts, extraTags = [] }: RelationTagFilterProps) {
  const tags = [...DEFAULT_RELATION_TAGS, ...extraTags.filter((t) => !DEFAULT_RELATION_TAGS.includes(t))]

  const renderButton = (tag: RelationTag | 'all', label: string) => (
    <button
      key={tag}
      onClick={() => onChange(tag)}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        value === tag
          ? 'bg-primary text-white'
          : 'bg-bg text-ink-secondary hover:bg-gray-200'
      }`}
    >
      {label}
      {counts && tag !== 'all' && counts[tag] > 0 && (
        <span className="ml-1.5 text-xs opacity-70">{counts[tag]}</span>
      )}
      {counts && tag === 'all' && (
        <span className="ml-1.5 text-xs opacity-70">
          {Object.values(counts).reduce((a, b) => a + b, 0)}
        </span>
      )}
    </button>
  )

  return (
    // 窄屏直接换行，不做横向滚动（产品要求页面无横向滚动）
    <div className="flex flex-wrap gap-2">
      {renderButton('all', '全部')}
      {tags.map((tag) => renderButton(tag, tag))}
    </div>
  )
}
