import type { PaymentAccount } from '../../types'
import { limitLevel } from '../../types'

export default function AccountSelector({
  accounts,
  value,
  onChange,
  disabled,
  limitMap,
  defaultAccountId
}: {
  accounts: PaymentAccount[]
  value: number | ''
  onChange: (id: number) => void
  disabled?: boolean
  limitMap?: Map<number, { remainingFen: number; level: ReturnType<typeof limitLevel> }>
  defaultAccountId?: number
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-12 w-full rounded-btn border border-line bg-white px-4 text-base outline-none focus:border-2 focus:border-primary disabled:bg-gray-100"
    >
      <option value="">请选择收款人</option>
      {accounts.map((a) => {
        const limit = limitMap?.get(a.id!)
        const exhausted = limit?.level === 'exhausted'
        const isDefault = a.id === defaultAccountId
        const isWarning = limit?.level === 'warning'
        return (
          <option key={a.id} value={a.id} disabled={exhausted}>
            {a.name}
            {isDefault ? '（默认）' : ''}
            {isWarning ? ' ⚠️' : ''}
            {exhausted ? ' — 已限额' : ''}
          </option>
        )
      })}
    </select>
  )
}
