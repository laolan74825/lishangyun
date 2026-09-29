import { useState } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import type { Person, PersonMergeResult } from '../types'
import { searchPersons, mergePersons } from '../lib/api-client'
import { queryKeys } from '../hooks/queryKeys'

const STEPS = ['select', 'preview', 'confirm', 'done'] as const
type Step = (typeof STEPS)[number]

export default function MergeWizardPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const sourcePersonId = Number(id)
  const queryClient = useQueryClient()
  const { toast, showToast } = useToast()

  const [step, setStep] = useState<Step>('select')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<Person[]>([])
  const [selectedTarget, setSelectedTarget] = useState<Person | null>(null)
  const [mergeResult, setMergeResult] = useState<PersonMergeResult | null>(null)

  const searchMutation = useMutation({
    mutationFn: (keyword: string) => searchPersons(keyword),
    onSuccess: (data) => {
      setSearchResults(data.filter((p) => p.id !== sourcePersonId))
    },
    onError: (err: Error) => {
      showToast('搜索失败：' + err.message)
    },
  })

  const mergeMutation = useMutation({
    mutationFn: () => mergePersons(sourcePersonId, selectedTarget!.id!),
    onSuccess: (data) => {
      setMergeResult(data)
      setStep('done')
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.all })
    },
    onError: (err: Error) => {
      showToast('合并失败：' + err.message)
    },
  })

  function handleSearch() {
    if (!searchKeyword.trim()) return
    searchMutation.mutate(searchKeyword.trim())
  }

  function handleSelectTarget(person: Person) {
    setSelectedTarget(person)
    setStep('preview')
  }

  function handleConfirmMerge() {
    mergeMutation.mutate()
  }

  if (sourcePersonId <= 0) {
    return (
      <PageScaffold title="人员合并">
        <div className="py-20 text-center text-ink-secondary">无效的人员 ID</div>
      </PageScaffold>
    )
  }

  return (
    <PageScaffold
      title="人员合并向导"
      description="将重复的人员记录合并为一个"
      actions={
        <Link
          to="/people"
          className="rounded-btn border border-line px-4 py-2 text-sm text-ink-secondary hover:border-primary"
        >
          取消
        </Link>
      }
    >
      <div className="mx-auto max-w-2xl">
        {/* 步骤指示器 */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((s, idx) => {
            const currentIdx = STEPS.indexOf(step)
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                    step === s
                      ? 'bg-primary text-white'
                      : idx < currentIdx
                        ? 'bg-success text-white'
                        : 'bg-bg text-ink-secondary'
                  }`}
                >
                  {idx + 1}
                </div>
                {idx < 3 && <div className="h-0.5 w-8 bg-line" />}
              </div>
            )
          })}
        </div>

        {/* 步骤 1: 选择目标人员 */}
        {step === 'select' && (
          <div className="rounded-card bg-card p-6 shadow-card">
            <h2 className="mb-4 text-lg font-bold text-ink">选择要合并到的目标人员</h2>
            <p className="mb-4 text-sm text-ink-secondary">
              搜索并选择要将当前人员合并到的目标人员。合并后，当前人员的所有记录将转移到目标人员。
            </p>

            <div className="mb-4 flex gap-2">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="输入姓名搜索..."
                className="flex-1 rounded-lg border border-line px-3 py-2 outline-none focus:border-primary"
              />
              <button
                onClick={handleSearch}
                disabled={searchMutation.isPending || !searchKeyword.trim()}
                className="rounded-btn bg-primary px-6 py-2 font-semibold text-white disabled:opacity-50"
              >
                {searchMutation.isPending ? '搜索中…' : '搜索'}
              </button>
            </div>

            {searchResults.length > 0 ? (
              <div className="flex flex-col gap-2">
                {searchResults.map((person) => (
                  <button
                    key={person.id}
                    onClick={() => handleSelectTarget(person)}
                    className="flex items-center justify-between rounded-lg border border-line p-3 text-left hover:border-primary hover:bg-primary/5"
                  >
                    <div>
                      <p className="font-semibold text-ink">{person.name}</p>
                      {person.phone && (
                        <p className="text-sm text-ink-secondary">电话：{person.phone}</p>
                      )}
                      {person.relation_tag && (
                        <p className="text-xs text-ink-secondary">关系：{person.relation_tag}</p>
                      )}
                    </div>
                    <span className="text-primary">选择 →</span>
                  </button>
                ))}
              </div>
            ) : (
              searchMutation.isSuccess && (
                <p className="py-8 text-center text-sm text-ink-secondary">未找到匹配的人员</p>
              )
            )}
          </div>
        )}

        {/* 步骤 2: 预览合并 */}
        {step === 'preview' && selectedTarget && (
          <div className="rounded-card bg-card p-6 shadow-card">
            <h2 className="mb-4 text-lg font-bold text-ink">确认合并信息</h2>
            <div className="mb-6 rounded-lg bg-warning-bg p-4">
              <p className="text-sm text-warning">
                ⚠️ 合并操作不可撤销。请仔细核对以下信息。
              </p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-danger-bg p-4">
                <p className="mb-2 text-xs font-semibold text-danger">将被合并（源人员）</p>
                <p className="text-lg font-bold text-ink">人员 #{sourcePersonId}</p>
                <p className="mt-1 text-sm text-ink-secondary">此人员的记录将全部转移</p>
              </div>
              <div className="rounded-lg bg-success-bg p-4">
                <p className="mb-2 text-xs font-semibold text-success">合并到（目标人员）</p>
                <p className="text-lg font-bold text-ink">{selectedTarget.name}</p>
                {selectedTarget.phone && (
                  <p className="mt-1 text-sm text-ink-secondary">电话：{selectedTarget.phone}</p>
                )}
              </div>
            </div>

            <div className="mb-6 rounded-lg bg-bg p-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">合并后将发生：</h3>
              <ul className="flex flex-col gap-1 text-sm text-ink-secondary">
                <li>• 源人员的所有收礼记录将转移到目标人员</li>
                <li>• 源人员的所有日常记录将转移到目标人员</li>
                <li>• 源人员的别名将合并到目标人员</li>
                <li>• 源人员将被标记为已删除</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('select')}
                className="flex-1 rounded-btn border border-line py-2.5 font-semibold text-ink-secondary hover:border-primary"
              >
                返回选择
              </button>
              <button
                onClick={() => setStep('confirm')}
                className="flex-1 rounded-btn bg-primary py-2.5 font-semibold text-white hover:bg-primary-deep"
              >
                继续
              </button>
            </div>
          </div>
        )}

        {/* 步骤 3: 最终确认 */}
        {step === 'confirm' && selectedTarget && (
          <div className="rounded-card bg-card p-6 shadow-card">
            <h2 className="mb-4 text-lg font-bold text-ink">最终确认</h2>
            <div className="mb-6 rounded-lg bg-danger-bg p-4">
              <p className="text-sm font-semibold text-danger">
                🔴 您即将执行合并操作，此操作不可撤销！
              </p>
            </div>

            <div className="mb-6 rounded-lg bg-bg p-4">
              <p className="text-sm text-ink">
                将 <strong>人员 #{sourcePersonId}</strong> 合并到 <strong>{selectedTarget.name}</strong>
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('preview')}
                disabled={mergeMutation.isPending}
                className="flex-1 rounded-btn border border-line py-2.5 font-semibold text-ink-secondary hover:border-primary disabled:opacity-50"
              >
                返回修改
              </button>
              <button
                onClick={handleConfirmMerge}
                disabled={mergeMutation.isPending}
                className="flex-1 rounded-btn bg-danger py-2.5 font-semibold text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {mergeMutation.isPending ? '合并中…' : '确认合并'}
              </button>
            </div>
          </div>
        )}

        {/* 步骤 4: 完成 */}
        {step === 'done' && mergeResult && (
          <div className="rounded-card bg-card p-6 shadow-card">
            <div className="mb-6 text-center">
              <div className="mb-4 text-5xl">✅</div>
              <h2 className="mb-2 text-xl font-bold text-ink">合并成功</h2>
              <p className="text-sm text-ink-secondary">人员记录已成功合并</p>
            </div>

            <div className="mb-6 rounded-lg bg-success-bg p-4">
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-secondary">目标人员 ID</span>
                  <span className="font-semibold text-ink">{mergeResult.target_person_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-secondary">迁移收礼记录</span>
                  <span className="font-semibold text-ink">{mergeResult.migrated_gb_records} 条</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-secondary">迁移日常记录</span>
                  <span className="font-semibold text-ink">{mergeResult.migrated_daily_records} 条</span>
                </div>
                {mergeResult.merged_aliases.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-ink-secondary">合并别名</span>
                    <span className="font-semibold text-ink">{mergeResult.merged_aliases.join('、')}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Link
                to="/people"
                className="flex-1 rounded-btn border border-line py-2.5 text-center font-semibold text-ink-secondary hover:border-primary"
              >
                返回人员列表
              </Link>
              <Link
                to="/people/$id"
                params={{ id: String(mergeResult.target_person_id) }}
                className="flex-1 rounded-btn bg-primary py-2.5 text-center font-semibold text-white hover:bg-primary-deep"
              >
                查看目标人员
              </Link>
            </div>
          </div>
        )}
      </div>

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
