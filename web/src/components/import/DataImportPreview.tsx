import type { ImportPreviewRow } from '../../lib/api-client'

interface DataImportPreviewProps {
  rows: ImportPreviewRow[]
  importType: 'daily_record' | 'gb_record' | 'guestbook'
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
}

type FilterKey = 'all' | 'valid' | 'invalid' | 'duplicate'

import { useState } from 'react'

export default function DataImportPreview({
  rows,
  importType,
  totalRows,
  validRows,
  invalidRows,
  duplicateRows,
}: DataImportPreviewProps) {
  const [filter, setFilter] = useState<FilterKey>('all')

  const columns = importType === 'daily_record'
    ? ['姓名', '电话', '类型', '金额', '事由', '支付方式', '日期', '备注']
    : ['宾客姓名', '电话', '金额', '支付方式', '收银人', '记账时间', '备注']

  const filtered = rows.filter((r) => {
    if (filter === 'valid') return r.is_valid && !r.is_duplicate
    if (filter === 'invalid') return !r.is_valid
    if (filter === 'duplicate') return r.is_duplicate
    return true
  })

  const filters: { key: FilterKey; label: string; count: number; color: string }[] = [
    { key: 'all', label: '全部', count: totalRows, color: 'text-ink-secondary' },
    { key: 'valid', label: '通过', count: validRows, color: 'text-success' },
    { key: 'invalid', label: '失败', count: invalidRows, color: 'text-danger' },
    { key: 'duplicate', label: '重复', count: duplicateRows, color: 'text-warning' },
  ]

  const getRowClass = (r: ImportPreviewRow) => {
    if (!r.is_valid) return 'bg-danger-bg/40'
    if (r.is_duplicate) return 'bg-warning-bg/40'
    return ''
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 筛选栏 */}
      <div className="flex items-center gap-3">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-btn px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-primary text-white'
                : 'bg-bg text-ink-secondary hover:text-ink'
            }`}
          >
            {f.label}
            <span className={`ml-1.5 ${filter === f.key ? 'text-white/80' : f.color}`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto rounded-card border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-bg">
              <th className="px-3 py-2.5 text-left font-medium text-ink-secondary">行号</th>
              {columns.map((col) => (
                <th key={col} className="px-3 py-2.5 text-left font-medium text-ink-secondary whitespace-nowrap">
                  {col}
                </th>
              ))}
              <th className="px-3 py-2.5 text-left font-medium text-ink-secondary">状态</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.row_number} className={`border-b border-line/50 ${getRowClass(row)}`}>
                <td className="px-3 py-2 text-ink-secondary">{row.row_number}</td>
                {columns.map((col) => (
                  <td key={col} className="px-3 py-2 text-ink whitespace-nowrap">
                    {row.data[col] ?? ''}
                  </td>
                ))}
                <td className="px-3 py-2">
                  {!row.is_valid ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-danger">校验失败</span>
                      {row.errors.map((err, i) => (
                        <span key={i} className="text-xs text-danger/80">{err}</span>
                      ))}
                    </div>
                  ) : row.is_duplicate ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-warning">重复</span>
                      {row.duplicate_summary && (
                        <span className="text-xs text-warning/80">{row.duplicate_summary}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-success">通过</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-ink-secondary">无匹配行</p>
        )}
      </div>
    </div>
  )
}
