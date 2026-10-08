import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import {
  useGuestbook,
  useGbRecords,
  usePersons,
  useMergeGuestbookPersons,
  useMergeCreatePersons,
} from '../hooks/useQueries'
import type { GbRecord, Person } from '../types'
import { formatFen } from '../lib/format'

/**
 * 礼簿合并向导：将礼簿内的收礼记录与人员库建立关联（不搬迁数据）。
 *
 * 预览规则与后端一致：
 * - 有电话的宾客优先按「姓名 + 电话」精确匹配
 * - 其次按「姓名」精确匹配；人员库中同名多人时视为无法匹配（避免错误关联）
 * - 已建立关联的记录不再重复合并
 *
 * 执行合并后礼簿标记为"已合并"，后续的修改/补录记录会自动解析人员关联。
 */
export default function GuestbookMergePage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const guestbookId = Number(id)
  const { toast, showToast } = useToast()

  const { data: guestbook, isLoading: gbLoading } = useGuestbook(guestbookId)
  const { data: records = [], isLoading: recordsLoading } = useGbRecords(guestbookId)
  const { data: persons = [], isLoading: personsLoading } = usePersons()
  const mergeMutation = useMergeGuestbookPersons()
  const createPersonsMutation = useMergeCreatePersons()
  const [result, setResult] = useState<{ linked: number; unmatched: number; already_linked: number } | null>(null)
  const [createResult, setCreateResult] = useState<{ created: number; linked_existing: number; skipped: number } | null>(null)
  // 勾选要"按礼簿数据新建人员"的无法匹配记录（默认全选）
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // 与后端 match_person_id 相同的匹配逻辑（用于预览）
  const preview = useMemo(() => {
    // 人员库：姓名 -> 人员列表（未删除）
    const byName = new Map<string, Person[]>()
    for (const p of persons) {
      if (p.is_deleted) continue
      const list = byName.get(p.name) ?? []
      list.push(p)
      byName.set(p.name, list)
    }
    const match = (r: GbRecord): Person | null => {
      const candidates = byName.get(r.guest_name) ?? []
      if (candidates.length === 0) return null
      if (r.phone) {
        const byPhone = candidates.filter((p) => p.phone === r.phone)
        if (byPhone.length === 1) return byPhone[0]
        if (byPhone.length > 1) return null
      }
      return candidates.length === 1 ? candidates[0] : null
    }

    const matched: { record: GbRecord; person: Person }[] = []
    const unmatched: GbRecord[] = []
    const already: GbRecord[] = []
    for (const r of records) {
      if (r.is_deleted) continue
      if (r.person_id) {
        already.push(r)
        continue
      }
      const person = match(r)
      if (person) matched.push({ record: r, person })
      else unmatched.push(r)
    }
    return { matched, unmatched, already }
  }, [records, persons])

  // 无法匹配记录变化时（首次加载 / 新建人员后刷新），勾选集合重置为全选
  const unmatchedIds = useMemo(() => preview.unmatched.map((r) => r.id).filter((id): id is number => id != null), [preview.unmatched])
  useEffect(() => {
    setSelected(new Set(unmatchedIds))
  }, [unmatchedIds])

  const isLoading = gbLoading || recordsLoading || personsLoading
  const alreadyMerged = Boolean(guestbook?.person_merged_at)

  function handleMerge() {
    mergeMutation.mutate(guestbookId, {
      onSuccess: (data) => {
        setResult(data)
        showToast('合并完成')
      },
      onError: (e) => showToast('合并失败：' + e.message),
    })
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCreatePersons() {
    const ids = unmatchedIds.filter((id) => selected.has(id))
    if (ids.length === 0) {
      showToast('请先勾选要新建人员的记录')
      return
    }
    createPersonsMutation.mutate(
      { id: guestbookId, recordIds: ids },
      {
        onSuccess: (data) => {
          setCreateResult(data)
          showToast(`已新建 ${data.created} 位人员并关联`)
        },
        onError: (e) => showToast('新建人员失败：' + e.message),
      },
    )
  }

  return (
    <PageScaffold
      title="礼簿合并向导"
      description="将礼簿内的收礼记录按宾客姓名/电话与人员库建立关联，不搬迁数据"
      actions={
        <Link
          to="/guestbooks/$id"
          params={{ id: String(guestbookId) }}
          className="rounded-btn border border-line px-4 py-2 text-sm text-ink-secondary hover:border-primary"
        >
          返回礼簿
        </Link>
      }
    >
      {isLoading ? (
        <p className="py-10 text-center text-ink-secondary">加载中…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* 礼簿信息与合并状态 */}
          <div className="rounded-card bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-ink">{guestbook?.name}</h2>
                <p className="mt-1 text-sm text-ink-secondary">
                  {guestbook?.event_type} · {guestbook?.event_date}
                  {alreadyMerged && (
                    <span className="ml-2 rounded bg-success/10 px-1.5 py-0.5 text-xs text-success">
                      已合并 · {dayjs(guestbook?.person_merged_at).format('YYYY-MM-DD HH:mm')}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={handleMerge}
                disabled={mergeMutation.isPending || preview.matched.length === 0}
                className="rounded-btn bg-primary px-6 py-2.5 text-sm font-semibold text-white disabled:bg-disabled"
              >
                {mergeMutation.isPending ? '合并中…' : alreadyMerged ? '再次合并新记录' : '执行合并'}
              </button>
            </div>
            {/* 统计 */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-bg p-3 text-center">
                <p className="text-xl font-bold text-ink">{records.filter((r) => !r.is_deleted).length}</p>
                <p className="text-xs text-ink-secondary">总记录</p>
              </div>
              <div className="rounded-lg bg-bg p-3 text-center">
                <p className="text-xl font-bold text-success">{preview.already.length}</p>
                <p className="text-xs text-ink-secondary">已关联</p>
              </div>
              <div className="rounded-lg bg-bg p-3 text-center">
                <p className="text-xl font-bold text-primary">{preview.matched.length}</p>
                <p className="text-xs text-ink-secondary">可匹配</p>
              </div>
              <div className="rounded-lg bg-bg p-3 text-center">
                <p className="text-xl font-bold text-warning">{preview.unmatched.length}</p>
                <p className="text-xs text-ink-secondary">无法匹配</p>
              </div>
            </div>
          </div>

          {/* 合并结果 */}
          {result && (
            <div className="rounded-card border border-success/30 bg-success/5 p-4 text-sm text-ink">
              本次新关联 <b>{result.linked}</b> 条记录，未匹配 <b>{result.unmatched}</b> 条，
              此前已关联 <b>{result.already_linked}</b> 条。
              该礼簿已标记为「已合并」，后续的修改与补录将自动解析人员关联。
            </div>
          )}

          {/* 无法匹配的记录列表：勾选确认后按礼簿数据新建人员 */}
          {preview.unmatched.length > 0 && (
            <div className="rounded-card bg-card p-5 shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-ink">
                  无法自动匹配的记录（{preview.unmatched.length}）
                </h3>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-secondary">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={unmatchedIds.length > 0 && selected.size === unmatchedIds.length}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(unmatchedIds) : new Set())
                    }
                  />
                  全选
                </label>
              </div>
              <p className="mb-3 text-xs text-ink-secondary">
                这些宾客在人员库中不存在或存在同名多人。勾选后可按礼簿数据（姓名、电话）直接新建人员并自动关联；已有同名同电话人员时会自动关联而不会重复建人。
              </p>
              <ul className="flex flex-col divide-y divide-line text-sm">
                {preview.unmatched.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={r.id != null && selected.has(r.id)}
                      onChange={() => r.id != null && toggleSelect(r.id)}
                    />
                    <span className="font-medium text-ink">{r.guest_name}</span>
                    <span className="text-xs text-ink-secondary">
                      {formatFen(r.amount)}
                      {r.phone ? ` · ${r.phone}` : ' · 无电话'}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={handleCreatePersons}
                disabled={createPersonsMutation.isPending || selected.size === 0}
                className="mt-4 rounded-btn bg-primary px-5 py-2 text-sm font-semibold text-white disabled:bg-disabled"
              >
                {createPersonsMutation.isPending
                  ? '新建中…'
                  : `按礼簿数据新建人员并关联（已选 ${selected.size}）`}
              </button>
            </div>
          )}

          {/* 新建人员结果 */}
          {createResult && (
            <div className="rounded-card border border-primary/30 bg-primary/5 p-4 text-sm text-ink">
              本次新建 <b>{createResult.created}</b> 位人员，
              关联已存在人员 <b>{createResult.linked_existing}</b> 条，跳过 <b>{createResult.skipped}</b> 条。
              新建的人员已可在「人员管理」中查看和补充关系等信息。
            </div>
          )}
        </div>
      )}

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
