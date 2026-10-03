import { useState, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import NameAutocomplete from '../components/NameAutocomplete'
import type { Person, RecordType } from '../types'
import { searchPersons } from '../lib/api-client'
import { usePaymentAccounts, useCreateDailyRecord, useCreatePerson, useUpdatePerson } from '../hooks/useQueries'

const eventTypeSuggestions = [
  '婚礼',
  '满月酒',
  '周岁宴',
  '生日/寿宴',
  '乔迁',
  '升学宴',
  '丧葬',
  '节日红包',
  '其他',
]

/** 日常记账表单（需求 F-1.1 ~ F-1.5，场景一；含人员联想 + 收款账户选择） */
export default function RecordFormPage() {
  const navigate = useNavigate()
  const [type, setType] = useState<RecordType>('out')
  const [personName, setPersonName] = useState('')
  const [appellation, setAppellation] = useState('')
  const [phone, setPhone] = useState('')
  // 从人员库选中的人员（携带 person_id，保存时直接关联）；手动改姓名则清空
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  // 重名提醒：保存时发现人员库中有多位同名人员，等待用户选择
  const [dupPersons, setDupPersons] = useState<Person[] | null>(null)
  const [amount, setAmount] = useState('')
  const [eventType, setEventType] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [accountId, setAccountId] = useState<number | ''>('')
  const [eventDate, setEventDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [note, setNote] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const { toast, showToast } = useToast()

  // 使用全部账户并排除停用账户：非默认账户也可选，停用账户不可选
  const { data: allAccounts = [] } = usePaymentAccounts()
  const accounts = useMemo(() => allAccounts.filter((a) => !a.is_disabled), [allAccounts])
  const createMutation = useCreateDailyRecord()
  const createPersonMutation = useCreatePerson()
  const updatePersonMutation = useUpdatePerson()

  const filteredAccounts = useMemo(() => {
    if (!paymentMethod) return accounts
    const accType = paymentMethod === 'cash' ? 'cash' : paymentMethod === 'wechat' ? 'wechat' : undefined
    if (!accType) return accounts
    return accounts.filter((a) => a.type === accType)
  }, [paymentMethod, accounts])

  /** 按姓名 + 称谓 + 电话创建新人员档案，返回 person_id */
  async function createNewPerson(): Promise<number> {
    return createPersonMutation.mutateAsync({
      name: personName.trim(),
      nickname: appellation.trim() || undefined,
      phone: phone.trim() || undefined,
      relation_tag: '其他',
      aliases: [],
    })
  }

  /**
   * 解析人员关联：
   * - 已从人员库选择 → 直接用其 person_id
   * - 人员库无此姓名 → 自动新建人员档案
   * - 恰好一位同名 → 自动关联该人员
   * - 多位同名 → 返回 null 并弹出重名提醒，由用户选择
   */
  async function resolvePersonId(): Promise<number | null> {
    if (selectedPerson?.id != null) return selectedPerson.id
    const name = personName.trim()
    const exactMatches = (await searchPersons(name)).filter((p) => p.name === name)
    if (exactMatches.length === 0) return createNewPerson()
    if (exactMatches.length === 1) return exactMatches[0].id!
    setDupPersons(exactMatches)
    return null
  }

  async function saveRecord(personId: number) {
    const amountFen = Math.round(parseFloat(amount) * 100)
    await createMutation.mutateAsync({
      type,
      person_id: personId,
      person_name: personName.trim(),
      phone: phone.trim() || undefined,
      amount: amountFen,
      event_type: eventType.trim(),
      payment_method: (paymentMethod as 'cash' | 'wechat' | 'other') || undefined,
      account_id: accountId || undefined,
      event_date: eventDate,
      note: note.trim() || undefined,
      is_private: isPrivate,
    })
    // 已关联人员档案时，称谓有改动则同步更新档案（失败不影响记账）
    if (selectedPerson?.id === personId) {
      const newNick = appellation.trim()
      if (newNick !== (selectedPerson.nickname ?? '')) {
        try {
          await updatePersonMutation.mutateAsync({
            id: personId,
            changes: { nickname: newNick || undefined },
          })
        } catch {
          // 忽略档案同步失败
        }
      }
    }
    showToast('记录已保存')
    setTimeout(() => navigate({ to: '/records' }), 500)
  }

  const handleSubmit = async () => {
    if (!personName.trim() || !amount || !eventDate || !eventType.trim()) {
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

    try {
      const personId = await resolvePersonId()
      if (personId == null) return  // 重名提醒弹窗中，待用户选择后继续
      await saveRecord(personId)
    } catch (e) {
      showToast('保存失败：' + (e as Error).message)
    }
  }

  /** 重名提醒：选择其中一位已有人员，直接继续保存 */
  function handlePickDupPerson(person: Person) {
    setSelectedPerson(person)
    setDupPersons(null)
    if (!phone.trim() && person.phone) setPhone(person.phone)
    void saveRecord(person.id!)
  }

  /** 重名提醒：确认仍要新建人员，然后继续保存 */
  async function handleCreateDespiteDup() {
    try {
      const newId = await createNewPerson()
      setDupPersons(null)
      await saveRecord(newId)
    } catch (e) {
      showToast('保存失败：' + (e as Error).message)
    }
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

          {/* 对方姓名（带联想 F-1.1）：可从人员库选择，或保存时自动新建 */}
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-caption text-ink-secondary">
              对方姓名<span className="text-danger">*</span>
            </span>
            <NameAutocomplete
              value={personName}
              onChange={(v) => {
                setPersonName(v)
                setSelectedPerson(null)
                setAppellation('')
              }}
              onSelectPerson={(p) => {
                setSelectedPerson(p)
                setAppellation(p.nickname ?? '')
                if (!phone.trim() && p.phone) setPhone(p.phone)
              }}
              showNote
              placeholder="输入姓名，从人员库选择或直接新建"
              className="h-12 w-full min-w-0 rounded-btn border border-line px-3 text-base outline-none focus:border-2 focus:border-primary xl:h-14 xl:px-4"
            />
            {selectedPerson ? (
              <span className="mt-0.5 text-xs text-success">
                已关联人员档案「{selectedPerson.name}」
                {selectedPerson.phone ? ` · ${selectedPerson.phone}` : ''}
              </span>
            ) : (
              <span className="mt-0.5 text-xs text-ink-secondary">
                人员库无此姓名时将自动新建档案；存在多位同名人员时会提醒确认
              </span>
            )}
          </label>

          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-caption text-ink-secondary">称谓（选填）</span>
            <input
              value={appellation}
              onChange={(e) => setAppellation(e.target.value)}
              maxLength={50}
              placeholder="如：表哥、同事等"
              className="h-12 w-full min-w-0 rounded-btn border border-line px-3 text-base outline-none focus:border-2 focus:border-primary xl:h-14 xl:px-4"
            />
            <span className="mt-0.5 text-xs text-ink-secondary">
              保存到对方的人员档案（称谓）
            </span>
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
            <input
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              list="event-type-suggestions"
              maxLength={30}
              placeholder="如：小孙子满月"
              className="h-12 w-full min-w-0 rounded-btn border border-line px-3 text-base outline-none focus:border-2 focus:border-primary xl:h-14 xl:px-4"
            />
            <datalist id="event-type-suggestions">
              {eventTypeSuggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
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
          disabled={createMutation.isPending || createPersonMutation.isPending || !personName.trim() || !amount || !eventDate || !eventType.trim()}
          className="mt-4 h-12 w-full rounded-btn bg-primary text-base font-bold text-white disabled:bg-disabled xl:mt-6 xl:h-14"
        >
          {createMutation.isPending || createPersonMutation.isPending ? '保存中…' : '保存'}
        </button>
      </div>

      {/* 重名提醒：人员库中已有多位同名人员 */}
      {dupPersons && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-card bg-card p-5 shadow-card">
            <h3 className="text-base font-bold text-ink">重名提醒</h3>
            <p className="mt-1 text-sm text-ink-secondary">
              人员库中已有 {dupPersons.length} 位「{personName.trim()}」，请选择其中一位，
              或确认新建一位同名人员：
            </p>
            <ul className="mt-3 flex max-h-56 flex-col gap-2 overflow-y-auto">
              {dupPersons.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => handlePickDupPerson(p)}
                    className="flex w-full items-center gap-2 rounded-btn border border-line px-3 py-2.5 text-left text-sm hover:border-primary"
                  >
                    <span className="font-medium text-ink">{p.name}</span>
                    {p.nickname && <span className="text-xs text-ink-secondary">({p.nickname})</span>}
                    {p.phone && <span className="ml-auto text-xs text-ink-secondary">{p.phone}</span>}
                    {p.relation_tag && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                        {p.relation_tag}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleCreateDespiteDup}
                disabled={createPersonMutation.isPending}
                className="flex-1 rounded-btn border border-warning px-4 py-2.5 text-sm font-medium text-warning hover:bg-warning/10 disabled:opacity-50"
              >
                {createPersonMutation.isPending ? '新建中…' : '仍要新建人员'}
              </button>
              <button
                onClick={() => setDupPersons(null)}
                className="flex-1 rounded-btn border border-line px-4 py-2.5 text-sm text-ink-secondary hover:border-primary"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
