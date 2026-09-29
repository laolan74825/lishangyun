import type { PaymentMethod } from '../../types'

/** 收款方式选择器（三段式） */
export default function PaymentMethodSelector({
  value,
  onChange,
  disabled
}: {
  value: PaymentMethod | ''
  onChange: (v: PaymentMethod | '') => void
  disabled?: boolean
}) {
  const methods: { value: PaymentMethod; label: string; icon: string }[] = [
    { value: 'cash', label: '现金', icon: '💵' },
    { value: 'wechat', label: '微信', icon: '💚' },
    { value: 'other', label: '其他', icon: '📝' }
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {methods.map((m) => (
        <button
          key={m.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === m.value ? '' : m.value)}
          className={`flex items-center justify-center gap-2 rounded-btn py-3 transition-all ${
            value === m.value
              ? 'bg-primary text-white shadow-md'
              : 'border border-line bg-white text-ink-secondary hover:border-primary'
          } disabled:opacity-40`}
        >
          <span className="text-xl">{m.icon}</span>
          <span className="text-sm font-medium">{m.label}</span>
        </button>
      ))}
    </div>
  )
}
