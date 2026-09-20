import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import type { Guestbook } from '../types'
import { getAllGuestbooks, createGuestbook, guestbookSummary } from '../lib/api-client'

/* ========================= 礼簿列表页 ========================= */

interface GuestbookWithSummary extends Guestbook {
  summary?: Awaited<ReturnType<typeof guestbookSummary>>
}

export function GuestbookListPage() {
  const [guestbooks, setGuestbooks] = useState<GuestbookWithSummary[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    const list = await getAllGuestbooks()
    // 加载每个礼簿的汇总数据
    const withSummary = await Promise.all(
      list.map(async (gb) => {
        const sum = gb.id ? await guestbookSummary(gb.id) : undefined
        return { ...gb, summary: sum }
      })
    )
    setGuestbooks(withSummary)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const active = guestbooks.filter((g) => g.status === '收礼中')
  const completed = guestbooks.filter((g) => g.status === '已完成')

  const Card = ({ gb }: { gb: GuestbookWithSummary }) => {
    const pct = gb.summary && gb.summary.total_records > 0
      ? Math.round((gb.summary.checked_count / gb.summary.total_records) * 100)
      : 0
    return (
      <div className="flex h-full flex-col gap-3 rounded-card bg-card p-5 shadow-card transition-shadow hover:shadow-lg">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {gb.status === '收礼中' && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
              </span>
            )}
            <div>
              <h3 className="text-lg font-bold text-ink">{gb.name}</h3>
              <p className="mt-1 text-sm text-ink-secondary">
                {gb.event_type} · {gb.event_date}
              </p>
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              gb.status === '收礼中'
                ? 'bg-success-bg text-success-deep'
                : 'bg-gray-100 text-ink-secondary'
            }`}
          >
            {gb.status}
          </span>
        </div>
        {/* 汇总数据 */}
        {gb.summary && gb.summary.total_records > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <span className="font-bold text-ink">¥{(gb.summary.total_amount / 100).toFixed(2)}</span>
            <span className="text-ink-secondary">{gb.summary.total_records} 笔</span>
            <span className="text-ink-secondary">对账 {pct}%</span>
          </div>
        )}
        {/* 对账进度条 */}
        {gb.summary && gb.summary.total_records > 0 && (
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
          {gb.status === '收礼中' && (
            <Link
              to={`/guestbooks/${gb.id}/collect`}
              className="flex-1 rounded-btn bg-primary py-2.5 text-center text-sm font-semibold text-white"
            >
              进入收礼
            </Link>
          )}
          <button
            onClick={() => navigate(`/guestbooks/${gb.id}`)}
            className="rounded-btn border border-line px-4 py-2.5 text-sm font-medium text-ink-secondary hover:border-primary"
          >
            礼簿详情
          </button>
          {gb.status === '已完成' && (
            <button
              className="rounded-btn border border-info px-4 py-2.5 text-sm font-medium text-info hover:bg-info/10"
              title="合并到其他礼簿"
              onClick={() => alert('合并向导功能即将推出')}
            >
              合并
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
        <Link
          to="/guestbooks/new"
          className="rounded-btn bg-primary px-5 py-2.5 text-sm font-semibold text-white"
        >
          ＋ 新建礼簿
        </Link>
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
              <h2 className="mb-3 text-sm font-bold text-ink">进行中的礼簿</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {active.map((gb) => (
                  <Card key={gb.id} gb={gb} />
                ))}
              </div>
            </section>
          )}
          {completed.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-bold text-ink-secondary">已完成的礼簿</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {completed.map((gb) => (
                  <Card key={gb.id} gb={gb} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PageScaffold>
  )
}

/* ========================= 新建礼簿页 ========================= */

export function GuestbookNewPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [eventType, setEventType] = useState('婚礼')
  const [eventDate, setEventDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast, showToast } = useToast()

  const eventTypes = [
    '婚礼',
    '满月酒',
    '周岁宴',
    '乔迁',
    '升学宴',
    '寿宴',
    '回门宴',
    '其他'
  ]

  const handleSubmit = async () => {
    if (!name.trim()) {
      showToast('请填写礼簿名称')
      return
    }
    if (!eventDate) {
      showToast('请选择宴席日期')
      return
    }

    setLoading(true)
    try {
      const id = await createGuestbook({
        name: name.trim(),
        event_type: eventType,
        event_date: eventDate,
        status: '收礼中'
      })
      showToast('礼簿创建成功')
      // 短暂延迟后跳转
      setTimeout(() => {
        navigate(`/guestbooks/${id}/collect`)
      }, 600)
    } catch (e) {
      showToast('创建失败：' + (e as Error).message)
      setLoading(false)
    }
  }

  return (
    <PageScaffold title="新建礼簿" description="创建新的宴请礼簿，开始现场收礼">
      <div className="mx-auto max-w-[36rem] rounded-card bg-card p-6 shadow-card">
        {/* 名称 */}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">
            礼簿名称 <span className="text-danger">*</span>
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：张三 & 李四 婚礼"
            className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
          />
        </label>

        {/* 宴席类型 */}
        <label className="mt-4 flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">宴席类型</span>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="h-12 rounded-btn border border-line bg-white px-4 text-base outline-none focus:border-2 focus:border-primary"
          >
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        {/* 日期 */}
        <label className="mt-4 flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">
            宴席日期 <span className="text-danger">*</span>
          </span>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
          />
        </label>

        {/* 备注 */}
        <label className="mt-4 flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">备注</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="选填，如地点、特殊情况说明"
            className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
          />
        </label>

        {/* 操作按钮 */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => navigate('/guestbooks')}
            className="flex-1 rounded-btn border border-line py-3 font-medium text-ink-secondary"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !name.trim() || !eventDate}
            className="flex-1 rounded-btn bg-primary py-3 font-bold text-white disabled:bg-disabled"
          >
            {loading ? '创建中…' : '创建并进入收礼'}
          </button>
        </div>
      </div>

      {/* Toast */}
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
