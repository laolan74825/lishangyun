import { useState, useEffect, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import type { Person } from '../types'
import { DEFAULT_RELATION_TAGS } from '../types'
import { getPersonsPaginated, updatePerson } from '../lib/api-client'
import { queryKeys } from '../hooks/queryKeys'

/** 存量英文编码 → 中文显示值；自定义类别原样显示 */
const RELATION_EN_TO_ZH: Record<string, string> = {
  relative: '亲戚',
  friend: '朋友',
  colleague: '同事',
  classmate: '同学',
  neighbor: '邻居',
  other: '其他',
}

const toDisplayTag = (raw?: string | null): string => {
  if (!raw) return '其他'
  return RELATION_EN_TO_ZH[raw] ?? raw
}

type RelationValue = string

interface RowState {
  nickname: string
  relation: RelationValue
  aliasesText: string
  phone: string
  note: string
}

const toRow = (p: Person): RowState => ({
  nickname: p.nickname ?? '',
  relation: toDisplayTag(p.relationship_tag ?? p.relation_tag),
  aliasesText: (p.aliases ?? []).join('，'),
  phone: p.phone ?? '',
  note: p.note ?? '',
})

const parseAliases = (text: string): string[] =>
  text.split(/[，,、;；]/).map((s) => s.trim()).filter(Boolean)

/** 拉取全部人员（分页循环） */
async function fetchAllPersons(): Promise<Person[]> {
  const pageSize = 100
  const first = await getPersonsPaginated(1, pageSize)
  const all = [...first.items]
  for (let page = 2; page <= first.pagination.total_pages; page++) {
    const res = await getPersonsPaginated(page, pageSize)
    all.push(...res.items)
  }
  return all
}

/**
 * 人员批量编辑页：表格行内编辑称谓/关系/别名/电话/备注，
 * 仅保存修改过的行。
 */
export default function PersonBatchEditPage() {
  const queryClient = useQueryClient()
  const { toast, showToast } = useToast()
  const [persons, setPersons] = useState<Person[]>([])
  const [rows, setRows] = useState<Record<number, RowState>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    fetchAllPersons()
      .then((list) => {
        setPersons(list)
        const init: Record<number, RowState> = {}
        for (const p of list) {
          if (p.id != null) init[p.id] = toRow(p)
        }
        setRows(init)
      })
      .catch(() => showToast('人员数据加载失败'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateRow = (id: number, changes: Partial<RowState>) => {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...changes } }))
  }

  /** 已修改的行 */
  const dirtyIds = useMemo(
    () =>
      persons
        .filter((p) => p.id != null && JSON.stringify(rows[p.id]) !== JSON.stringify(toRow(p)))
        .map((p) => p.id!),
    [persons, rows],
  )

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase()
    if (!k) return persons
    return persons.filter((p) =>
      [p.name, p.nickname, p.phone, ...(p.aliases ?? [])].some((v) => v?.toLowerCase().includes(k)),
    )
  }, [persons, keyword])

  const handleSave = async () => {
    if (saving || dirtyIds.length === 0) return
    setSaving(true)
    let ok = 0
    const failed: string[] = []
    for (const id of dirtyIds) {
      const r = rows[id]
      try {
        await updatePerson(id, {
          nickname: r.nickname.trim() || null,
          phone: r.phone.trim() || null,
          aliases: parseAliases(r.aliasesText),
          relationship_tag: r.relation,
          note: r.note.trim() || null,
        })
        ok++
      } catch {
        failed.push(persons.find((p) => p.id === id)?.name ?? `#${id}`)
      }
    }
    // 同步本地基准，保存过的行不再是"已修改"状态
    setPersons((prev) =>
      prev.map((p) => {
        if (p.id == null || failed.includes(p.name)) return p
        const r = rows[p.id]
        return { ...p, nickname: r.nickname.trim() || undefined, phone: r.phone.trim() || undefined, aliases: parseAliases(r.aliasesText), relationship_tag: r.relation, note: r.note.trim() || undefined }
      }),
    )
    queryClient.invalidateQueries({ queryKey: queryKeys.persons.all })
    setSaving(false)
    if (failed.length === 0) {
      showToast(`已保存 ${ok} 位人员的修改`)
    } else {
      showToast(`保存完成：成功 ${ok} 条，失败 ${failed.length} 条（${failed.slice(0, 3).join('、')}${failed.length > 3 ? ' 等' : ''}）`)
    }
  }

  const inputCls =
    'h-9 w-full rounded border border-line bg-white px-2 text-base outline-none focus:border-primary md:text-sm'
  const dirtyCls = 'border-warning/70 bg-warning/5'

  /* 关系类别候选：默认类别 + 现有人员已用的自定义类别 */
  const relationOptions = useMemo(() => {
    const seen = new Set<string>(DEFAULT_RELATION_TAGS)
    const extras: string[] = []
    for (const p of persons) {
      const t = toDisplayTag(p.relationship_tag ?? p.relation_tag)
      if (!seen.has(t)) {
        seen.add(t)
        extras.push(t)
      }
    }
    return [...DEFAULT_RELATION_TAGS, ...extras]
  }, [persons])

  return (
    <PageScaffold
      title="人员批量编辑"
      description="表格中直接修改称谓、关系、别名、电话、备注，保存时仅提交修改过的行"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/people"
            className="rounded-btn border border-line px-4 py-2 text-sm font-medium text-ink-secondary hover:border-primary"
          >
            返回人员管理
          </Link>
          <button
            onClick={handleSave}
            disabled={saving || dirtyIds.length === 0}
            className="rounded-btn bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-deep disabled:bg-disabled"
          >
            {saving ? '保存中…' : dirtyIds.length > 0 ? `保存修改（${dirtyIds.length} 人）` : '保存修改'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card">
        <p className="text-xs leading-relaxed text-ink-secondary">
          💡 表格较宽，手机上可左右滑动编辑；如需批量修改多人，建议在平板或电脑浏览器中操作，体验更佳。
        </p>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="筛选：姓名、称谓、电话、别名…"
          className="h-11 rounded-btn border border-line px-4 text-sm outline-none focus:border-primary"
        />
        {loading ? (
          <p className="py-10 text-center text-ink-secondary">加载中…</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-ink-secondary">{persons.length === 0 ? '暂无人员档案' : '无匹配人员'}</p>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <datalist id="batch-relation-options">
              {relationOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-secondary">
                  <th className="py-2 pr-3 font-medium">姓名</th>
                  <th className="py-2 pr-3 font-medium">称谓</th>
                  <th className="py-2 pr-3 font-medium">关系</th>
                  <th className="py-2 pr-3 font-medium">别名（多个用逗号分隔）</th>
                  <th className="py-2 pr-3 font-medium">电话</th>
                  <th className="py-2 pr-3 font-medium">备注</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  if (p.id == null) return null
                  const r = rows[p.id] ?? toRow(p)
                  const dirty = dirtyIds.includes(p.id)
                  return (
                    <tr key={p.id} className={`border-b border-line/60 ${dirty ? 'bg-warning/5' : ''}`}>
                      <td className="py-1.5 pr-3 font-medium text-ink">
                        {p.name}
                        {dirty && <span className="ml-1.5 text-xs text-warning">●</span>}
                      </td>
                      <td className="py-1.5 pr-3">
                        <input
                          value={r.nickname}
                          onChange={(e) => updateRow(p.id!, { nickname: e.target.value })}
                          placeholder="表哥、同事等"
                          className={`${inputCls} ${dirty && r.nickname !== (p.nickname ?? '') ? dirtyCls : ''}`}
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input
                          list="batch-relation-options"
                          value={r.relation}
                          onChange={(e) => updateRow(p.id!, { relation: e.target.value })}
                          placeholder="选择或输入"
                          maxLength={20}
                          className={`${inputCls} ${dirty && r.relation !== toDisplayTag(p.relationship_tag ?? p.relation_tag) ? dirtyCls : ''}`}
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input
                          value={r.aliasesText}
                          onChange={(e) => updateRow(p.id!, { aliasesText: e.target.value })}
                          placeholder="多个别名用逗号分隔"
                          className={`${inputCls} ${dirty && r.aliasesText !== (p.aliases ?? []).join('，') ? dirtyCls : ''}`}
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input
                          value={r.phone}
                          onChange={(e) => updateRow(p.id!, { phone: e.target.value })}
                          inputMode="tel"
                          placeholder="电话"
                          className={`${inputCls} ${dirty && r.phone !== (p.phone ?? '') ? dirtyCls : ''}`}
                        />
                      </td>
                      <td className="py-1.5 pr-3">
                        <input
                          value={r.note}
                          onChange={(e) => updateRow(p.id!, { note: e.target.value })}
                          placeholder="备注"
                          className={`${inputCls} ${dirty && r.note !== (p.note ?? '') ? dirtyCls : ''}`}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && persons.length > 0 && (
          <p className="text-xs text-ink-secondary">
            共 {persons.length} 人{keyword.trim() ? `，筛选后 ${filtered.length} 人` : ''}；已修改 {dirtyIds.length} 人，黄色边框为已修改字段
          </p>
        )}
      </div>
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
