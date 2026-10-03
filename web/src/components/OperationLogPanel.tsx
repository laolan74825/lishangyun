import { useState, useEffect, useCallback, useMemo } from 'react'
import dayjs from 'dayjs'
import type { OperationLog } from '../types'
import { getOperationLogs } from '../lib/api-client'

/**
 * 操作日志面板（需求 F-5.x）
 * 嵌入 GuestbookDetailPage 的「日志」Tab
 * 日志只读，不可修改或删除（F-5.6）
 */
export default function OperationLogPanel({ guestbookId }: { guestbookId: number }) {
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [operatorFilter, setOperatorFilter] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 后端 page_size 上限 100
      const list = await getOperationLogs(guestbookId, 100)
      setLogs(list)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [guestbookId])

  useEffect(() => {
    load()
  }, [load])

  /* 筛选 */
  const filtered = useMemo(() => {
    let list = logs
    if (typeFilter) list = list.filter((l) => l.action_type === typeFilter)
    if (operatorFilter.trim()) {
      const k = operatorFilter.trim().toLowerCase()
      list = list.filter((l) => l.operator_name?.toLowerCase().includes(k))
    }
    return list
  }, [logs, typeFilter, operatorFilter])

  const actionLabel: Record<string, { text: string; cls: string }> = {
    CREATE: { text: '新增', cls: 'bg-success-bg text-success-deep' },
    UPDATE: { text: '编辑', cls: 'bg-info/10 text-info' },
    DELETE: { text: '删除', cls: 'bg-danger-bg text-danger' },
    RESTORE: { text: '恢复', cls: 'bg-primary/10 text-primary' },
    MERGE: { text: '合并', cls: 'bg-warning-bg text-warning' }
  }

  /* 精简摘要：从数据快照中提取非专业人员可读的信息 */
  const fieldLabels: Record<string, string> = {
    guest_name: '宾客',
    amount: '金额',
    payment_method: '支付方式',
    account_id: '收款账户',
    note: '备注',
    agent_name: '代送人',
    phone: '电话',
    check_status: '对账状态',
    is_private: '隐私',
  }
  const paymentText = (v: unknown) =>
    v === 'cash' ? '现金' : v === 'wechat' ? '微信' : v === 'other' ? '其他' : String(v ?? '—')
  const fieldValue = (key: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return '—'
    if (key === 'amount' && typeof v === 'number') return `¥${(v / 100).toFixed(2)}`
    if (key === 'payment_method') return paymentText(v)
    if (typeof v === 'boolean') return v ? '是' : '否'
    return String(v)
  }

  const summarize = (log: OperationLog): string | null => {
    try {
      let record: Record<string, unknown> | null = null
      let changes: Record<string, { from: unknown; to: unknown }> | null = null

      if (log.action_type === 'UPDATE') {
        // UPDATE 的 after_data 只有被修改的字段：与 before_data 合并还原完整记录
        const before = log.before_data ? JSON.parse(log.before_data) : {}
        const after = log.after_data ? JSON.parse(log.after_data) : {}
        record = { ...before, ...after }
        changes = {}
        for (const key of Object.keys(after)) {
          if (key in fieldLabels) changes[key] = { from: before[key], to: after[key] }
        }
      } else {
        const raw = log.after_data ?? log.before_data
        if (!raw) return null
        record = JSON.parse(raw)
      }

      if (!record || typeof record !== 'object' || !record.guest_name) return null
      const parts: string[] = [`宾客「${record.guest_name}」`]
      if (typeof record.amount === 'number') parts.push(`金额 ¥${(record.amount / 100).toFixed(2)}`)
      if (record.payment_method) parts.push(paymentText(record.payment_method))
      let summary = `收礼记录：${parts.join(' · ')}`
      if (changes && Object.keys(changes).length > 0) {
        const desc = Object.entries(changes)
          .map(([k, c]) => `${fieldLabels[k]} ${fieldValue(k, c.from)} → ${fieldValue(k, c.to)}`)
          .join('；')
        summary += `\n修改内容：${desc}`
      }
      return summary
    } catch {
      return null
    }
  }

  const formatJson = (json?: string) => {
    if (!json) return null
    try {
      const obj = JSON.parse(json)
      return (
        <pre className="max-h-48 overflow-auto rounded-btn bg-bg p-3 text-xs text-ink-secondary">
          {JSON.stringify(obj, null, 2)}
        </pre>
      )
    } catch {
      return <p className="text-xs text-ink-secondary">{json}</p>
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 筛选 */}
      <div className="flex flex-wrap gap-2">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-10 rounded-btn border border-line bg-white px-3 text-sm outline-none focus:border-primary"
        >
          <option value="">全部操作类型</option>
          <option value="CREATE">新增</option>
          <option value="UPDATE">编辑</option>
          <option value="DELETE">删除</option>
          <option value="RESTORE">恢复</option>
          <option value="MERGE">合并</option>
        </select>
        <input
          value={operatorFilter}
          onChange={(e) => setOperatorFilter(e.target.value)}
          placeholder="按操作人筛选…"
          className="h-10 rounded-btn border border-line px-3 text-sm outline-none focus:border-primary"
        />
        <span className="flex items-center text-sm text-ink-secondary">
          共 {filtered.length} 条日志
        </span>
      </div>

      {/* 日志列表 */}
      {loading ? (
        <p className="py-8 text-center text-ink-secondary">加载中…</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-ink-secondary">暂无操作日志</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((log) => {
            const act = actionLabel[log.action_type] ?? { text: log.action_type, cls: 'bg-bg text-ink' }
            const isExpanded = expandedId === log.id
            const summary = summarize(log)
            return (
              <div key={log.id} className="rounded-card bg-card p-4 shadow-card">
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${act.cls}`}>
                    {act.text}
                  </span>
                  <span className="text-sm font-medium text-ink">
                    {log.operator_name ?? '未知'}
                  </span>
                  {log.client_id && (
                    <span className="text-xs text-ink-secondary">
                      终端: {log.client_id.slice(0, 8)}…
                    </span>
                  )}
                  <span className="ml-auto text-xs text-ink-secondary">
                    {dayjs(log.created_at).format('YYYY-MM-DD HH:mm:ss')}
                  </span>
                </div>
                {/* 精简版：面向非专业人员的摘要（含编辑时的修改内容说明） */}
                <div className="mt-2 whitespace-pre-wrap text-sm text-ink">
                  {summary ?? `${log.target_table} #${log.target_id}`}
                </div>
                {log.note && (
                  <p className="mt-1 text-sm text-ink-secondary">
                    备注：{log.note}
                  </p>
                )}
                {(log.before_data || log.after_data) && (
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : log.id!)}
                    className="mt-2 text-xs text-info hover:underline"
                  >
                    {isExpanded ? '收起详细记录' : '查看详细记录'}
                  </button>
                )}
                {isExpanded && (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {log.before_data && (
                      <div>
                        <p className="text-xs font-medium text-danger">操作前</p>
                        {formatJson(log.before_data)}
                      </div>
                    )}
                    {log.after_data && (
                      <div>
                        <p className="text-xs font-medium text-success">操作后</p>
                        {formatJson(log.after_data)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
