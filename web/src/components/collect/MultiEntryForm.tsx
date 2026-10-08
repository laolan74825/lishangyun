import type { PaymentMethod, PaymentAccount } from '../../types'
import { limitLevel } from '../../types'
import NameAutocomplete from '../NameAutocomplete'
import { amountToChinese, formatFen } from '../../lib/format'

export interface MultiItem {
  id: string
  guest_name: string
  phone: string
  amount: string
  payment_method: PaymentMethod | ''
  account_id: number | ''
  note: string
}

export default function MultiEntryForm({
  agentName,
  onAgentNameChange,
  items,
  allAccounts,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  bulkPaymentMethod,
  onBulkPaymentMethodChange,
  bulkAccountId,
  onBulkAccountIdChange,
  limitMap,
  total
}: {
  agentName: string
  onAgentNameChange: (v: string) => void
  items: MultiItem[]
  allAccounts: PaymentAccount[]
  onAddItem: () => void
  onUpdateItem: (id: string, changes: Partial<MultiItem>) => void
  onRemoveItem: (id: string) => void
  /** 本批统一收款方式（必填）：整批所有宾客共用 */
  bulkPaymentMethod: PaymentMethod | ''
  onBulkPaymentMethodChange: (v: PaymentMethod | '') => void
  /** 本批统一收款账户（现金/微信时必选，默认系统默认账户） */
  bulkAccountId: number | ''
  onBulkAccountIdChange: (v: number | '') => void
  limitMap: Map<number, { remainingFen: number; level: ReturnType<typeof limitLevel> }>
  total: number
}) {
  const activeAccounts = allAccounts.filter((a) => !a.is_disabled)
  const typeAccounts = bulkPaymentMethod
    ? activeAccounts.filter((a) => a.type === bulkPaymentMethod)
    : []
  const selectedAccount = typeAccounts.find((a) => a.id === bulkAccountId)
  const selectedLimit = selectedAccount ? limitMap.get(selectedAccount.id!) : undefined

  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* 本批收款方式：整批统一，必填 */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">
          本批收款方式 <span className="text-danger">*</span>
          <span className="ml-2 text-xs font-normal text-ink-secondary">整批默认；个别宾客不同可在其行内单独修改</span>
        </span>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'cash' as const, label: '现金', icon: '💵' },
            { value: 'wechat' as const, label: '微信', icon: '💚' },
            { value: 'other' as const, label: '其他', icon: '📝' }
          ]).map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => onBulkPaymentMethodChange(m.value)}
              className={`flex items-center justify-center gap-1.5 rounded-btn py-2.5 text-sm font-medium transition-all ${
                bulkPaymentMethod === m.value
                  ? 'bg-primary text-white shadow-md'
                  : 'border border-line bg-white text-ink-secondary hover:border-primary hover:text-ink'
              }`}
            >
              <span>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 本批收款账户 */}
      {bulkPaymentMethod && bulkPaymentMethod !== 'other' && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">
            本批收款账户 <span className="text-danger">*</span>
          </span>
          <select
            value={bulkAccountId}
            onChange={(e) => onBulkAccountIdChange(e.target.value ? Number(e.target.value) : '')}
            className="h-12 rounded-btn border border-line bg-white px-4 text-base outline-none focus:border-2 focus:border-primary"
          >
            <option value="">请选择收款账户</option>
            {typeAccounts.map((a) => {
              const limit = a.type === 'wechat' ? limitMap.get(a.id!) : undefined
              const suffix = limit && limit.level !== 'normal'
                ? (limit.level === 'exhausted' ? '（已达限额）' : '（额度不足）')
                : ''
              return (
                <option key={a.id} value={a.id}>
                  {a.name}{a.is_active ? '（系统默认）' : ''}{suffix}
                </option>
              )
            })}
          </select>
          {selectedAccount?.type === 'wechat' && selectedLimit && selectedLimit.level !== 'normal' && (
            <span className="text-xs text-danger">
              该账户今日剩余额度 {formatFen(selectedLimit.remainingFen)}，请注意限额
            </span>
          )}
        </label>
      )}

      {/* 代理人（整批共用） */}
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">代理人姓名（整批共用，选填）</span>
        <input
          value={agentName}
          onChange={(e) => onAgentNameChange(e.target.value)}
          placeholder="如代他人送礼可填写，如：王五"
          className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
        />
      </label>

      {/* 宾客列表 */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">宾客列表（{items.length} 人）</span>
        {items.map((item, idx) => (
          <div key={item.id} className="flex flex-col gap-2 rounded-btn border border-line bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">
                <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{idx + 1}</span>
                宾客
              </span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.id)}
                  className="rounded px-2 py-0.5 text-xs text-danger transition-colors hover:bg-danger/10"
                >
                  删除
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NameAutocomplete
                value={item.guest_name}
                onChange={(v) => onUpdateItem(item.id, { guest_name: v })}
                placeholder="姓名 *"
                className="h-10 w-full rounded-btn border border-line px-3 text-sm outline-none focus:border-primary"
              />
              <input
                value={item.amount}
                onChange={(e) => onUpdateItem(item.id, { amount: e.target.value })}
                inputMode="decimal"
                placeholder="金额（元）*"
                className="h-10 rounded-btn border border-line px-3 text-sm font-bold outline-none focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                value={item.phone}
                onChange={(e) => onUpdateItem(item.id, { phone: e.target.value })}
                inputMode="tel"
                placeholder="电话（选填）"
                className="h-10 rounded-btn border border-line px-3 text-sm outline-none focus:border-primary"
              />
              <input
                value={item.note}
                onChange={(e) => onUpdateItem(item.id, { note: e.target.value })}
                placeholder="备注（选填）"
                className="h-10 rounded-btn border border-line px-3 text-sm outline-none focus:border-primary"
              />
              <select
                value={item.payment_method}
                onChange={(e) => onUpdateItem(item.id, { payment_method: e.target.value as PaymentMethod | '' })}
                className="h-10 rounded-btn border border-line bg-white px-2 text-sm outline-none focus:border-primary"
                title="个别宾客收款方式不同可在此修改"
              >
                <option value="">跟随本批</option>
                <option value="cash">现金</option>
                <option value="wechat">微信</option>
                <option value="other">其他</option>
              </select>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={onAddItem}
          className="rounded-btn border border-dashed border-primary py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
        >
          ＋ 添加宾客
        </button>
      </div>

      {/* 合计 */}
      <div className="flex items-center justify-between rounded-btn bg-bg px-4 py-3">
        <span className="text-sm font-medium text-ink">本批合计</span>
        <div className="text-right">
          <span className="text-lg font-bold text-ink">{formatFen(total)}</span>
          {total > 0 && (
            <p className="text-xs text-ink-secondary">{amountToChinese(total)}</p>
          )}
        </div>
      </div>
    </div>
  )
}
