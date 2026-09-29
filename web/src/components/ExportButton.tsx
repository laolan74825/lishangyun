import { useState } from 'react'

interface ClientExportProps {
  mode?: 'client'
  data: unknown[]
  filename: string
  columns: { key: string; label: string; format?: (value: unknown) => string }[]
  format?: 'csv' | 'json'
}

interface ServerExportProps {
  mode: 'server'
  filename: string
  exportFn: () => Promise<Blob>
  label?: string
}

type ExportButtonProps = ClientExportProps | ServerExportProps

export default function ExportButton(props: ExportButtonProps) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      if (props.mode === 'server') {
        const blob = await props.exportFn()
        downloadBlob(blob, props.filename)
      } else {
        const { data, columns, filename, format = 'csv' } = props
        if (format === 'csv') {
          exportCSV(data, columns, filename)
        } else {
          exportJSON(data, filename)
        }
      }
    } finally {
      setExporting(false)
    }
  }

  const isEmpty = props.mode !== 'server' && props.data.length === 0
  const displayLabel = props.mode === 'server'
    ? (props.label ?? '导出 Excel')
    : `导出 ${(props.format ?? 'csv').toUpperCase()}`

  return (
    <button
      onClick={handleExport}
      disabled={exporting || isEmpty}
      className="rounded-btn border border-line px-4 py-2 text-sm font-medium text-ink-secondary hover:border-primary hover:text-primary disabled:opacity-50"
    >
      {exporting ? '导出中…' : displayLabel}
    </button>
  )
}

function exportCSV(
  data: unknown[],
  columns: { key: string; label: string; format?: (value: unknown) => string }[],
  filename: string,
) {
  const headers = columns.map((c) => c.label)
  const rows = data.map((row) =>
    columns.map((col) => {
      const value = (row as Record<string, unknown>)[col.key]
      const formatted = col.format ? col.format(value) : String(value ?? '')
      return `"${formatted.replace(/"/g, '""')}"`
    }).join(','),
  )

  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, `${filename}.csv`)
}

function exportJSON(data: unknown[], filename: string) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  downloadBlob(blob, `${filename}.json`)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
