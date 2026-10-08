import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import NameAutocomplete from '../components/NameAutocomplete'
import PaymentMethodSelector from '../components/collect/PaymentMethodSelector'
import DuplicateAlert from '../components/collect/DuplicateAlert'
import WechatQrPanel from '../components/collect/WechatQrPanel'
import RecentRecordsPanel from '../components/collect/RecentRecordsPanel'
import MultiEntryForm from '../components/collect/MultiEntryForm'
import CollaborationStatus from '../components/collect/CollaborationStatus'
import type { MultiItem } from '../components/collect/MultiEntryForm'
import { useAppStore } from '../store/appStore'
import type { PaymentMethod, GbRecord } from '../types'
import { limitLevel } from '../types'
import { queryKeys } from '../hooks/queryKeys'
import { amountToChinese, formatFen } from '../lib/format'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useGuestbookWebSocket } from '../hooks/useWebSocket'
import {
  checkDuplicateName,
  findDuplicatesByName,
  findRecordByPhone,
  wechatReceivedToday,
} from '../lib/api-client'
import {
  useGuestbook,
  usePaymentAccounts,
  useRecentGbRecords,
  useCreateGbRecord,
  useCreateGbRecordBatch,
  useUpdateGbRecord,
} from '../hooks/useQueries'

export default function CollectPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const navigate = useNavigate()
  const guestbookId = Number(id)
  const queryClient = useQueryClient()

  const clientId = useAppStore((s) => s.clientId)
  const operatorName = useAppStore((s) => s.operatorName)
  const setOperatorName = useAppStore((s) => s.setOperatorName)

  useEffect(() => {
    if (operatorName) return
    try {
      const raw = localStorage.getItem('gr_operator_name')
      if (raw) setOperatorName(raw)
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- TanStack Query 数据 ---------- */
  const { data: guestbook } = useGuestbook(guestbookId)
  const { data: allAccounts = [] } = usePaymentAccounts()
  const { data: recentRecords = [] } = useRecentGbRecords(guestbookId, 50)

  /* ---------- WebSocket 协作 ---------- */
  useGuestbookWebSocket(guestbookId)

  /* ---------- Mutations ---------- */
  const createMutation = useCreateGbRecord()
  const batchMutation = useCreateGbRecordBatch()
  const updateRecordMutation = useUpdateGbRecord()

  const invalidateAfterMutation = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.gbRecords.lists() })
    queryClient.invalidateQueries({ queryKey: queryKeys.gbRecords.recent(guestbookId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.stats.guestbookSummary(guestbookId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.stats.accountSummary(guestbookId) })
  }, [queryClient, guestbookId])

  /* ---------- 微信限额计算（手动，非 hook） ---------- */
  const [limitMap, setLimitMap] = useState<Map<number, { remainingFen: number; level: ReturnType<typeof limitLevel> }>>(new Map())
  const today = dayjs().format('YYYY-MM-DD')

  const refreshLimits = useCallback(async () => {
    if (!guestbookId || isNaN(guestbookId)) return
    const lm = new Map<number, { remainingFen: number; level: ReturnType<typeof limitLevel> }>()
    for (const a of allAccounts) {
      if (a.type !== 'wechat' || a.is_disabled) continue
      const received = await wechatReceivedToday(a.id!, today, guestbookId)
      const remainingFen = a.daily_limit - received
      lm.set(a.id!, { remainingFen, level: limitLevel(remainingFen) })
    }
    setLimitMap(lm)
  }, [guestbookId, allAccounts, today])

  useEffect(() => {
    if (allAccounts.length > 0) refreshLimits()
  }, [allAccounts.length, today]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 表单状态 ---------- */
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [accountId, setAccountId] = useState<number | ''>('')
  const [guestName, setGuestName] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [recordTime, setRecordTime] = useState('')
  /* 拆分收款：同一宾客现金 + 微信各付一部分 */
  const [splitPay, setSplitPay] = useState(false)
  const [cashAmount, setCashAmount] = useState('')
  const [wechatAmount, setWechatAmount] = useState('')
  const [wechatAccountId, setWechatAccountId] = useState<number | ''>('')
  const [activeTab, setActiveTab] = useState<'single' | 'multi'>('single')
  const [multiItems, setMultiItems] = useState<MultiItem[]>([])
  const [agentName, setAgentName] = useState('')
  const [bulkPaymentMethod, setBulkPaymentMethod] = useState<PaymentMethod | ''>('')
  const [bulkAccountId, setBulkAccountId] = useState<number | ''>('')

  /* ---------- UI 状态 ---------- */
  const [page, setPage] = useState(1)
  const [duplicateRecords, setDuplicateRecords] = useState<GbRecord[] | null>(null)
  const [selectedRecordIds, setSelectedRecordIds] = useState<number[]>([])
  const [duplicateNewNote, setDuplicateNewNote] = useState('')
  const [duplicateExistingNotes, setDuplicateExistingNotes] = useState<Map<number, string>>(new Map())
  const { toast, showToast } = useToast()

  const toggleRecordSelection = (id: number) => {
    setSelectedRecordIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const clearSelection = () => {
    setSelectedRecordIds([])
  }

  /* ---------- 编辑原有记录弹窗（F-2.21） ---------- */
  const [editingRecord, setEditingRecord] = useState<GbRecord | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')

  const pageSize = 5

  /* ---------- 默认收款人逻辑 ---------- */
  useEffect(() => {
    if (!paymentMethod) return
    const type = paymentMethod === 'cash' ? 'cash' : paymentMethod === 'wechat' ? 'wechat' : undefined
    if (!type) {
      setAccountId('')
      return
    }
    // 仅从未停用的账户中选择（停用账户不可收款）
    const typeAccounts = allAccounts.filter((a) => a.type === type && !a.is_disabled)
    if (typeAccounts.length === 0) return

    // 统一使用系统当前账户（每种类型 is_active=true 的默认账户）
    const systemDefault = typeAccounts.find((a) => a.is_active)
    if (systemDefault) {
      setAccountId(systemDefault.id!)
      return
    }

    // 兜底：第一个同类型账户
    setAccountId(typeAccounts[0].id!)
  }, [paymentMethod, allAccounts])

  const selectedAccount = useMemo(() => {
    if (!accountId) return undefined
    return allAccounts.find((a) => a.id === accountId)
  }, [accountId, allAccounts])

  /* 某类型未停用的账户中，优先系统默认（is_active），兜底第一个 */
  const defaultAccountOf = useCallback((type: 'cash' | 'wechat') => {
    const list = allAccounts.filter((a) => a.type === type && !a.is_disabled)
    if (list.length === 0) return undefined
    return list.find((a) => a.is_active) ?? list[0]
  }, [allAccounts])

  /* 拆分收款：微信账户默认选中系统默认微信账户 */
  useEffect(() => {
    if (!splitPay) return
    setWechatAccountId((prev) => {
      const cur = allAccounts.find((a) => a.id === prev && a.type === 'wechat' && !a.is_disabled)
      if (cur) return prev
      return defaultAccountOf('wechat')?.id ?? ''
    })
  }, [splitPay, allAccounts, defaultAccountOf])

  const splitWechatAccount = useMemo(() => {
    if (!wechatAccountId) return undefined
    return allAccounts.find((a) => a.id === wechatAccountId)
  }, [wechatAccountId, allAccounts])

  /* ---------- 重名检测 ---------- */
  const handleCheckDuplicate = useCallback(async () => {
    if (!guestName.trim() || !guestbookId) return false
    const hasDup = await checkDuplicateName(guestbookId, guestName.trim())
    if (hasDup) {
      const dups = await findDuplicatesByName(guestbookId, guestName.trim())
      setDuplicateRecords(dups)
      setDuplicateNewNote(note)
      const notesMap = new Map<number, string>()
      dups.forEach((r) => {
        if (r.id) notesMap.set(r.id, r.note ?? '')
      })
      setDuplicateExistingNotes(notesMap)
      return true
    }
    return false
  }, [guestName, guestbookId, note])

  const handlePhoneMatch = useCallback(async () => {
    if (!phone.trim() || !guestbookId) return undefined
    return findRecordByPhone(guestbookId, phone.trim())
  }, [phone, guestbookId])

  /* ---------- 提交 ---------- */
  const doSubmit = async (noteOverride?: string) => {
    if (!operatorName.trim()) {
      showToast('请先设置记账员姓名')
      return
    }

    const finalNote = noteOverride !== undefined ? noteOverride : note

    if (activeTab === 'multi') {
      if (!guestbookId || multiItems.length === 0) {
        showToast('请添加宾客记录')
        return
      }
      // 行内未单独指定收款方式的行跟随本批设置
      const anyFollow = multiItems.some((b) => !b.payment_method)
      if (anyFollow && !bulkPaymentMethod) {
        showToast('请选择本批收款方式')
        return
      }
      if (anyFollow && bulkPaymentMethod !== 'other' && !bulkAccountId) {
        showToast('请选择本批收款账户')
        return
      }
      // 拦截填了一半的行，避免静默丢数据
      const incomplete = multiItems.filter((b) => !b.guest_name.trim() || !b.amount)
      if (incomplete.length > 0) {
        const idx = multiItems.indexOf(incomplete[0]) + 1
        showToast(`第 ${idx} 位宾客的姓名或金额未填写`)
        return
      }
      const inputs = multiItems.map((b) => {
        const amountFen = Math.round(parseFloat(b.amount) * 100)
        if (isNaN(amountFen) || amountFen <= 0) {
          throw new Error(`宾客「${b.guest_name.trim()}」金额无效`)
        }
        const pm = (b.payment_method || bulkPaymentMethod) as PaymentMethod
        // 行内单独指定的收款方式自动取该类型默认账户；跟随本批的用本批账户
        let acc: number | undefined
        if (pm === 'other') {
          acc = undefined
        } else if (b.payment_method) {
          acc = defaultAccountOf(pm as 'cash' | 'wechat')?.id
        } else {
          acc = bulkAccountId || undefined
        }
        if (pm !== 'other' && !acc) {
          throw new Error(`宾客「${b.guest_name.trim()}」的${pm === 'cash' ? '现金' : '微信'}账户不可用，请先到账户管理设置`)
        }
        return {
          guestbook_id: guestbookId,
          guest_name: b.guest_name.trim(),
          phone: b.phone.trim() || undefined,
          amount: amountFen,
          payment_method: pm,
          account_id: acc,
          note: b.note.trim() || undefined,
          agent_name: agentName.trim() || undefined,
          client_id: clientId,
          operator_name: operatorName.trim()
        }
      })
      batchMutation.mutate(inputs, {
        onSuccess: (_ids, items) => {
          showToast(`成功录入 ${items.length} 笔，合计 ${formatFen(items.reduce((s, i) => s + i.amount, 0))}`)
          setMultiItems([])
          setAgentName('')
          setBulkPaymentMethod('')
          setBulkAccountId('')
          setPage(1)
          invalidateAfterMutation()
          refreshLimits()
        },
        onError: (e) => showToast('保存失败：' + e.message),
      })
      return
    }
    /* ----- 单人录入：拆分收款（现金+微信混合） ----- */
    if (splitPay) {
      if (!guestName.trim()) {
        showToast('请填写宾客姓名')
        return
      }
      const cashFen = Math.round(parseFloat(cashAmount || '0') * 100)
      const wechatFen = Math.round(parseFloat(wechatAmount || '0') * 100)
      if (isNaN(cashFen) || isNaN(wechatFen) || cashFen <= 0 || wechatFen <= 0) {
        showToast('请填写现金和微信两部分的金额（均需大于 0）')
        return
      }
      const cashAccount = defaultAccountOf('cash')
      if (!cashAccount) {
        showToast('系统未设置现金账户，请先到账户管理添加')
        return
      }
      if (!splitWechatAccount) {
        showToast('请选择微信收款账户')
        return
      }
      const splitTag = `混合收款：现金${formatFen(cashFen)}+微信${formatFen(wechatFen)}`
      const baseNote = finalNote.trim() ? `${finalNote.trim()}；${splitTag}` : splitTag
      const timeStr = recordTime ? dayjs(recordTime).format('YYYY-MM-DDTHH:mm:ss') : dayjs().format('YYYY-MM-DDTHH:mm:ss')
      const base = {
        guestbook_id: guestbookId,
        guest_name: guestName.trim(),
        phone: phone.trim() || undefined,
        agent_name: agentName.trim() || undefined,
        record_time: timeStr,
        client_id: clientId,
        operator_name: operatorName.trim()
      }
      batchMutation.mutate([
        { ...base, amount: cashFen, payment_method: 'cash' as PaymentMethod, account_id: cashAccount.id!, note: baseNote },
        { ...base, amount: wechatFen, payment_method: 'wechat' as PaymentMethod, account_id: splitWechatAccount.id!, note: baseNote }
      ], {
        onSuccess: () => {
          showToast(`收礼记录已保存（现金${formatFen(cashFen)} + 微信${formatFen(wechatFen)}）`)
          setGuestName('')
          setPhone('')
          setCashAmount('')
          setWechatAmount('')
          setNote('')
          setAgentName('')
          setRecordTime('')
          setDuplicateRecords(null)
          setPage(1)
          invalidateAfterMutation()
          refreshLimits()
        },
        onError: (e) => showToast('保存失败：' + e.message),
      })
      return
    }
    /* ----- 单人录入：单一收款方式 ----- */
      if (!paymentMethod || !guestName.trim() || !amount) {
        showToast('请填写完整信息')
        return
      }
      const amountFen = Math.round(parseFloat(amount) * 100)
      if (isNaN(amountFen) || amountFen <= 0) {
        showToast('金额无效')
        return
      }
      createMutation.mutate({
        guestbook_id: guestbookId,
        guest_name: guestName.trim(),
        phone: phone.trim() || undefined,
        amount: amountFen,
        payment_method: paymentMethod,
        account_id: accountId as number,
        note: finalNote.trim() || undefined,
        agent_name: agentName.trim() || undefined,
        record_time: recordTime ? dayjs(recordTime).format('YYYY-MM-DDTHH:mm:ss') : dayjs().format('YYYY-MM-DDTHH:mm:ss'),
        client_id: clientId,
        operator_name: operatorName.trim()
      }, {
        onSuccess: () => {
          showToast('收礼记录已保存')
          setGuestName('')
          setPhone('')
          setAmount('')
          setNote('')
          setAgentName('')
          setPaymentMethod('')
          setRecordTime('')
          setDuplicateRecords(null)
          setPage(1)
          invalidateAfterMutation()
          refreshLimits()
        },
        onError: (e) => showToast('保存失败：' + e.message),
      })
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

  /* 切换到多人录入时自动给出第一行 */
  useEffect(() => {
    if (activeTab === 'multi') {
      setMultiItems((prev) => (prev.length === 0 ? [{ id: crypto.randomUUID(), guest_name: '', phone: '', amount: '', payment_method: '', account_id: '', note: '' }] : prev))
    }
  }, [activeTab])

  /* 本批收款方式变化时自动选中系统默认账户（保留用户已手动选择的账户） */
  useEffect(() => {
    if (!bulkPaymentMethod || bulkPaymentMethod === 'other') {
      setBulkAccountId('')
      return
    }
    const typeAccounts = allAccounts.filter((a) => a.type === bulkPaymentMethod && !a.is_disabled)
    if (typeAccounts.length === 0) {
      setBulkAccountId('')
      return
    }
    if (typeAccounts.some((a) => a.id === bulkAccountId)) return
    const systemDefault = typeAccounts.find((a) => a.is_active)
    setBulkAccountId((systemDefault ?? typeAccounts[0]).id!)
  }, [bulkPaymentMethod, allAccounts]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 编辑原有记录（F-2.21） ---------- */
  const openEditExisting = (record: GbRecord) => {
    setEditingRecord(record)
    setEditAmount((record.amount / 100).toString())
    setEditNote(record.note ?? '')
    setDuplicateRecords(null)
  }

  const handleEditSubmit = () => {
    if (!editingRecord?.id) return
    const amountFen = Math.round(parseFloat(editAmount) * 100)
    if (isNaN(amountFen) || amountFen <= 0) {
      showToast('金额无效')
      return
    }
    updateRecordMutation.mutate({
      id: editingRecord.id,
      changes: {
        amount: amountFen,
        note: editNote.trim() || undefined
      },
      operatorName,
      clientId,
    }, {
      onSuccess: () => {
        showToast('记录已更新')
        setEditingRecord(null)
        invalidateAfterMutation()
        refreshLimits()
      },
      onError: (e) => showToast('更新失败：' + e.message),
    })
  }

  const isPending = createMutation.isPending || batchMutation.isPending

  /* ---------- 键盘快捷键 ---------- */
  const collectShortcuts = useMemo(() => [
    { key: 'Enter', handler: () => { handleSubmit() }, description: '提交记录' },
    { key: '1', handler: () => setPaymentMethod('cash'), description: '现金支付' },
    { key: '2', handler: () => setPaymentMethod('wechat'), description: '微信支付' },
    { key: '3', handler: () => setPaymentMethod('other'), description: '其他支付' },
    { key: 'n', ctrl: true, handler: () => navigate({ to: '/guestbooks/new' }), description: '新建礼簿' },
    { key: 'Escape', handler: () => navigate({ to: '/guestbooks/$id', params: { id: String(guestbookId) } }), description: '返回详情' },
  ], [handleSubmit, navigate, guestbookId])

  useKeyboardShortcuts(collectShortcuts, activeTab === 'single')

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
      description={guestbook?.event_date ?? ''}
      actions={
        <div className="flex items-center gap-3">
          <CollaborationStatus />
          <button
            type="button"
            onClick={() => navigate({ to: '/guestbooks/$id', params: { id: String(guestbookId) } })}
            className="rounded-btn bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-deep"
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
                  <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} disabled={splitPay} />
                </label>

                {/* 拆分收款（混合：现金+微信） */}
                <label className="mt-4 flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={splitPay}
                    onChange={(e) => setSplitPay(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-sm font-medium text-ink">拆分收款</span>
                  <span className="text-xs text-ink-secondary">同一宾客现金、微信各付一部分时勾选</span>
                </label>

                {/* 拆分收款：微信账户 + 收款码 */}
                {splitPay && (
                  <>
                    <label className="mt-4 flex flex-col gap-2">
                      <span className="text-sm font-medium text-ink">
                        微信收款账户 <span className="text-danger">*</span>
                        <span className="ml-2 text-xs font-normal text-ink-secondary">现金部分自动计入系统默认现金账户</span>
                      </span>
                      <select
                        value={wechatAccountId}
                        onChange={(e) => setWechatAccountId(e.target.value ? Number(e.target.value) : '')}
                        className="h-12 rounded-btn border border-line bg-white px-4 text-base outline-none focus:border-2 focus:border-primary"
                      >
                        <option value="">请选择微信账户</option>
                        {allAccounts.filter((a) => a.type === 'wechat' && !a.is_disabled).map((a) => {
                          const limit = limitMap.get(a.id!)
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
                    </label>
                    {splitWechatAccount && (
                      <div className="mt-4">
                        <WechatQrPanel account={splitWechatAccount} />
                      </div>
                    )}
                  </>
                )}

                {/* 收款账户（单一收款方式时） */}
                {!splitPay && paymentMethod && paymentMethod !== 'other' && (
                  <div className="mt-4 flex flex-col gap-2">
                    <span className="text-sm font-medium text-ink">
                      收款账户：<span className="font-bold">{selectedAccount?.name ?? '未选择'}</span>
                      {paymentMethod === 'wechat' && selectedAccount && limitMap.get(selectedAccount.id!)?.level !== 'normal' && (
                        <span className="ml-2 text-danger">
                          {limitMap.get(selectedAccount.id!)?.level === 'exhausted' ? '（已达限额）' : '（额度不足）'}
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* 微信收款码（单一收款方式时） */}
                {!splitPay && paymentMethod === 'wechat' && selectedAccount && (
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

                {/* 金额：拆分收款时为现金+微信两部分 */}
                {splitPay ? (
                  <div className="mt-4 flex flex-col gap-2">
                    <span className="text-sm font-medium text-ink">
                      金额（元）：<span className="text-danger">*</span>
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-ink-secondary">现金部分</span>
                        <input
                          value={cashAmount}
                          onChange={(e) => setCashAmount(e.target.value)}
                          inputMode="decimal"
                          placeholder="0.00"
                          className="h-12 rounded-btn border border-line px-4 text-lg font-bold outline-none focus:border-2 focus:border-primary"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-ink-secondary">微信部分</span>
                        <input
                          value={wechatAmount}
                          onChange={(e) => setWechatAmount(e.target.value)}
                          inputMode="decimal"
                          placeholder="0.00"
                          className="h-12 rounded-btn border border-line px-4 text-lg font-bold outline-none focus:border-2 focus:border-primary"
                        />
                      </label>
                    </div>
                    {(() => {
                      const c = parseFloat(cashAmount || '0')
                      const w = parseFloat(wechatAmount || '0')
                      const totalFen = (isNaN(c) ? 0 : Math.round(c * 100)) + (isNaN(w) ? 0 : Math.round(w * 100))
                      return totalFen > 0 ? (
                        <p className="text-sm text-ink-secondary">
                          合计 {formatFen(totalFen)}（{amountToChinese(totalFen)}）
                        </p>
                      ) : null
                    })()}
                  </div>
                ) : (
                <label className="mt-4 flex flex-col gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-ink">
                      金额（元）：<span className="text-danger">*</span>
                    </span>
                    {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
                      <span className="text-sm text-ink-secondary whitespace-nowrap">
                        {amountToChinese(Math.round(parseFloat(amount) * 100))}
                      </span>
                    )}
                  </div>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="h-12 rounded-btn border border-line px-4 text-lg font-bold outline-none focus:border-2 focus:border-primary"
                  />
                </label>
                )}

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

                {/* 代理人（代送礼） */}
                <label className="mt-4 flex flex-col gap-2">
                  <span className="text-sm font-medium text-ink">代理人（代他人送礼时填写）</span>
                  <input
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="选填，如：张三代李四"
                    className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
                  />
                </label>

                {/* 记账时间（漏记补记 F-2.25） */}
                <label className="mt-4 flex flex-col gap-2">
                  <span className="text-sm font-medium text-ink">记账时间</span>
                  <div className="relative">
                    <input
                      type="datetime-local"
                      value={recordTime}
                      onChange={(e) => setRecordTime(e.target.value)}
                      className={`h-12 w-full rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary ${
                        !recordTime ? 'text-transparent' : ''
                      }`}
                    />
                    {!recordTime && (
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-ink-secondary">
                        当前系统值，可手动设置（格式：2026-09-26 14:30）
                      </span>
                    )}
                  </div>
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
                bulkAccountId={bulkAccountId}
                onBulkAccountIdChange={setBulkAccountId}
                limitMap={limitMap}
                total={multiTotal}
              />
            )}

            {/* 提交按钮 */}
            <button
              onClick={handleSubmit}
              disabled={
                isPending ||
                (activeTab === 'single' && (!paymentMethod || !guestName.trim() || !amount || (!!paymentMethod && paymentMethod !== 'other' && !accountId))) ||
                (activeTab === 'multi' && multiItems.filter((b) => b.guest_name.trim() && b.amount).length === 0)
              }
              className="mt-6 h-14 w-full rounded-btn bg-primary text-lg font-bold text-white shadow-md transition-all hover:bg-primary-deep disabled:bg-disabled disabled:shadow-none"
            >
              {isPending ? '保存中…' : activeTab === 'multi' ? `确认多人录入 (${multiItems.length}人)` : '确认收礼'}
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
            selectedIds={selectedRecordIds}
            onToggleSelect={toggleRecordSelection}
            onClearSelection={clearSelection}
          />
        </div>
      </div>

      {/* Toast */}
      <Toast message={toast} onClose={() => showToast(null)} />

      {/* 重名弹窗（F-2.21：支持多条重名记录编辑） */}
      {duplicateRecords && (
        <DuplicateAlert
          records={duplicateRecords}
          newNote={duplicateNewNote}
          onNewNoteChange={setDuplicateNewNote}
          existingNotes={duplicateExistingNotes}
          onExistingNoteChange={(id, note) => {
            setDuplicateExistingNotes((prev) => {
              const next = new Map(prev)
              next.set(id, note)
              return next
            })
          }}
          onConfirm={async () => {
            const updates: Array<{ id: number; note: string }> = []
            for (const record of duplicateRecords) {
              if (!record.id) continue
              const oldNote = record.note ?? ''
              const newNote = duplicateExistingNotes.get(record.id) ?? ''
              if (newNote !== oldNote) {
                updates.push({ id: record.id, note: newNote })
              }
            }

            if (updates.length > 0) {
              try {
                for (const update of updates) {
                  await new Promise<void>((resolve, reject) => {
                    updateRecordMutation.mutate({
                      id: update.id,
                      changes: { note: update.note.trim() || undefined },
                      operatorName,
                      clientId,
                    }, {
                      onSuccess: () => resolve(),
                      onError: (e) => reject(e),
                    })
                  })
                }
                setDuplicateRecords(null)
                doSubmit(duplicateNewNote)
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : '未知错误'
                showToast('更新原记录备注失败：' + msg)
              }
            } else {
              setDuplicateRecords(null)
              doSubmit(duplicateNewNote)
            }
          }}
          onCancel={() => {
            setDuplicateRecords(null)
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
                disabled={updateRecordMutation.isPending}
                className="flex-1 rounded-btn bg-primary py-2.5 font-medium text-white disabled:bg-disabled"
              >
                {updateRecordMutation.isPending ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageScaffold>
  )
}
