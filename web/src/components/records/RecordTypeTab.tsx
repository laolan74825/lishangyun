import type { RecordType } from '../../types'

const tabs: { value: RecordType | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'out', label: '送出去' },
  { value: 'in', label: '收进来' },
]

export default function RecordTypeTab({
  value,
  onChange,
}: {
  value: RecordType | 'all'
  onChange: (v: RecordType | 'all') => void
}) {
  return (
    <div className="flex rounded-btn bg-bg p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={`flex-1 rounded-btn py-2 text-sm font-semibold transition-colors ${
            value === tab.value ? 'bg-primary text-white' : 'text-ink-secondary'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
