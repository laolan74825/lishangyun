import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import NameAutocomplete from '../components/NameAutocomplete'
import PaymentMethodSelector from '../components/collect/PaymentMethodSelector'
import AccountSelector from '../components/collect/AccountSelector'
import DuplicateAlert from '../components/collect/DuplicateAlert'
import WechatQrPanel from '../components/collect/WechatQrPanel'
import RecentRecordsPanel from '../components/collect/RecentRecordsPanel'
import MultiEntryForm from '../components/collect/MultiEntryForm'
import type { MultiItem } from '../components/collect/MultiEntryForm'
import { useAppStore } from '../store/appStore'
import type { PaymentMethod, PaymentAccount, GbRecord } from '../types'
import { limitLevel } from '../types'
import {
  createGbRecord,
  createGbRecordBatch,
  getGuestbookById,
  getPaymentAccounts,
  getTerminalSettings,
  saveTerminalSettings,
  getRecentRecords,
  checkDuplicateName,
  findDuplicatesByName,
  findRecordByPhone,
  wechatReceivedToday,
  accountSummary,
  guestbookSummary,
  updateGbRecord
} from '../lib/api-client'

export default function CollectPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const guestbookId = Number(id)

  const clientId = useAppStore((s) => s.clientId)
  const operatorName = useAppStore((s) => s.operatorName)
  const setOperatorName = useAppStore((s) => s.setOperatorName)

  // 从全局设置或终端设置初始化记账员姓名
  useEffect(() => {
    if (operatorName) return
    try {
      const raw = localStorage.getItem('gr_operator_name')
      if (raw) {
        setOperatorName(raw)
      }
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 页面状态 ---------- */
  const [guestbook, setGuestbook] = useState<Awaited<ReturnType<typeof getGuestbookById>>>(undefined)
  const [allAccounts, setAllAccounts] = useState<PaymentAccount[]>([])
  const [recentRecords, setRecentRecords] = useState<GbRecord[]>([])
  const [terminalSettings, setTerminalSettings] = useState<Awaited<ReturnType<typeof getTerminalSettings>>>(undefined)
  const [limitMap, setLimitMap] = useState<Map<number, { remainingFen: number; level: ReturnType<typeof limitLevel> }>>(new Map())
  const [summary, setSummary] = useState({ total_records: 0, total_amount: 0, checked_count: 0, unchecked_count: 0 })
  const [accSummary, setAccSummary] = useState<Map<number, { record_count: number; total_amount: number }>>(new Map())

  /* ---------- 表单状态 ---------- */
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [accountId, setAccountId] = useState<number | ''>('')
  const [guestName, setGuestName] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [recordTime, setRecordTime] = useState(dayjs().format('YYYY-MM-DDTHH:mm:ss'))
  const [activeTab, setActiveTab] = useState<'single' | 'multi'>('single')
  const [multiItems, setMultiItems] = useState<MultiItem[]>([])
  const [agentName, setAgentName] = useState('')
  const [bulkPaymentMethod, setBulkPaymentMethod] = useState<PaymentMethod | ''>('')

  /* ---------- UI 状态 ---------- */
  const [page, setPage] = useState(1)
  const [duplicateRecords, setDuplicateRecords] = useState<GbRecord[] | null>(null)
  const [pendingSubmit, setPendingSubmit] = useState<(() => void) | null>(null)
  const { toast, showToast } = useToast()
  const [loading, setLoading] = useState(false)

  /* ---------- 编辑原有记录弹窗（F-2.21） ---------- */
  const [editingRecord, setEditingRecord] = useState<GbRecord | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  const today = dayjs().format('YYYY-MM-DD')
  const pageSize = 5

  /* ---------- 初始化加载 ---------- */
  const reload = useCallback(async () => {
    if (!guestbookId || isNaN(guestbookId)) return
    const gb = await getGuestbookById(guestbookId)
    setGuestbook(gb)

    const accounts = await getPaymentAccounts()
    setAllAccounts(accounts)

    const settings = await getTerminalSettings(guestbookId, clientId)
    setTerminalSettings(settings)

    // 计算微信限额
    const lm = new Map<number, { remainingFen: number; level: ReturnType<typeof limitLevel> }>()
    for (const a of accounts) {
      if (a.type !== 'wechat' || !a.is_active) continue
      const received = await wechatReceivedToday(a.id!, today, guestbookId)
      const remainingFen = a.daily_limit - received
      lm.set(a.id!, { remainingFen, level: limitLevel(remainingFen) })
    }
    setLimitMap(lm)

    const rec = await getRecentRecords(guestbookId, 50)
    setRecentRecords(rec)

    const sum = await guestbookSummary(guestbookId)
    setSummary(sum)

    const accSum = await accountSummary(guestbookId)
    setAccSummary(accSum)
  }, [guestbookId, clientId, today])

  useEffect(() => {
    reload()
  }, [reload])

  /* ---------- 默认收款人逻辑 ---------- */
  useEffect(() => {
    if (!paymentMethod) return
    const type = paymentMethod === 'cash' ? 'cash' : paymentMethod === 'wechat' ? 'wechat' : undefined
    if (!type) {
      setAccountId('')
      return
    }
    const defaultId = type === 'cash'
      ? terminalSettings?.default_cash_account
      : terminalSettings?.default_wechat_account
    if (defaultId && allAccounts.find((a) => a.id === defaultId && a.type === type && a.is_active)) {
      setAccountId(defaultId)
      return
    }
    const first = allAccounts.find((a) => a.type === type && a.is_active)
    if (first) setAccountId(first.id!)
  }, [paymentMethod, terminalSettings, allAccounts])

  const selectedAccount = useMemo(() => {
    if (!accountId) return undefined
    return allAccounts.find((a) => a.id === accountId)
  }, [accountId, allAccounts])

  /* ---------- 重名检测 ---------- */
  const handleCheckDuplicate = useCallback(async () => {
    if (!guestName.trim() || !guestbookId) return false
    const hasDup = await checkDuplicateName(guestbookId, guestName.trim())
    if (hasDup) {
      const dups = await findDuplicatesByName(guestbookId, guestName.trim())
      setDuplicateRecords(dups)
      return true
    }
    return false
  }, [guestName, guestbookId])

  const handlePhoneMatch = useCallback(async () => {
    if (!phone.trim() || !guestbookId) return undefined
    return findRecordByPhone(guestbookId, phone.trim())
  }, [phone, guestbookId])

  /* ---------- 提交 ---------- */
  const doSubmit = async () => {
    if (!operatorName.trim()) {
      showToast('请先设置记账员姓名')
      return
    }

    setLoading(true)
    try {
      if (activeTab === 'multi') {
        if (!guestbookId || multiItems.length === 0) {
          showToast('请添加宾客记录')
          return
        }
        const validItems = multiItems.filter((b) => b.guest_name.trim() && b.amount)
        if (validItems.length === 0) {
          showToast('请填写宾客姓名和金额')
          return
        }
        const inputs = validItems.map((b) => {
          const pm = (b.payment_method || bulkPaymentMethod) as PaymentMethod
          if (!pm) {
            throw new Error(`宾客「${b.guest_name.trim()}」未选择收款方式`)
          }
          return {
            guestbook_id: guestbookId,
            guest_name: b.guest_name.trim(),
            phone: b.phone.trim() || undefined,
            amount: Math.round(parseFloat(b.amount) * 100),
            payment_method: pm,
            account_id: b.account_id as number,
            note: b.note.trim() || undefined,
            agent_name: agentName.trim() || undefined,
            client_id: clientId,
            operator_name: operatorName.trim()
          }
        })
        await createGbRecordBatch(inputs)
        showToast(`成功录入 ${inputs.length} 笔，合计 ¥${(inputs.reduce((s, i) => s + i.amount, 0) / 100).toFixed(2)}`)
        setMultiItems([])
        setAgentName('')
        setBulkPaymentMethod('')
      } else {
        if (!paymentMethod || !guestName.trim() || !amount) {
          showToast('请填写完整信息')
          return
        }
        const amountFen = Math.round(parseFloat(amount) * 100)
        if (isNaN(amountFen) || amountFen <= 0) {
          showToast('金额无效')
          return
        }
        await createGbRecord({
          guestbook_id: guestbookId,
          guest_name: guestName.trim(),
          phone: phone.trim() || undefined,
          amount: amountFen,
          payment_method: paymentMethod,
          account_id: accountId as number,
          note: note.trim() || undefined,
          record_time: recordTime ? dayjs(recordTime).format('YYYY-MM-DDTHH:mm:ss') : undefined,
          client_id: clientId,
          operator_name: operatorName.trim()
        })
        showToast('收礼记录已保存')
        setGuestName('')
        setPhone('')
        setAmount('')
        setNote('')
      }

      setDuplicateRecords(null)
      setPendingSubmit(null)
      await reload()
      setPage(1)
    } catch (e) {
      showToast('保存失败：' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (activeTab === 'multi') {
      await doSubmit()
      return
    }
    const phoneMatch = await handlePhoneMatch()
    if (phoneMatch) {
      showToast('该电话号码已存在精确匹配记录，已关联')
    }
    const hasDup = await handleCheckDuplicate()
    if (hasDup) {
      setPendingSubmit(() => doSubmit)
      return
    }
    await doSubmit()
  }

  /* ---------- 多人录入操作 ---------- */
  const addMultiItem = () => {
    setMultiItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), guest_name: '', phone: '', amount: '', payment_method: '', account_id: '', note: '' }
    ])
  }
  const updateMultiItem = (itemId: string, changes: Partial<MultiItem>) => {
    setMultiItems((prev) => prev.map((b) => (b.id === itemId ? { ...b, ...changes } : b)))
  }
  const removeMultiItem = (itemId: string) => {
    setMultiItems((prev) => prev.filter((b) => b.id !== itemId))
  }
  const multiTotal = useMemo(() => {
    return multiItems.reduce((sum, b) => {
      const v = parseFloat(b.amount)
      return sum + (isNaN(v) ? 0 : Math.round(v * 100))
    }, 0)
  }, [multiItems])

  /* ---------- 收款人筛选 ---------- */
  const filteredAccounts = useMemo(() => {
    if (!paymentMethod) return []
    const type = paymentMethod === 'cash' ? 'cash' : paymentMethod === 'wechat' ? 'wechat' : undefined
    if (!type) return []
    return allAccounts.filter((a) => a.type === type && a.is_active)
  }, [paymentMethod, allAccounts])

  /* ---------- 保存默认收款人 ---------- */
  const saveDefaultAccount = async () => {
    if (!accountId || !guestbookId) return
    const type = selectedAccount?.type
    if (!type) return
    const current = terminalSettings ?? {
      guestbook_id: guestbookId,
      client_id: clientId,
      operator_name: operatorName
    }
    await saveTerminalSettings({
      ...current,
      guestbook_id: guestbookId,
      client_id: clientId,
      operator_name: operatorName || current.operator_name || '未命名',
      ...(type === 'cash' ? { default_cash_account: accountId } : { default_wechat_account: accountId })
    })
    showToast('已设为默认收款人')
    const s = await getTerminalSettings(guestbookId, clientId)
    setTerminalSettings(s)
  }

  /* ---------- 编辑原有记录（F-2.21） ---------- */
  const openEditExisting = (record: GbRecord) => {
    setEditingRecord(record)
    setEditAmount((record.amount / 100).toString())
    setEditNote(record.note ?? '')
    setDuplicateRecords(null)
    setPendingSubmit(null)
  }

  const handleEditSubmit = async () => {
    if (!editingRecord?.id) return
    const amountFen = Math.round(parseFloat(editAmount) * 100)
    if (isNaN(amountFen) || amountFen <= 0) {
      showToast('金额无效')
      return
    }
    setEditSubmitting(true)
    try {
      await updateGbRecord(editingRecord.id, {
        amount: amountFen,
        note: editNote.trim() || undefined
      }, operatorName, clientId)
      showToast('记录已更新')
      setEditingRecord(null)
      await reload()
    } catch (e) {
      showToast('更新失败：' + (e as Error).message)
    } finally {
      setEditSubmitting(false)
    }
  }

  /* ---------- 渲染 ---------- */
  if (!guestbookId || isNaN(guestbookId)) {
    return (
      <PageScaffold title="现场收礼">
        <p className="py-10 text-center text-ink-secondary">礼簿 ID 无效</p>
      </PageScaffold>
    )
  }

  return (
    <PageScaffold
      title={guestbook?.name ?? '现场收礼'}
      description={`${guestbook?.event_type ?? ''} · ${guestbook?.event_date ?? ''} · 共 ${summary.total_records} 笔 ¥${(summary.total_amount / 100).toFixed(2)}`}
      actions={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/guestbooks/${guestbookId}`)}
            className="rounded-btn border border-line px-3 py-1.5 text-sm font-medium text-ink-secondary hover:border-primary hover:text-primary"
          >
            礼簿详情
          </button>
          <span className="text-sm font-medium text-ink">记账</span>
          <input
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            placeholder="记账员姓名"
            className="h-9 w-28 rounded-btn border border-line px-3 text-sm outline-none focus:border-primary"
          />
        </div>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        {/* ===== 左侧：收礼表单 ===== */}
        <div className="flex flex-col gap-4">
          {/* 统计卡片 */}
          <div className="grid grid-cols-3 gap-3">
            {(['cash', 'wechat', 'other'] as const).map((pm) => {
              const label = pm === 'cash' ? '默认现金账户' : pm === 'wechat' ? '默认微信账户' : '其他'
              const defaultId = pm === 'cash'
                ? terminalSettings?.default_cash_account
                : pm === 'wechat'
                  ? terminalSettings?.default_wechat_account
                  : undefined
              const amount = Array.from(accSummary.entries())
                .filter(([aid]) => {
                  if (pm === 'other') {
                    const ac = allAccounts.find((a) => a.id === aid)
                    return ac && ac.type !== 'cash' && ac.type !== 'wechat'
                  }
                  return aid === defaultId
                })
                .reduce((s, [, v]) => s + v.total_amount, 0)
              return (
                <div key={pm} className="rounded-card bg-card p-3 text-center shadow-card">
                  <div className="text-caption text-ink-secondary">{label}合计</div>
                  <div className="mt-1 text-base font-bold text-ink">
                    {amount > 0 ? `¥${(amount / 100).toFixed(0)}` : '—'}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 表单卡片 */}
          <div className="rounded-card bg-card p-5 shadow-card">
            {/* 选项卡 */}
            <div className="flex gap-1 rounded-btn bg-bg p-1">
              {([
                { key: 'single' as const, label: '单人录入' },
                { key: 'multi' as const, label: '多人录入' }
              ]).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 rounded-btn py-2.5 text-sm font-medium transition-all ${
                    activeTab === tab.key
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'single' ? (
              <>
                {/* 收款方式 */}
                <label className="mt-4 flex flex-col gap-2">
                  <span className="text-sm font-medium text-ink">收款方式 <span className="text-danger">*</span></span>
                  <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} />
                </label>

                {/* 收款人 */}
                {paymentMethod && paymentMethod !== 'other' && (
                  <div className="mt-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">
                        {paymentMethod === 'cash' ? '现金收银人' : '微信收款账户'}
                        <span className="text-danger">*</span>
                        {paymentMethod === 'wechat' && selectedAccount && limitMap.get(selectedAccount.id!)?.level !== 'normal' && (
                          <span className="ml-1 text-danger">
                            {limitMap.get(selectedAccount.id!)?.level === 'exhausted' ? '— 已达限额' : '— 额度不足'}
                          </span>
                        )}
                      </span>
                      {accountId && (
                        <button
                          type="button"
                          onClick={saveDefaultAccount}
                          className="text-xs text-info hover:underline"
                        >
                          设为默认
                        </button>
                      )}
                    </div>
                    <AccountSelector
                      accounts={filteredAccounts}
                      value={accountId}
                      onChange={setAccountId}
                      limitMap={paymentMethod === 'wechat' ? limitMap : undefined}
                      defaultAccountId={paymentMethod === 'cash' ? terminalSettings?.default_cash_account : paymentMethod === 'wechat' ? terminalSettings?.default_wechat_account : undefined}
                    />
                  </div>
                )}

                {/* 微信收款码 */}
                {paymentMethod === 'wechat' && selectedAccount && (
                  <div className="mt-4">
                    <WechatQrPanel account={selectedAccount} />
                  </div>
                )}

                {/* 姓名（带联想） */}
                <label className="mt-4 flex flex-col gap-2">
                  <span className="text-sm font-medium text-ink">
                    宾客姓名 <span className="text-danger">*</span>
                  </span>
                  <NameAutocomplete
                    value={guestName}
                    onChange={setGuestName}
                    placeholder="请输入姓名"
                    className="h-12 w-full rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
                  />
                </label>

                {/* 电话 */}
                <label className="mt-4 flex flex-col gap-2">
                  <span className="text-sm font-medium text-ink">电话号码（选填，精确匹配）</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="138xxxx"
                    className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
                  />
                </label>

                {/* 金额 */}
                <label className="mt-4 flex flex-col gap-2">
                  <span className="text-sm font-medium text-ink">
                    金额（元） <span className="text-danger">*</span>
                  </span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="h-12 rounded-btn border border-line px-4 text-lg font-bold outline-none focus:border-2 focus:border-primary"
                  />
                </label>

                {/* 备注 */}
                <label className="mt-4 flex flex-col gap-2">
                  <span className="text-sm font-medium text-ink">备注（如付款微信名，方便对账）</span>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="选填"
                    className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
                  />
                </label>

                {/* 记账时间（漏记补记 F-2.25） */}
                <label className="mt-4 flex flex-col gap-2">
                  <span className="text-sm font-medium text-ink">记账时间（默认当前，可手动调整）</span>
                  <input
                    type="datetime-local"
                    value={recordTime}
                    onChange={(e) => setRecordTime(e.target.value)}
                    className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
                  />
                </label>
              </>
            ) : (
              <MultiEntryForm
                agentName={agentName}
                onAgentNameChange={setAgentName}
                items={multiItems.length > 0 ? multiItems : []}
                allAccounts={allAccounts}
                onAddItem={addMultiItem}
                onUpdateItem={updateMultiItem}
                onRemoveItem={removeMultiItem}
                bulkPaymentMethod={bulkPaymentMethod}
                onBulkPaymentMethodChange={setBulkPaymentMethod}
                total={multiTotal}
              />
            )}

            {/* 提交按钮 */}
            <button
              onClick={handleSubmit}
              disabled={
                loading ||
                (activeTab === 'single' && (!paymentMethod || !guestName.trim() || !amount || (!!paymentMethod && paymentMethod !== 'other' && !accountId))) ||
                (activeTab === 'multi' && multiItems.filter((b) => b.guest_name.trim() && b.amount).length === 0)
              }
              className="mt-6 h-14 w-full rounded-btn bg-primary text-lg font-bold text-white shadow-md transition-all hover:bg-primary-deep disabled:bg-disabled disabled:shadow-none"
            >
              {loading ? '保存中…' : activeTab === 'multi' ? `确认多人录入 (${multiItems.filter((b) => b.guest_name.trim() && b.amount).length}人)` : '确认收礼'}
            </button>
          </div>
        </div>

        {/* ===== 右侧：最近记录 ===== */}
        <div className="flex flex-col gap-4">
          <RecentRecordsPanel
            records={recentRecords}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      </div>

      {/* Toast */}
      <Toast message={toast} onClose={() => showToast(null)} />

      {/* 重名弹窗（F-2.21：含「编辑原有记录」选项） */}
      {duplicateRecords && (
        <DuplicateAlert
          records={duplicateRecords}
          onConfirm={() => {
            setDuplicateRecords(null)
            pendingSubmit?.()
          }}
          onCancel={() => {
            setDuplicateRecords(null)
            setPendingSubmit(null)
          }}
          onEditExisting={openEditExisting}
        />
      )}

      {/* 编辑原有记录弹窗（F-2.21） */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-[24rem] rounded-card bg-card p-6 shadow-xl">
            <h3 className="text-lg font-bold text-ink">编辑收礼记录</h3>
            <p className="mt-1 text-sm text-ink-secondary">
              {editingRecord.guest_name} · {dayjs(editingRecord.record_time).format('HH:mm:ss')}
            </p>
            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">金额（元）</span>
              <input
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                inputMode="decimal"
                className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
              />
            </label>
            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">备注</span>
              <input
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
              />
            </label>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setEditingRecord(null)}
                className="flex-1 rounded-btn border border-line py-2.5 font-medium text-ink-secondary"
              >
                取消
              </button>
              <button
                onClick={handleEditSubmit}
                disabled={editSubmitting}
                className="flex-1 rounded-btn bg-primary py-2.5 font-medium text-white disabled:bg-disabled"
              >
                {editSubmitting ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageScaffold>
  )
}
