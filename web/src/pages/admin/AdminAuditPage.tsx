import { useState, useMemo, useEffect } from 'react'
import PageScaffold from '../../components/PageScaffold'
import { useAdminAuditLogs } from '../../hooks/useQueries'
import { actionLabels, tableLabels } from '../../lib/admin-labels'
import type { OperationLog } from '../../types'

const actionOptions = [
  { value: '', label: '全部操作' },
  { value: 'CREATE', label: '创建' },
  { value: 'UPDATE', label: '更新' },
  { value: 'DELETE', label: '删除' },
  { value: 'MERGE', label: '合并' },
  { value: 'ARCHIVE', label: '归档' },
]

const tableOptions = [
  { value: '', label: '全部目标' },
  { value: 'gb_record', label: '收礼记录' },
  { value: 'daily_record', label: '日常记录' },
  { value: 'guestbook', label: '礼簿' },
  { value: 'person', label: '人员' },
  { value: 'payment_account', label: '收款账户' },
]

function tryParseJson(str: string | undefined): unknown {
  if (!str) return null
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

function JsonDiff({ before, after }: { before?: string; after?: string }) {
  const beforeData = tryParseJson(before)
  const afterData = tryParseJson(after)

  if (!beforeData && !afterData) {
    return (
      <div className="text-xs text-ink-secondary">
        {before && <div>变更前: {before}</div>}
        {after && <div>变更后: {after}</div>}
      </div>
    )
  }

  const allKeys = new Set<string>()
  if (beforeData && typeof beforeData === 'object') {
    Object.keys(beforeData as Record<string, unknown>).forEach((k) => allKeys.add(k))
  }
  if (afterData && typeof afterData === 'object') {
    Object.keys(afterData as Record<string, unknown>).forEach((k) => allKeys.add(k))
  }

  if (allKeys.size === 0) return null

  return (
    <div className="min-w-0 overflow-x-auto rounded-btn bg-bg p-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-ink-secondary">
            <th className="pr-4 font-medium">字段</th>
            <th className="pr-4 font-medium text-danger">变更前</th>
            <th className="font-medium text-success">变更后</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(allKeys).map((key) => {
            const oldVal = beforeData && typeof beforeData === 'object'
              ? (beforeData as Record<string, unknown>)[key]
              : undefined
            const newVal = afterData && typeof afterData === 'object'
              ? (afterData as Record<string, unknown>)[key]
              : undefined
            const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal)
            if (!changed) return null
            return (
              <tr key={key} className="border-t border-line/50">
                <td className="pr-4 py-1 font-medium text-ink">{key}</td>
                <td className="pr-4 py-1 text-danger">
                  {oldVal !== undefined ? String(oldVal) : '—'}
                </td>
                <td className="py-1 text-success">
                  {newVal !== undefined ? String(newVal) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function AdminAuditPage() {
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [tableFilter, setTableFilter] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    if (actionFilter) f.action_type = actionFilter
    if (tableFilter) f.target_table = tableFilter
    return f
  }, [actionFilter, tableFilter])

  useEffect(() => {
    setPage(1)
  }, [filters])

  const { data, isLoading } = useAdminAuditLogs(page, 20, filters)
  const logs = data?.items ?? []
  const pagination = data?.pagination

  return (
    <PageScaffold title="审计日志" description="系统操作记录追踪">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-9 rounded-btn border border-line bg-white px-3 text-sm outline-none focus:border-primary"
          >
            {actionOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            className="h-9 rounded-btn border border-line bg-white px-3 text-sm outline-none focus:border-primary"
          >
            {tableOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {(actionFilter || tableFilter) && (
            <button
              onClick={() => { setActionFilter(''); setTableFilter('') }}
              className="text-sm text-primary hover:underline"
            >
              清除筛选
            </button>
          )}
        </div>

        <div className="rounded-card bg-card shadow-card">
          {isLoading ? (
            <p className="p-5 text-sm text-ink-secondary">加载中…</p>
          ) : logs.length === 0 ? (
            <p className="p-5 text-sm text-ink-secondary">暂无操作记录</p>
          ) : (
            <div className="divide-y divide-line">
              {logs.map((log: OperationLog) => (
                <div key={log.id} className="px-5 py-3">
                  <button
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id ?? null)}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        log.action_type === 'CREATE' ? 'bg-success-bg text-success-deep' :
                        log.action_type === 'DELETE' ? 'bg-danger/10 text-danger' :
                        'bg-primary/10 text-primary'
                      }`}>
                        {actionLabels[log.action_type] ?? log.action_type}
                      </span>
                      <span className="text-sm text-ink">
                        {tableLabels[log.target_table] ?? log.target_table}
                      </span>
                      <span className="text-sm text-ink-secondary">#{log.target_id}</span>
                      {log.operator_name && (
                        <span className="text-xs text-ink-secondary">by {log.operator_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-ink-secondary">
                        {new Date(log.created_at).toLocaleString('zh-CN')}
                      </span>
                      <span className="text-xs text-ink-secondary">
                        {expandedId === log.id ? '▲' : '▼'}
                      </span>
                    </div>
                  </button>
                  {expandedId === log.id && (
                    <div className="mt-3">
                      {log.note && (
                        <p className="mb-2 text-xs text-ink-secondary">备注: {log.note}</p>
                      )}
                      {log.before_data || log.after_data ? (
                        <JsonDiff before={log.before_data} after={log.after_data} />
                      ) : (
                        <p className="text-xs text-ink-secondary">无变更详情</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <span className="text-xs text-ink-secondary">
                第 {pagination.page} / {pagination.total_pages} 页（共 {pagination.total_count} 条）
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-line px-3 py-1 text-xs disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                  disabled={page >= pagination.total_pages}
                  className="rounded-md border border-line px-3 py-1 text-xs disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageScaffold>
  )
}
