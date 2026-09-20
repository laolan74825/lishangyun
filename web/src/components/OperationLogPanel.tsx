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
    const list = await getOperationLogs(guestbookId, 500)
    setLogs(list)
    setLoading(false)
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
    MERGE: { text: '合并', cls: 'bg-warning-bg text-warning' }
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
                {(log.before_data || log.after_data) && (
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : log.id!)}
                    className="mt-2 text-xs text-info hover:underline"
                  >
                    {isExpanded ? '收起数据快照' : '查看数据快照'}
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
