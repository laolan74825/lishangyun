import type { PaymentMethod, PaymentAccount } from '../../types'

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
  total
}: {
  agentName: string
  onAgentNameChange: (v: string) => void
  items: MultiItem[]
  allAccounts: PaymentAccount[]
  onAddItem: () => void
  onUpdateItem: (id: string, changes: Partial<MultiItem>) => void
  onRemoveItem: (id: string) => void
  bulkPaymentMethod: PaymentMethod | ''
  onBulkPaymentMethodChange: (v: PaymentMethod | '') => void
  total: number
}) {
  const activeAccounts = allAccounts.filter((a) => a.is_active)

  return (
    <div className="mt-4 flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">代理人姓名（选填）</span>
        <input
          value={agentName}
          onChange={(e) => onAgentNameChange(e.target.value)}
          placeholder="如代他人送礼可填写"
          className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
        />
      </label>

      {items.map((item, idx) => (
        <div key={item.id} className="flex flex-col gap-2 rounded-btn border border-line bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">
              <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{idx + 1}</span>
              宾客姓名
            </span>
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => onRemoveItem(item.id)}
                className="text-xs text-danger"
              >
                删除
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={item.guest_name}
              onChange={(e) => onUpdateItem(item.id, { guest_name: e.target.value })}
              placeholder="姓名 *"
              className="h-10 rounded-btn border border-line px-3 text-sm outline-none focus:border-primary"
            />
            <input
              value={item.amount}
              onChange={(e) => onUpdateItem(item.id, { amount: e.target.value })}
              inputMode="decimal"
              placeholder="金额 *"
              className="h-10 rounded-btn border border-line px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={item.phone}
              onChange={(e) => onUpdateItem(item.id, { phone: e.target.value })}
              inputMode="tel"
              placeholder="电话"
              className="h-10 rounded-btn border border-line px-3 text-sm outline-none focus:border-primary"
            />
            <input
              value={item.note}
              onChange={(e) => onUpdateItem(item.id, { note: e.target.value })}
              placeholder="备注"
              className="h-10 rounded-btn border border-line px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={item.payment_method}
              onChange={(e) => onUpdateItem(item.id, { payment_method: e.target.value as PaymentMethod | '' })}
              className="h-10 rounded-btn border border-line px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">不选</option>
              <option value="cash">现金</option>
              <option value="wechat">微信</option>
              <option value="other">其他</option>
            </select>
            <select
              value={item.account_id}
              onChange={(e) => onUpdateItem(item.id, { account_id: e.target.value ? Number(e.target.value) : '' })}
              className="h-10 rounded-btn border border-line px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">选择收款账户</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={onAddItem}
        className="rounded-btn border border-dashed border-primary py-2 text-sm font-medium text-primary"
      >
        ＋ 添加宾客
      </button>

      <div className="text-right text-sm font-bold text-ink">
        合计：¥{(total / 100).toFixed(2)}
      </div>

      <div className="flex flex-col gap-2 rounded-btn bg-bg p-3">
        <span className="text-sm font-medium text-ink">统一设置收款方式</span>
        <div className="grid grid-cols-4 gap-2">
          {([
            { value: '', label: '不选', icon: '—' },
            { value: 'cash', label: '现金', icon: '💵' },
            { value: 'wechat', label: '微信', icon: '💚' },
            { value: 'other', label: '其他', icon: '📝' }
          ] as const).map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => onBulkPaymentMethodChange(m.value)}
              className={`flex flex-col items-center gap-0.5 rounded-btn py-2 text-xs transition-all ${
                bulkPaymentMethod === m.value
                  ? 'bg-primary text-white shadow-md'
                  : 'border border-line bg-white text-ink-secondary hover:border-primary'
              }`}
            >
              <span>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-secondary">将对所有未单独选择收款方式的记录生效</p>
      </div>
    </div>
  )
}
