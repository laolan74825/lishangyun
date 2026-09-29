import { useState, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import NameAutocomplete from '../components/NameAutocomplete'
import type { RecordType } from '../types'
import { useActivePaymentAccounts, useCreateDailyRecord } from '../hooks/useQueries'

const eventTypes = [
  { value: 'wedding', label: '婚礼' },
  { value: 'fullmoon', label: '满月酒' },
  { value: 'birthday', label: '周岁宴' },
  { value: 'housewarming', label: '乔迁' },
  { value: 'graduation', label: '升学宴' },
  { value: 'funeral', label: '丧葬' },
  { value: 'holiday', label: '节日红包' },
  { value: 'other', label: '其他' }
]

/** 日常记账表单（需求 F-1.1 ~ F-1.5，场景一；含人员联想 + 收款账户选择） */
export default function RecordFormPage() {
  const navigate = useNavigate()
  const [type, setType] = useState<RecordType>('out')
  const [personName, setPersonName] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [eventType, setEventType] = useState('wedding')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [accountId, setAccountId] = useState<number | ''>('')
  const [eventDate, setEventDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [note, setNote] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const { toast, showToast } = useToast()

  const { data: accounts = [] } = useActivePaymentAccounts()
  const createMutation = useCreateDailyRecord()

  const filteredAccounts = useMemo(() => {
    if (!paymentMethod) return accounts
    const accType = paymentMethod === 'cash' ? 'cash' : paymentMethod === 'wechat' ? 'wechat' : undefined
    if (!accType) return accounts
    return accounts.filter((a) => a.type === accType)
  }, [paymentMethod, accounts])

  const handleSubmit = async () => {
    if (!personName.trim() || !amount || !eventDate) {
      showToast('请填写必填项')
      return
    }
    const amountFen = Math.round(parseFloat(amount) * 100)
    if (isNaN(amountFen) || amountFen < 100) {
      showToast('金额至少为 ¥1.00')
      return
    }
    if (amountFen > 50000000) {
      showToast('金额不能超过 ¥500,000.00')
      return
    }

    createMutation.mutate({
      type,
      person_name: personName.trim(),
      phone: phone.trim() || undefined,
      amount: amountFen,
      event_type: eventType,
      payment_method: (paymentMethod as 'cash' | 'wechat' | 'other') || undefined,
      account_id: accountId || undefined,
      event_date: eventDate,
      note: note.trim() || undefined,
      is_private: isPrivate,
    }, {
      onSuccess: () => {
        showToast('记录已保存')
        setTimeout(() => navigate({ to: '/records' }), 500)
      },
      onError: (e) => {
        showToast('保存失败：' + e.message)
      }
    })
  }

  return (
    <PageScaffold title="记一笔">
      <div className="mx-auto w-full max-w-[36rem] rounded-card bg-card p-4 shadow-card xl:p-6">
        {/* 类型切换 Tab（送出去 / 收进来） */}
        <div className="flex rounded-btn bg-bg p-1">
          {(
            [
              { value: 'out', label: '送出去' },
              { value: 'in', label: '收进来' }
            ] as const
          ).map((tab) => (
            <button
              key={tab.value}
              onClick={() => setType(tab.value)}
              className={`flex-1 rounded-btn py-2.5 text-sm font-semibold transition-colors xl:py-3 xl:text-base ${
                type === tab.value ? 'bg-primary text-white' : 'text-ink-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 表单字段 */}
        <div className="mt-4 flex flex-col gap-3 xl:mt-6 xl:gap-4">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-caption text-ink-secondary">
              金额（元）<span className="text-danger">*</span>
            </span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="h-12 w-full min-w-0 rounded-btn border border-line px-3 text-2xl font-bold outline-none focus:border-2 focus:border-primary xl:h-14 xl:px-4 xl:text-amount"
            />
          </label>

          {/* 对方姓名（带联想 F-1.1） */}
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-caption text-ink-secondary">
              对方姓名<span className="text-danger">*</span>
            </span>
            <NameAutocomplete
              value={personName}
              onChange={setPersonName}
              placeholder="请输入姓名"
              className="h-12 w-full min-w-0 rounded-btn border border-line px-3 text-base outline-none focus:border-2 focus:border-primary xl:h-14 xl:px-4"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-caption text-ink-secondary">电话号码（选填）</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="138xxxx"
              className="h-12 w-full min-w-0 rounded-btn border border-line px-3 text-base outline-none focus:border-2 focus:border-primary xl:h-14 xl:px-4"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-caption text-ink-secondary">事由 / 事件</span>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="h-12 w-full min-w-0 rounded-btn border border-line bg-white px-3 text-base outline-none focus:border-2 focus:border-primary xl:h-14 xl:px-4"
            >
              {eventTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {type === 'in' && (
            <>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-caption text-ink-secondary">收款方式</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => {
                    setPaymentMethod(e.target.value)
                    setAccountId('')
                  }}
                  className="h-12 w-full min-w-0 rounded-btn border border-line bg-white px-3 text-base outline-none focus:border-2 focus:border-primary xl:h-14 xl:px-4"
                >
                  <option value="">请选择</option>
                  <option value="cash">现金</option>
                  <option value="wechat">微信</option>
                  <option value="other">其他</option>
                </select>
              </label>

              {/* 收款账户选择 */}
              {paymentMethod && filteredAccounts.length > 0 && (
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-caption text-ink-secondary">收款账户</span>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(Number(e.target.value))}
                    className="h-12 w-full min-w-0 rounded-btn border border-line bg-white px-3 text-base outline-none focus:border-2 focus:border-primary xl:h-14 xl:px-4"
                  >
                    <option value="">请选择收款账户</option>
                    {filteredAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-caption text-ink-secondary">日期</span>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="h-12 w-full min-w-0 rounded-btn border border-line px-3 text-base outline-none focus:border-2 focus:border-primary xl:h-14 xl:px-4"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-caption text-ink-secondary">备注（选填）</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="如：代谁送礼、特殊情况说明"
              className="h-12 w-full min-w-0 rounded-btn border border-line px-3 text-base outline-none focus:border-2 focus:border-primary xl:h-14 xl:px-4"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="h-5 w-5 rounded border-line accent-primary"
            />
            <div>
              <span className="text-sm font-medium text-ink">隐私记录</span>
              <span className="ml-1 text-xs text-ink-secondary">同步云端但仅本人可见</span>
            </div>
          </label>
        </div>

        <button
          onClick={handleSubmit}
          disabled={createMutation.isPending || !personName.trim() || !amount || !eventDate}
          className="mt-4 h-12 w-full rounded-btn bg-primary text-base font-bold text-white disabled:bg-disabled xl:mt-6 xl:h-14"
        >
          {createMutation.isPending ? '保存中…' : '保存'}
        </button>
      </div>

      {/* Toast */}
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
