import { useState, useEffect, useCallback } from 'react'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import type { Person, RelationTag, DailyRecord, GbRecord } from '../types'
import {
  getAllPersons,
  createPerson,
  updatePerson,
  deletePerson,
  searchPersons,
  getDailyRecordsByName,
  getGbRecordsByName,
  getTransactionSummaryByName
} from '../lib/api-client'

const relationOptions: RelationTag[] = ['亲戚', '朋友', '同事', '同学', '邻居', '其他']

/** 人员管理页（含往来明细 F-9.4、差额计算 F-9.5） */
export default function PeoplePage() {
  const [persons, setPersons] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [filterTag, setFilterTag] = useState<RelationTag | 'all'>('all')

  /* 弹窗状态 */
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formName, setFormName] = useState('')
  const [formNickname, setFormNickname] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formTag, setFormTag] = useState<RelationTag>('朋友')
  const [formAliases, setFormAliases] = useState('')
  const [formNote, setFormNote] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)

  /* 往来明细展开状态 */
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null)
  const [txRecords, setTxRecords] = useState<{ daily: DailyRecord[]; gb: GbRecord[] }>({ daily: [], gb: [] })
  const [txSummary, setTxSummary] = useState<{ total_out: number; total_in: number; net: number; daily_count: number; gb_count: number } | null>(null)
  const [txLoading, setTxLoading] = useState(false)

  const { toast, showToast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    let list: Person[]
    if (keyword.trim()) {
      list = await searchPersons(keyword.trim())
    } else {
      list = await getAllPersons()
    }
    if (filterTag !== 'all') {
      list = list.filter((p) => p.relation_tag === filterTag)
    }
    setPersons(list)
    setLoading(false)
  }, [keyword, filterTag])

  useEffect(() => {
    load()
  }, [load])

  /* 展开/收起往来明细 */
  const toggleExpand = useCallback(async (personName: string) => {
    if (expandedPerson === personName) {
      setExpandedPerson(null)
      return
    }
    setExpandedPerson(personName)
    setTxLoading(true)
    try {
      const [daily, gb, summary] = await Promise.all([
        getDailyRecordsByName(personName),
        getGbRecordsByName(personName),
        getTransactionSummaryByName(personName)
      ])
      // 按时间倒序
      daily.sort((a, b) => b.event_date.localeCompare(a.event_date))
      gb.sort((a, b) => b.record_time.localeCompare(a.record_time))
      setTxRecords({ daily, gb })
      setTxSummary(summary)
    } catch (e) {
      showToast('加载往来明细失败：' + (e as Error).message)
    } finally {
      setTxLoading(false)
    }
  }, [expandedPerson, showToast])

  const openNew = () => {
    setEditingId(null)
    setFormName('')
    setFormNickname('')
    setFormPhone('')
    setFormTag('朋友')
    setFormAliases('')
    setFormNote('')
    setShowForm(true)
  }

  const openEdit = (p: Person) => {
    setEditingId(p.id ?? null)
    setFormName(p.name)
    setFormNickname(p.nickname ?? '')
    setFormPhone(p.phone ?? '')
    setFormTag(p.relation_tag)
    setFormAliases(p.aliases.join('、'))
    setFormNote(p.note ?? '')
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!formName.trim()) {
      showToast('请填写姓名')
      return
    }
    setFormSubmitting(true)
    try {
      const aliases = formAliases
        .split(/[、,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (editingId != null) {
        await updatePerson(editingId, {
          name: formName.trim(),
          nickname: formNickname.trim() || undefined,
          phone: formPhone.trim() || undefined,
          relation_tag: formTag,
          aliases,
          note: formNote.trim() || undefined
        })
        showToast('人员已更新')
      } else {
        await createPerson({
          name: formName.trim(),
          nickname: formNickname.trim() || undefined,
          phone: formPhone.trim() || undefined,
          relation_tag: formTag,
          aliases,
          note: formNote.trim() || undefined
        })
        showToast('人员已创建')
      }
      setShowForm(false)
      await load()
    } catch (e) {
      showToast('操作失败：' + (e as Error).message)
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该人员吗？')) return
    try {
      await deletePerson(id)
      showToast('人员已删除')
      await load()
    } catch (e) {
      showToast('删除失败：' + (e as Error).message)
    }
  }

  const tagColors: Record<RelationTag, string> = {
    亲戚: 'bg-danger-bg text-danger',
    朋友: 'bg-success-bg text-success-deep',
    同事: 'bg-warning-bg text-warning',
    同学: 'bg-info/10 text-info',
    邻居: 'bg-gray-100 text-ink-secondary',
    其他: 'bg-gray-100 text-ink-secondary'
  }

  const fmt = (fen: number) => `¥${(fen / 100).toFixed(2)}`

  return (
    <PageScaffold
      title="人员管理"
      description="管理人员档案，关联日常礼金往来"
      actions={
        <button
          onClick={openNew}
          className="rounded-btn bg-primary px-5 py-2.5 text-sm font-semibold text-white"
        >
          ＋ 新增人员
        </button>
      }
    >
      {/* 筛选栏 */}
      <div className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-card sm:flex-row">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索姓名、昵称、电话、别名…"
          className="h-11 flex-1 rounded-btn border border-line px-4 text-sm outline-none focus:border-primary"
        />
        <select
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value as RelationTag | 'all')}
          className="h-11 rounded-btn border border-line bg-white px-4 text-sm outline-none focus:border-primary"
        >
          <option value="all">全部关系</option>
          {relationOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* 人员列表 */}
      {loading ? (
        <p className="py-10 text-center text-ink-secondary">加载中…</p>
      ) : persons.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <span className="text-4xl">👥</span>
          <p className="text-ink-secondary">
            {keyword.trim() ? '未找到匹配的人员' : '暂无人员档案'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {persons.map((p) => (
            <div key={p.id} className="flex flex-col rounded-card bg-card shadow-card">
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-ink">{p.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${tagColors[p.relation_tag]}`}>
                        {p.relation_tag}
                      </span>
                    </div>
                    {p.nickname && (
                      <p className="text-sm text-ink-secondary">昵称：{p.nickname}</p>
                    )}
                    {p.phone && (
                      <p className="text-sm text-ink-secondary">电话：{p.phone}</p>
                    )}
                    {p.aliases.length > 0 && (
                      <p className="text-xs text-ink-secondary">别名：{p.aliases.join('、')}</p>
                    )}
                    {p.note && (
                      <p className="mt-1 text-xs text-ink-secondary">{p.note}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(p)}
                      className="rounded-btn px-2 py-1 text-xs text-info hover:bg-info/10"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(p.id!)}
                      className="rounded-btn px-2 py-1 text-xs text-danger hover:bg-danger-bg"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>

              {/* 往来明细展开按钮 */}
              <button
                onClick={() => toggleExpand(p.name)}
                className="border-t border-line px-5 py-2.5 text-left text-sm font-medium text-info hover:bg-bg"
              >
                {expandedPerson === p.name ? '收起明细 ▲' : '查看往来明细 ▼'}
              </button>

              {/* 展开的往来明细 */}
              {expandedPerson === p.name && (
                <div className="border-t border-line bg-bg p-4">
                  {txLoading ? (
                    <p className="py-4 text-center text-sm text-ink-secondary">加载中…</p>
                  ) : (
                    <>
                      {/* 汇总（F-9.5） */}
                      {txSummary && (
                        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-btn bg-white p-2">
                            <div className="text-xs text-ink-secondary">总送出</div>
                            <div className="text-sm font-bold text-danger">{fmt(txSummary.total_out)}</div>
                          </div>
                          <div className="rounded-btn bg-white p-2">
                            <div className="text-xs text-ink-secondary">总收到</div>
                            <div className="text-sm font-bold text-success">{fmt(txSummary.total_in)}</div>
                          </div>
                          <div className="rounded-btn bg-white p-2">
                            <div className="text-xs text-ink-secondary">净差额</div>
                            <div className={`text-sm font-bold ${txSummary.net >= 0 ? 'text-success' : 'text-danger'}`}>
                              {fmt(txSummary.net)}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 记录列表（F-9.4） */}
                      {txRecords.daily.length === 0 && txRecords.gb.length === 0 ? (
                        <p className="py-3 text-center text-sm text-ink-secondary">暂无往来记录</p>
                      ) : (
                        <ul className="flex flex-col gap-1.5">
                          {txRecords.daily.map((r) => (
                            <li
                              key={r.id}
                              className="flex items-center justify-between rounded-btn bg-white px-3 py-2 text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                                    r.type === 'out'
                                      ? 'bg-danger-bg text-danger'
                                      : 'bg-success-bg text-success-deep'
                                  }`}
                                >
                                  {r.type === 'out' ? '送出' : '收到'}
                                </span>
                                <span className="text-ink-secondary">{r.event_type}</span>
                                <span className="text-xs text-ink-secondary">{r.event_date}</span>
                              </div>
                              <span className={`font-bold ${r.type === 'out' ? 'text-danger' : 'text-success'}`}>
                                {r.type === 'out' ? '-' : '+'}{fmt(r.amount)}
                              </span>
                            </li>
                          ))}
                          {txRecords.gb.map((r) => (
                            <li
                              key={r.id}
                              className="flex items-center justify-between rounded-btn bg-white px-3 py-2 text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-warning-bg px-1.5 py-0.5 text-xs font-medium text-warning">
                                  礼簿收入
                                </span>
                                <span className="text-xs text-ink-secondary">
                                  {r.payment_method === 'cash' ? '现金' : r.payment_method === 'wechat' ? '微信' : '其他'}
                                </span>
                                <span className="text-xs text-ink-secondary">
                                  {dayjs(r.record_time).format('YYYY-MM-DD')}
                                </span>
                              </div>
                              <span className="font-bold text-success">+{fmt(r.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* 统计 */}
                      {txSummary && (txSummary.daily_count > 0 || txSummary.gb_count > 0) && (
                        <p className="mt-2 text-xs text-ink-secondary">
                          共 {txSummary.daily_count} 笔日常 + {txSummary.gb_count} 笔礼簿
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 表单弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[28rem] rounded-card bg-card p-6 shadow-xl">
            <h3 className="text-lg font-bold text-ink">
              {editingId != null ? '编辑人员' : '新增人员'}
            </h3>

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">姓名 <span className="text-danger">*</span></span>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
              />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">昵称</span>
                <input
                  value={formNickname}
                  onChange={(e) => setFormNickname(e.target.value)}
                  className="h-11 rounded-btn border border-line px-4 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">关系标签</span>
                <select
                  value={formTag}
                  onChange={(e) => setFormTag(e.target.value as RelationTag)}
                  className="h-11 rounded-btn border border-line bg-white px-3 text-sm outline-none focus:border-primary"
                >
                  {relationOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">电话号码</span>
              <input
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                inputMode="tel"
                className="h-11 rounded-btn border border-line px-4 text-sm outline-none focus:border-primary"
              />
            </label>

            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">别名（用「、」分隔）</span>
              <input
                value={formAliases}
                onChange={(e) => setFormAliases(e.target.value)}
                placeholder="如：小明、阿明"
                className="h-11 rounded-btn border border-line px-4 text-sm outline-none focus:border-primary"
              />
            </label>

            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">备注</span>
              <input
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="h-11 rounded-btn border border-line px-4 text-sm outline-none focus:border-primary"
              />
            </label>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-btn border border-line py-2.5 font-medium text-ink-secondary"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={formSubmitting || !formName.trim()}
                className="flex-1 rounded-btn bg-primary py-2.5 font-medium text-white disabled:bg-disabled"
              >
                {formSubmitting ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
