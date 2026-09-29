import { useState, useMemo, useEffect, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import GuestbookStatusBadge from '../components/guestbook/GuestbookStatusBadge'
import { cacheGuestbooks } from '../lib/dexie'
import { useAppStore } from '../store/appStore'
import type { PaymentAccount } from '../types'
import {
  useAllGuestbookSummaries,
  useCreateGuestbook,
  useDeleteGuestbook,
  usePaymentAccounts,
  useSaveTerminalSettings,
} from '../hooks/useQueries'

/* ========================= 礼簿列表页 ========================= */

export function GuestbookListPage() {
  const { data: guestbooks = [], isLoading: loading } = useAllGuestbookSummaries()
  const navigate = useNavigate()
  const { toast, showToast } = useToast()
  const deleteMutation = useDeleteGuestbook()
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null)

  const active = useMemo(() => guestbooks.filter((g) => g.status === 'active'), [guestbooks])
  const archived = useMemo(
    () => guestbooks.filter((g) => g.status === 'closing' || g.status === 'archived'),
    [guestbooks],
  )

  useEffect(() => {
    if (active.length > 0) {
      cacheGuestbooks(active).catch(() => {})
    }
  }, [active])

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll(ids: number[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = ids.every((id) => next.has(id))
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const handleDelete = () => {
    if (!deleteId) return
    const idToDelete = deleteId
    setDeleteId(null)
    deleteMutation.mutate(idToDelete, {
      onSuccess: () => {
        showToast('礼簿已删除')
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(idToDelete)
          return next
        })
      },
      onError: (e) => {
        showToast('删除失败：' + e.message)
      },
    })
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBulkDeleteOpen(false)
    
    const results = await Promise.allSettled(
      ids.map((id) => deleteMutation.mutateAsync(id))
    )
    
    const successfullyDeleted: number[] = []
    const errors: string[] = []
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successfullyDeleted.push(ids[index])
      } else {
        const error = result.reason
        errors.push(error.message || '删除失败')
      }
    })
    
    setSelectedIds((prev) => {
      const next = new Set(prev)
      successfullyDeleted.forEach((deletedId) => next.delete(deletedId))
      return next
    })
    
    if (errors.length > 0) {
      setBulkDeleteError(errors[0])
    } else {
      showToast(`已删除 ${successfullyDeleted.length} 个礼簿`)
    }
  }

  const Card = ({ gb }: { gb: (typeof guestbooks)[number] }) => {
    const pct = gb.total_records > 0
      ? Math.round((gb.checked_count / gb.total_records) * 100)
      : 0
    const isSelected = gb.id ? selectedIds.has(gb.id) : false
    return (
      <div
        className={`flex h-full flex-col gap-3 rounded-card bg-card p-5 shadow-card transition-shadow hover:shadow-lg ${isSelected ? 'ring-2 ring-primary' : ''}`}
      >
        <div className="flex items-start justify-between">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => gb.id && toggleSelect(gb.id)}
              className="h-4 w-4 rounded border-line accent-primary"
            />
            <div>
              <h3 className="text-lg font-bold text-ink">{gb.name}</h3>
              <p className="mt-1 text-sm text-ink-secondary">
                {gb.event_type} · {gb.event_date}
              </p>
            </div>
          </label>
          <GuestbookStatusBadge status={gb.status} />
        </div>
        {gb.total_records > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <span className="font-bold text-ink">¥{(gb.total_amount / 100).toFixed(2)}</span>
            <span className="text-ink-secondary">{gb.total_records} 笔</span>
            <span className="text-ink-secondary">对账 {pct}%</span>
          </div>
        )}
        {gb.total_records > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-ink-secondary">
          <span>创建于 {dayjs(gb.created_at).format('YYYY-MM-DD HH:mm')}</span>
          {gb.operator_note && <span>备注：{gb.operator_note}</span>}
        </div>
        <div className="mt-auto flex gap-2">
          {gb.status === 'active' && (
            <Link
              to="/guestbooks/$id/collect"
              params={{ id: String(gb.id) }}
              className="flex-1 rounded-btn bg-primary py-2.5 text-center text-sm font-semibold text-white"
            >
              进入收礼
            </Link>
          )}
          <button
            onClick={() => navigate({ to: '/guestbooks/$id', params: { id: String(gb.id) } })}
            className="rounded-btn border border-line px-4 py-2.5 text-sm font-medium text-ink-secondary hover:border-primary"
          >
            礼簿详情
          </button>
          {(gb.status === 'closing' || gb.status === 'archived') && (
            <button
              className="rounded-btn border border-info px-4 py-2.5 text-sm font-medium text-info hover:bg-info/10"
              title="合并到其他礼簿"
              onClick={() => alert('合并向导功能即将推出')}
            >
              合并
            </button>
          )}
          {gb.total_records === 0 && gb.id && (
            <button
              onClick={() => setDeleteId(gb.id!)}
              className="rounded-btn border border-danger px-4 py-2.5 text-sm font-medium text-danger hover:bg-danger-bg"
              title="删除礼簿"
            >
              删除
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <PageScaffold
      title="礼簿管理"
      description="管理您的宴请礼簿，新建或进入收礼现场"
      actions={
        <div className="flex items-center gap-3">
          <button
            onClick={() => setBulkDeleteOpen(true)}
            disabled={selectedIds.size === 0}
            className="rounded-btn border border-danger px-4 py-2 text-sm font-medium text-danger disabled:cursor-not-allowed disabled:border-disabled disabled:text-disabled hover:bg-danger-bg disabled:hover:bg-transparent"
          >
            删除礼簿 {selectedIds.size > 0 && `(${selectedIds.size})`}
          </button>
          <Link
            to="/guestbooks/new"
            className="rounded-btn bg-primary px-5 py-2.5 text-sm font-semibold text-white"
          >
            ＋ 新建礼簿
          </Link>
        </div>
      }
    >
      {loading ? (
        <p className="py-10 text-center text-ink-secondary">加载中…</p>
      ) : guestbooks.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <span className="text-4xl">🧧</span>
          <p className="text-ink-secondary">还没有礼簿，新建一个开始收礼吧</p>
          <Link
            to="/guestbooks/new"
            className="rounded-btn bg-primary px-6 py-3 text-sm font-semibold text-white"
          >
            ＋ 新建礼簿
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {active.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={active.length > 0 && active.every((g) => g.id && selectedIds.has(g.id))}
                  onChange={() => toggleSelectAll(active.map((g) => g.id!).filter(Boolean))}
                  className="h-4 w-4 rounded border-line accent-primary"
                />
                <h2 className="text-sm font-bold text-ink">进行中的礼簿</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {active.map((gb) => (
                  <Card key={gb.id} gb={gb} />
                ))}
              </div>
            </section>
          )}
          {archived.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={archived.length > 0 && archived.every((g) => g.id && selectedIds.has(g.id))}
                  onChange={() => toggleSelectAll(archived.map((g) => g.id!).filter(Boolean))}
                  className="h-4 w-4 rounded border-line accent-primary"
                />
                <h2 className="text-sm font-bold text-ink-secondary">已归档的礼簿</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {archived.map((gb) => (
                  <Card key={gb.id} gb={gb} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="删除礼簿"
        message="确定删除该礼簿吗？此操作不可恢复。"
        variant="danger"
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        loading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title="批量删除礼簿"
        message={`确定删除选中的 ${selectedIds.size} 个礼簿吗？此操作不可恢复。`}
        variant="danger"
        confirmLabel="全部删除"
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
        loading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={bulkDeleteError !== null}
        title="删除失败"
        message={bulkDeleteError || '删除失败'}
        variant="warning"
        confirmLabel="确定"
        showCancel={false}
        onConfirm={() => setBulkDeleteError(null)}
        onCancel={() => setBulkDeleteError(null)}
      />

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}

/* ========================= 新建礼簿页 ========================= */

const eventTypes = [
  { value: 'wedding', label: '婚礼' },
  { value: 'fullmoon', label: '满月酒' },
  { value: 'birthday', label: '周岁宴' },
  { value: 'housewarming', label: '乔迁' },
  { value: 'graduation', label: '升学宴' },
  { value: 'funeral', label: '丧葬' },
  { value: 'holiday', label: '节日红包' },
  { value: 'other', label: '其他' },
]

export function GuestbookNewPage() {
  const navigate = useNavigate()
  const clientId = useAppStore((s) => s.clientId)
  const operatorName = useAppStore((s) => s.operatorName)
  const defaultCashAccountId = useAppStore((s) => s.defaultCashAccountId)
  const defaultWechatAccountId = useAppStore((s) => s.defaultWechatAccountId)
  const { toast, showToast } = useToast()
  const { data: existingGuestbooks = [] } = useAllGuestbookSummaries()

  const [name, setName] = useState('')
  const [eventType, setEventType] = useState('wedding')
  const [eventDate, setEventDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [note, setNote] = useState('')
  const [cashAccount, setCashAccount] = useState<number | undefined>(defaultCashAccountId)
  const [wechatAccount, setWechatAccount] = useState<number | undefined>(defaultWechatAccountId)
  const [duplicateWarning, setDuplicateWarning] = useState(false)

  const createMutation = useCreateGuestbook()
  const saveTerminal = useSaveTerminalSettings()
  const { data: cashAccounts = [] } = usePaymentAccounts({ type: 'cash' })
  const { data: wechatAccounts = [] } = usePaymentAccounts({ type: 'wechat' })

  const activeCash = (cashAccounts as PaymentAccount[]).filter((a) => a.is_active)
  const activeWechat = (wechatAccounts as PaymentAccount[]).filter((a) => a.is_active)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { showToast('请填写礼簿名称'); return }
    if (!eventDate) { showToast('请选择宴席日期'); return }
    
    const selectedCashAccount = activeCash.find((acc) => acc.id === cashAccount)
    const operatorNameValue = selectedCashAccount?.name || operatorName || ''
    if (!operatorNameValue.trim()) { showToast('请选择收银员'); return }

    const duplicate = existingGuestbooks.find((gb) => gb.name === name.trim())
    if (duplicate) {
      setDuplicateWarning(true)
      return
    }

    try {
      const gbId = await createMutation.mutateAsync({
        name: name.trim(),
        event_type: eventType,
        event_date: eventDate,
        operator_note: note || undefined,
      })
      await saveTerminal.mutateAsync({
        guestbook_id: gbId,
        client_id: clientId,
        operator_name: operatorNameValue.trim(),
        default_cash_account: cashAccount,
        default_wechat_account: wechatAccount,
      })
      showToast('礼簿创建成功')
      setTimeout(() => {
        navigate({ to: '/guestbooks/$id/collect', params: { id: String(gbId) } })
      }, 100)
    } catch (err) {
      console.error('创建礼簿失败:', err)
      showToast('创建失败：' + (err instanceof Error ? err.message : '未知错误'))
    }
  }

  const isPending = createMutation.isPending || saveTerminal.isPending

  return (
    <PageScaffold title="新建礼簿" description="创建新的宴请礼簿，开始现场收礼">
      <div className="mx-auto max-w-[36rem]">
        <form onSubmit={handleCreate} className="rounded-card bg-card p-6 shadow-card">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">礼簿名称 <span className="text-danger">*</span></span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：张三 & 李四 婚礼"
                className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
                autoFocus
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">宴席类型</span>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="h-12 rounded-btn border border-line bg-white px-4 text-base outline-none focus:border-2 focus:border-primary"
              >
                {eventTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">宴席日期 <span className="text-danger">*</span></span>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">收银员 <span className="text-danger">*</span></span>
              <select
                value={cashAccount ?? ''}
                onChange={(e) => setCashAccount(e.target.value ? Number(e.target.value) : undefined)}
                className="h-12 rounded-btn border border-line bg-white px-4 text-base outline-none focus:border-2 focus:border-primary"
              >
                <option value="">系统默认</option>
                {activeCash.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">微信账户</span>
              <select
                value={wechatAccount ?? ''}
                onChange={(e) => setWechatAccount(e.target.value ? Number(e.target.value) : undefined)}
                className="h-12 rounded-btn border border-line bg-white px-4 text-base outline-none focus:border-2 focus:border-primary"
              >
                <option value="">系统默认</option>
                {activeWechat.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">备注</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="选填，如地点、特殊情况说明"
                className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
              />
            </label>

            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => navigate({ to: '/guestbooks' })}
                disabled={isPending}
                className="flex-1 rounded-btn border border-line py-3 font-medium text-ink-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isPending || !name.trim() || !eventDate}
                className="flex-1 rounded-btn bg-primary py-3 font-bold text-white disabled:bg-disabled"
              >
                {isPending ? '创建中…' : '新建并记账'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={duplicateWarning}
        title="礼簿名称重复"
        message="已存在同名礼簿，请使用其他名称。"
        variant="warning"
        confirmLabel="确定"
        onConfirm={() => setDuplicateWarning(false)}
        onCancel={() => setDuplicateWarning(false)}
        showCancel={false}
      />

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
