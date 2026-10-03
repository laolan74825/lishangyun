import { useState, useMemo, type FormEvent } from 'react'
import { useParams, useNavigate, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatAmount } from '../types'
import type { DailyRecord, GbRecord } from '../types'
import {
  usePerson,
  usePersonTransactionSummary,
  usePersonDailyRecords,
  usePersonGbRecords,
  useBalanceAdjustments,
  useCreateBalanceAdjustment,
  useDeletePerson,
} from '../hooks/useQueries'

type TimelineItem = {
  type: 'daily' | 'gb'
  date: string
  amount: number
  direction: 'in' | 'out'
  eventLabel: string
  source?: string
  record: DailyRecord | GbRecord
}

/** 历史记录中可能存的是事由英文编码，展示时映射为中文；自由文本原样展示 */
const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: '婚礼',
  engagement: '订婚',
  birthday: '周岁宴',
  fullmoon: '满月酒',
  birthday_banquet: '生日/寿宴',
  housewarming: '乔迁',
  graduation: '升学宴',
  funeral: '丧葬',
  holiday: '节日红包',
  other: '其他',
}

const eventTypeLabel = (v: string) => EVENT_TYPE_LABELS[v] ?? v

export default function PersonDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const personId = Number(id)
  const navigate = useNavigate()
  const { toast, showToast } = useToast()

  const { data: person, isLoading } = usePerson(personId)
  const { data: txSummary } = usePersonTransactionSummary(personId)
  const { data: dailyRecords = [] } = usePersonDailyRecords(personId)
  const { data: gbRecords = [] } = usePersonGbRecords(personId)
  const { data: adjustmentsRes } = useBalanceAdjustments(personId)
  const createAdjustment = useCreateBalanceAdjustment()
  const deletePerson = useDeletePerson()

  const [showAdjustForm, setShowAdjustForm] = useState(false)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const adjustments = adjustmentsRes?.items ?? []

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = []

    for (const r of dailyRecords) {
      items.push({
        type: 'daily',
        date: r.event_date,
        amount: r.amount,
        direction: r.type,
        eventLabel: eventTypeLabel(r.event_type),
        source: r.source === 'guestbook' ? '礼簿' : '日常',
        record: r,
      })
    }

    for (const r of gbRecords) {
      items.push({
        type: 'gb',
        date: r.record_time?.slice(0, 10) ?? '',
        amount: r.amount,
        direction: 'in',
        eventLabel: `礼簿收款`,
        source: `礼簿 #${r.guestbook_id}`,
        record: r,
      })
    }

    items.sort((a, b) => b.date.localeCompare(a.date))
    return items
  }, [dailyRecords, gbRecords])

  const groupedTimeline = useMemo(() => {
    const groups = new Map<string, TimelineItem[]>()
    for (const item of timeline) {
      const key = item.date.slice(0, 7)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [timeline])

  if (isLoading) {
    return (
      <PageScaffold title="人员详情">
        <div className="py-20 text-center text-ink-secondary">加载中…</div>
      </PageScaffold>
    )
  }

  if (!person) {
    return (
      <PageScaffold title="人员详情">
        <div className="flex flex-col items-center gap-4 py-20">
          <span className="text-4xl">😕</span>
          <p className="text-ink-secondary">未找到该人员</p>
          <Link to="/people" className="text-primary hover:underline">返回人员列表</Link>
        </div>
      </PageScaffold>
    )
  }

  const net = txSummary?.net ?? 0
  const totalOut = txSummary?.total_out ?? 0
  const totalIn = txSummary?.total_in ?? 0

  async function handleAdjustSubmit(e: FormEvent) {
    e.preventDefault()
    const amountYuan = parseFloat(adjustAmount)
    if (isNaN(amountYuan) || amountYuan === 0) {
      showToast('请输入有效金额')
      return
    }
    const amountFen = Math.round(amountYuan * 100)

    try {
      await createAdjustment.mutateAsync({
        person_id: personId,
        amount: amountFen,
        reason: adjustReason || '手动调整',
      })
      showToast('差额调整成功')
      setShowAdjustForm(false)
      setAdjustAmount('')
      setAdjustReason('')
    } catch (err) {
      showToast('调整失败：' + (err instanceof Error ? err.message : '未知错误'))
    }
  }

  async function handleDelete() {
    try {
      await deletePerson.mutateAsync(personId)
      showToast('人员已删除')
      navigate({ to: '/people' })
    } catch (err) {
      showToast('删除失败：' + (err instanceof Error ? err.message : '未知错误'))
    }
  }

  return (
    <PageScaffold
      title={person.name}
      description={person.relation_tag}
      actions={
        <div className="flex gap-2">
          <Link
            to="/merge/$id"
            params={{ id: String(personId) }}
            className="rounded-btn border border-info px-4 py-2 text-sm text-info hover:bg-info/10"
          >
            合并
          </Link>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-btn border border-danger px-4 py-2 text-sm text-danger hover:bg-danger-bg"
          >
            删除
          </button>
          <Link
            to="/people"
            className="rounded-btn border border-line px-4 py-2 text-sm text-ink-secondary hover:border-primary"
          >
            返回列表
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* 人员档案 */}
        <div className="rounded-card bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
              {person.name.charAt(0)}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-ink">{person.name}</h2>
              {person.nickname && <p className="text-sm text-ink-secondary">称谓：{person.nickname}</p>}
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-ink-secondary">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">{person.relation_tag}</span>
                {person.phone && <span>电话：{person.phone}</span>}
                {person.aliases.length > 0 && <span>别名：{person.aliases.join('、')}</span>}
              </div>
              {person.note && <p className="mt-2 text-sm text-ink-secondary">{person.note}</p>}
            </div>
          </div>
        </div>

        {/* 收支汇总 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-card bg-card p-4 shadow-card">
            <p className="text-caption text-ink-secondary">送出去</p>
            <p className="mt-1 text-2xl font-bold text-danger">¥{formatAmount(totalOut)}</p>
          </div>
          <div className="rounded-card bg-card p-4 shadow-card">
            <p className="text-caption text-ink-secondary">收进来</p>
            <p className="mt-1 text-2xl font-bold text-success">¥{formatAmount(totalIn)}</p>
          </div>
          <div className="rounded-card bg-card p-4 shadow-card">
            <p className="text-caption text-ink-secondary">净差额</p>
            <p className={`mt-1 text-2xl font-bold ${net >= 0 ? 'text-success' : 'text-danger'}`}>
              {net >= 0 ? '+' : ''}¥{formatAmount(net)}
            </p>
          </div>
        </div>

        {/* 差额调整 */}
        <div className="rounded-card bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-ink">差额调整</h3>
            <button
              onClick={() => setShowAdjustForm(!showAdjustForm)}
              className="rounded-btn bg-primary/10 px-3 py-1.5 text-sm text-primary hover:bg-primary/20"
            >
              {showAdjustForm ? '取消' : '+ 新增调整'}
            </button>
          </div>

          {showAdjustForm && (
            <form onSubmit={handleAdjustSubmit} className="mt-4 flex flex-col gap-3 rounded-lg bg-bg p-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-sm text-ink-secondary">金额（元，正数为收到，负数为送出）</label>
                  <input
                    type="number"
                    step="0.01"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    placeholder="如：500 或 -200"
                    className="w-full rounded-lg border border-line bg-card px-3 py-2 text-ink outline-none focus:border-primary"
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-sm text-ink-secondary">原因</label>
                  <input
                    type="text"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="选填"
                    className="w-full rounded-lg border border-line bg-card px-3 py-2 text-ink outline-none focus:border-primary"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={createAdjustment.isPending || !adjustAmount}
                className="self-end rounded-btn bg-primary px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {createAdjustment.isPending ? '提交中…' : '确认调整'}
              </button>
            </form>
          )}

          {adjustments.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2">
              {adjustments.map((adj) => (
                <div key={adj.id} className="flex items-center justify-between rounded-lg bg-bg px-3 py-2 text-sm">
                  <span className="text-ink-secondary">{dayjs(adj.created_at).format('YYYY-MM-DD')}</span>
                  <span className={adj.amount >= 0 ? 'text-success' : 'text-danger'}>
                    {adj.amount >= 0 ? '+' : ''}¥{formatAmount(adj.amount)}
                  </span>
                  <span className="text-ink-secondary">{adj.reason}</span>
                </div>
              ))}
            </div>
          ) : (
            !showAdjustForm && <p className="mt-4 text-center text-sm text-ink-secondary">暂无调整记录</p>
          )}
        </div>

        {/* 往来时间线 */}
        <div className="rounded-card bg-card p-5 shadow-card">
          <h3 className="mb-4 text-lg font-bold text-ink">往来明细</h3>
          {groupedTimeline.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-secondary">暂无往来记录</p>
          ) : (
            <div className="flex flex-col gap-6">
              {groupedTimeline.map(([month, items]) => (
                <div key={month}>
                  <h4 className="mb-2 text-sm font-semibold text-ink-secondary">{month}</h4>
                  <div className="flex flex-col gap-2">
                    {items.map((item, idx) => (
                      <div key={`${item.type}-${idx}`} className="flex items-center gap-3 rounded-lg bg-bg px-3 py-2">
                        <span className="w-20 text-sm text-ink-secondary">
                          {dayjs(item.date).format('MM-DD')}
                        </span>
                        <span className={`flex-1 text-sm ${item.direction === 'out' ? 'text-danger' : 'text-success'}`}>
                          {item.direction === 'out' ? '送出' : '收到'}
                        </span>
                        <span className="text-sm text-ink-secondary">{item.eventLabel}</span>
                        <span className={`w-24 text-right text-sm font-semibold ${item.direction === 'out' ? 'text-danger' : 'text-success'}`}>
                          {item.direction === 'out' ? '-' : '+'}¥{formatAmount(item.amount)}
                        </span>
                        {item.source && (
                          <span className="w-16 text-right text-xs text-ink-secondary">{item.source}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="删除人员"
        message={`确定删除「${person.name}」吗？相关记录不会被删除。`}
        variant="danger"
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        loading={deletePerson.isPending}
      />

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
