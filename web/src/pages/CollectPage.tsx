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
import { amountToChinese } from '../lib/format'
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
  useTerminalSettings,
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
  const { data: terminalSettings } = useTerminalSettings(guestbookId, 'default')

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
      if (a.type !== 'wechat' || !a.is_active) continue
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
  const [activeTab, setActiveTab] = useState<'single' | 'multi'>('single')
  const [multiItems, setMultiItems] = useState<MultiItem[]>([])
  const [agentName, setAgentName] = useState('')
  const [bulkPaymentMethod, setBulkPaymentMethod] = useState<PaymentMethod | ''>('')

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
    const typeAccounts = allAccounts.filter((a) => a.type === type)
    if (typeAccounts.length === 0) return

    // 1. 礼簿终端默认（礼簿账户设置中单独配置的）
    const terminalDefaultId = type === 'cash'
      ? terminalSettings?.default_cash_account
      : terminalSettings?.default_wechat_account
    if (terminalDefaultId && typeAccounts.some((a) => a.id === terminalDefaultId)) {
      setAccountId(terminalDefaultId)
      return
    }

    // 2. 系统级默认（账户设置中设为默认值的）
    const systemDefault = typeAccounts.find((a) => a.is_active)
    if (systemDefault) {
      setAccountId(systemDefault.id!)
      return
    }

    // 3. 兜底：第一个同类型账户
    setAccountId(typeAccounts[0].id!)
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
      batchMutation.mutate(inputs, {
        onSuccess: (_ids, items) => {
          showToast(`成功录入 ${items.length} 笔，合计 ¥${(items.reduce((s, i) => s + i.amount, 0) / 100).toFixed(2)}`)
          setMultiItems([])
          setAgentName('')
          setBulkPaymentMethod('')
          setPaymentMethod('')
          setRecordTime('')
          setDuplicateRecords(null)
          setPage(1)
          invalidateAfterMutation()
          refreshLimits()
        },
        onError: (e) => showToast('保存失败：' + e.message),
      })
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
                  <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} />
                </label>

                {/* 收款账户 */}
                {paymentMethod && paymentMethod !== 'other' && (
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
              {isPending ? '保存中…' : activeTab === 'multi' ? `确认多人录入 (${multiItems.filter((b) => b.guest_name.trim() && b.amount).length}人)` : '确认收礼'}
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
