import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import NameAutocomplete from '../components/NameAutocomplete'
import type { RecordType, PaymentAccount } from '../types'
import { createDailyRecord, getPaymentAccounts } from '../lib/api-client'

const eventTypes = [
  '婚礼',
  '满月酒',
  '周岁宴',
  '乔迁',
  '升学宴',
  '寿宴',
  '回门宴',
  '生日',
  '丧葬',
  '节日红包',
  '其他'
]

/** 日常记账表单（需求 F-1.1 ~ F-1.5，场景一；含人员联想 + 收款账户选择） */
export default function RecordFormPage() {
  const navigate = useNavigate()
  const [type, setType] = useState<RecordType>('out')
  const [personName, setPersonName] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [eventType, setEventType] = useState('婚礼')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [accountId, setAccountId] = useState<number | ''>('')
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [eventDate, setEventDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast, showToast } = useToast()

  // 加载可用收款账户
  useEffect(() => {
    getPaymentAccounts().then(setAccounts)
  }, [])

  // 按支付方式筛选账户
  const filteredAccounts = useMemo(() => {
    if (!paymentMethod) return accounts.filter((a) => a.is_active)
    const accType = paymentMethod === 'cash' ? 'cash' : paymentMethod === 'wechat' ? 'wechat' : undefined
    if (!accType) return accounts.filter((a) => a.is_active)
    return accounts.filter((a) => a.type === accType && a.is_active)
  }, [paymentMethod, accounts])

  const handleSubmit = async () => {
    if (!personName.trim() || !amount || !eventDate) {
      showToast('请填写必填项')
      return
    }
    const amountFen = Math.round(parseFloat(amount) * 100)
    if (isNaN(amountFen) || amountFen <= 0) {
      showToast('金额无效')
      return
    }

    setLoading(true)
    try {
      await createDailyRecord({
        type,
        person_name: personName.trim(),
        phone: phone.trim() || undefined,
        amount: amountFen,
        event_type: eventType,
        payment_method: (paymentMethod as 'cash' | 'wechat' | 'other') || undefined,
        account_id: accountId || undefined,
        event_date: eventDate,
        note: note.trim() || undefined
      })
      showToast('记录已保存')
      setTimeout(() => navigate('/records'), 500)
    } catch (e) {
      showToast('保存失败：' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageScaffold title="记一笔" description="日常人情随礼记录（30 秒内完成）">
      <div className="mx-auto max-w-[36rem] rounded-card bg-card p-6 shadow-card">
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
              className={`flex-1 rounded-btn py-3 font-semibold transition-colors ${
                type === tab.value ? 'bg-primary text-white' : 'text-ink-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 表单字段 */}
        <div className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-caption text-ink-secondary">
              金额（元）<span className="text-danger">*</span>
            </span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="h-14 rounded-btn border border-line px-4 text-amount outline-none focus:border-2 focus:border-primary"
            />
          </label>

          {/* 对方姓名（带联想 F-1.1） */}
          <label className="flex flex-col gap-1">
            <span className="text-caption text-ink-secondary">
              对方姓名<span className="text-danger">*</span>
            </span>
            <NameAutocomplete
              value={personName}
              onChange={setPersonName}
              placeholder="请输入姓名"
              className="h-14 w-full rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption text-ink-secondary">电话号码（选填）</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="138xxxx"
              className="h-14 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption text-ink-secondary">事由 / 事件</span>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="h-14 rounded-btn border border-line bg-white px-4 text-base outline-none focus:border-2 focus:border-primary"
            >
              {eventTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          {type === 'in' && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-caption text-ink-secondary">收款方式</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => {
                    setPaymentMethod(e.target.value)
                    setAccountId('')
                  }}
                  className="h-14 rounded-btn border border-line bg-white px-4 text-base outline-none focus:border-2 focus:border-primary"
                >
                  <option value="">请选择</option>
                  <option value="cash">现金</option>
                  <option value="wechat">微信</option>
                  <option value="other">其他</option>
                </select>
              </label>

              {/* 收款账户选择 */}
              {paymentMethod && filteredAccounts.length > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="text-caption text-ink-secondary">收款账户</span>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(Number(e.target.value))}
                    className="h-14 rounded-btn border border-line bg-white px-4 text-base outline-none focus:border-2 focus:border-primary"
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

          <label className="flex flex-col gap-1">
            <span className="text-caption text-ink-secondary">日期</span>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="h-14 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption text-ink-secondary">备注（选填）</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="如：代谁送礼、特殊情况说明"
              className="h-14 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
            />
          </label>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !personName.trim() || !amount || !eventDate}
          className="mt-6 h-14 w-full rounded-btn bg-primary text-base font-bold text-white disabled:bg-disabled"
        >
          {loading ? '保存中…' : '保存'}
        </button>
      </div>

      {/* Toast */}
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
