import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import DataImportPreview from '../components/import/DataImportPreview'
import {
  downloadImportTemplate,
  previewImport,
  commitImport,
  type ImportPreviewResult,
} from '../lib/api-client'
import { getAllGuestbooks } from '../lib/api-client'

type ImportType = 'daily_record' | 'gb_record'
type DuplicateStrategy = 'skip' | 'overwrite' | 'import_all'
type Step = 'upload' | 'preview' | 'result'

export default function DataImportPage() {
  const { toast, showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [importType, setImportType] = useState<ImportType>('daily_record')
  const [guestbookId, setGuestbookId] = useState<number | undefined>()
  const [step, setStep] = useState<Step>('upload')
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip')
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)

  const { data: guestbooks = [] } = useQuery({
    queryKey: ['guestbooks-simple'],
    queryFn: () => getAllGuestbooks(),
    enabled: importType === 'gb_record',
  })

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadImportTemplate(importType)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = importType === 'daily_record' ? '日常记录导入模板.xlsx' : '礼簿记录导入模板.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      showToast('下载模板失败：' + (e as Error).message)
    }
  }

  const handleFileSelect = async (file: File) => {
    if (!file) return
    if (importType === 'gb_record' && !guestbookId) {
      showToast('请先选择目标礼簿')
      return
    }

    setPreviewing(true)
    try {
      const res = await previewImport(file, importType, guestbookId)
      setPreview(res)
      setStep('preview')
    } catch (e) {
      showToast('预览失败：' + (e as Error).message)
    } finally {
      setPreviewing(false)
    }
  }

  const handleCommit = async () => {
    if (!preview) return
    setCommitting(true)
    try {
      const validIndices = preview.rows
        .map((r, i) => (r.is_valid && !r.is_duplicate ? i : -1))
        .filter((i) => i >= 0)

      const res = await commitImport(
        preview.file_name,
        importType,
        validIndices,
        duplicateStrategy,
        guestbookId,
      )
      setResult({ imported: res.imported_count, skipped: res.skipped_count })
      setStep('result')
      showToast(`导入完成：成功 ${res.imported_count} 条，跳过 ${res.skipped_count} 条`)
    } catch (e) {
      showToast('导入失败：' + (e as Error).message)
    } finally {
      setCommitting(false)
    }
  }

  const handleReset = () => {
    setStep('upload')
    setPreview(null)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <PageScaffold
      title="数据导入"
      description="从 Excel 或 CSV 文件批量导入记录"
    >
      <div className="flex flex-col gap-5">
        {/* 导入类型选择 */}
        <div className="rounded-card bg-card p-5 shadow-card">
          <h3 className="mb-3 text-sm font-semibold text-ink">1. 选择导入类型</h3>
          <div className="flex gap-3">
            <button
              onClick={() => { setImportType('daily_record'); handleReset() }}
              className={`flex-1 rounded-btn border-2 px-4 py-3 text-sm font-medium transition-colors ${
                importType === 'daily_record'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-line text-ink-secondary hover:border-primary/50'
              }`}
            >
              日常记录
              <span className="mt-1 block text-xs opacity-70">个人礼金往来明细</span>
            </button>
            <button
              onClick={() => { setImportType('gb_record'); handleReset() }}
              className={`flex-1 rounded-btn border-2 px-4 py-3 text-sm font-medium transition-colors ${
                importType === 'gb_record'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-line text-ink-secondary hover:border-primary/50'
              }`}
            >
              礼簿记录
              <span className="mt-1 block text-xs opacity-70">某个礼簿的收礼记录</span>
            </button>
          </div>
        </div>

        {/* 礼簿选择（仅礼簿记录类型） */}
        {importType === 'gb_record' && (
          <div className="rounded-card bg-card p-5 shadow-card">
            <h3 className="mb-3 text-sm font-semibold text-ink">2. 选择目标礼簿</h3>
            <select
              value={guestbookId ?? ''}
              onChange={(e) => setGuestbookId(e.target.value ? Number(e.target.value) : undefined)}
              className="h-11 w-full rounded-btn border border-line px-4 text-sm outline-none focus:border-primary"
            >
              <option value="">请选择礼簿…</option>
              {guestbooks.map((gb) => (
                <option key={gb.id} value={gb.id}>{gb.name} ({gb.event_date})</option>
              ))}
            </select>
          </div>
        )}

        {/* 下载模板 + 上传文件 */}
        <div className="rounded-card bg-card p-5 shadow-card">
          <h3 className="mb-3 text-sm font-semibold text-ink">
            {importType === 'gb_record' ? '3' : '2'}. 上传文件
          </h3>
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={handleDownloadTemplate}
              className="rounded-btn border border-line px-3 py-1.5 text-xs font-medium text-ink-secondary hover:border-primary hover:text-primary"
            >
              下载导入模板
            </button>
            <span className="text-xs text-ink-secondary">
              支持 .xlsx / .csv，最大 5MB，最多 10,000 行
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileSelect(file)
              }}
              className="hidden"
              id="import-file"
            />
            <label
              htmlFor="import-file"
              className="cursor-pointer rounded-btn bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {previewing ? '解析中…' : '选择文件'}
            </label>
            {previewing && (
              <span className="text-sm text-ink-secondary">正在校验数据…</span>
            )}
          </div>
        </div>

        {/* 预览步骤 */}
        {step === 'preview' && preview && (
          <div className="flex flex-col gap-4">
            <div className="rounded-card bg-card p-5 shadow-card">
              <h3 className="mb-3 text-sm font-semibold text-ink">校验结果</h3>
              <DataImportPreview
                rows={preview.rows}
                importType={importType}
                totalRows={preview.total_rows}
                validRows={preview.valid_rows}
                invalidRows={preview.invalid_rows}
                duplicateRows={preview.duplicate_rows}
              />
            </div>

            {/* 重复策略 */}
            {preview.duplicate_rows > 0 && (
              <div className="rounded-card bg-card p-5 shadow-card">
                <h3 className="mb-3 text-sm font-semibold text-ink">重复处理策略</h3>
                <div className="flex flex-col gap-2">
                  {[
                    { value: 'skip' as const, label: '跳过重复行', desc: '仅导入不重复的记录' },
                    { value: 'import_all' as const, label: '全部导入', desc: '包含重复记录在内全部导入' },
                  ].map((opt) => (
                    <label key={opt.value} className="flex cursor-pointer items-center gap-3 rounded-btn border border-line px-4 py-3">
                      <input
                        type="radio"
                        name="dup-strategy"
                        value={opt.value}
                        checked={duplicateStrategy === opt.value}
                        onChange={() => setDuplicateStrategy(opt.value)}
                        className="accent-primary"
                      />
                      <div>
                        <div className="text-sm font-medium text-ink">{opt.label}</div>
                        <div className="text-xs text-ink-secondary">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={handleReset}
                className="rounded-btn border border-line px-5 py-2.5 text-sm font-medium text-ink-secondary"
              >
                重新上传
              </button>
              <button
                onClick={handleCommit}
                disabled={committing || preview.valid_rows === 0}
                className="rounded-btn bg-primary px-6 py-2.5 text-sm font-semibold text-white disabled:bg-disabled"
              >
                {committing ? '导入中…' : `确认导入（${preview.valid_rows} 条）`}
              </button>
            </div>
          </div>
        )}

        {/* 结果步骤 */}
        {step === 'result' && result && (
          <div className="rounded-card bg-card p-8 text-center shadow-card">
            <span className="text-4xl">✅</span>
            <h3 className="mt-4 text-lg font-bold text-ink">导入完成</h3>
            <p className="mt-2 text-sm text-ink-secondary">
              成功导入 {result.imported} 条记录，跳过 {result.skipped} 条
            </p>
            <button
              onClick={handleReset}
              className="mt-6 rounded-btn bg-primary px-6 py-2.5 text-sm font-semibold text-white"
            >
              继续导入
            </button>
          </div>
        )}
      </div>

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
