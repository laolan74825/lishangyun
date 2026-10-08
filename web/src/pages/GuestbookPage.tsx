import { useState, useMemo, useEffect, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import GuestbookStatusBadge from '../components/guestbook/GuestbookStatusBadge'
import PrintGuestbookButton from '../components/PrintGuestbookButton'
import { cacheGuestbooks } from '../lib/dexie'
import type { PaymentAccount } from '../types'
import {
  useAllGuestbookSummaries,
  useCreateGuestbook,
  useDeleteGuestbook,
  useUnarchiveGuestbook,
  usePaymentAccounts,
  useCollaborationInvites,
  useCreateCollaborationInvite,
  useRevokeCollaborationInvite,
  useCollaborationInviteLogs,
} from '../hooks/useQueries'
import { searchUser } from '../lib/api-client'
import type { CreateCollaborationInviteResult, GuestbookSummaryItem, UserSearchResult } from '../lib/api-client'
import { formatFen } from '../lib/format'
import type { CollaborationInvite } from '../types'

/* ========================= 协助邀请弹窗 ========================= */

const permissionLabels: Record<string, string> = {
  record: '仅记账',
  reconcile: '仅对账',
  both: '记账 + 对账',
}

function localInputValue(d: dayjs.Dayjs) {
  return d.format('YYYY-MM-DDTHH:mm')
}

interface InviteModalProps {
  guestbookId: number
  onClose: () => void
}

function InviteModal({ guestbookId, onClose }: InviteModalProps) {
  const { toast, showToast } = useToast()
  const { data: invites = [], refetch } = useCollaborationInvites(guestbookId)
  const createMutation = useCreateCollaborationInvite()
  const revokeMutation = useRevokeCollaborationInvite()

  const [keywordInput, setKeywordInput] = useState('')
  const [foundUser, setFoundUser] = useState<UserSearchResult | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [permissions, setPermissions] = useState<'record' | 'reconcile' | 'both'>('record')
  const [startInput, setStartInput] = useState(() => localInputValue(dayjs()))
  const [endInput, setEndInput] = useState(() => localInputValue(dayjs().add(7, 'day')))
  const [generated, setGenerated] = useState<CreateCollaborationInviteResult | null>(null)
  const [now, setNow] = useState(() => dayjs())
  const [revokeTarget, setRevokeTarget] = useState<CollaborationInvite | null>(null)
  const [logsTarget, setLogsTarget] = useState<number | null>(null)

  const { data: logs = [] } = useCollaborationInviteLogs(logsTarget)

  const activeInvites = invites.filter((i) => i.status === 'pending' || i.status === 'accepted')

  // 只有需要显示倒计时（有待接受邀请或刚生成邀请码）时才每秒刷新
  const hasCountdown = generated !== null || invites.some((i) => i.status === 'pending')
  useEffect(() => {
    if (!hasCountdown) return
    const timer = setInterval(() => setNow(dayjs()), 1000)
    return () => clearInterval(timer)
  }, [hasCountdown])

  async function handleSearch() {
    const keyword = keywordInput.trim()
    if (keyword.length < 3) {
      showToast('请输入注册邮箱或用户名（至少 3 个字符）')
      return
    }
    setSearching(true)
    setSearchError(null)
    try {
      const user = await searchUser(keyword)
      setFoundUser(user)
    } catch {
      setFoundUser(null)
      setSearchError('未找到该邮箱或用户名对应的用户')
    } finally {
      setSearching(false)
    }
  }

  async function handleCreate() {
    if (!foundUser) {
      showToast('请先查找并确认被邀请人')
      return
    }
    const start = dayjs(startInput)
    const end = dayjs(endInput)
    if (!start.isValid() || !end.isValid()) {
      showToast('请完整设置协作起止时间')
      return
    }
    if (!end.isAfter(start)) {
      showToast('结束时间必须晚于开始时间')
      return
    }
    if (start.isBefore(dayjs())) {
      showToast('开始时间不能早于当前时间')
      return
    }
    try {
      const res = await createMutation.mutateAsync({
        invitee_keyword: keywordInput.trim(),
        guestbook_id: guestbookId,
        permissions,
        collaboration_start_at: new Date(startInput).toISOString(),
        collaboration_end_at: new Date(endInput).toISOString(),
      })
      setGenerated(res)
      refetch()
      showToast('邀请已发送')
    } catch (e) {
      showToast('发送失败：' + (e instanceof Error ? e.message : '未知错误'))
    }
  }

  function handleCopyCode() {
    if (!generated) return
    navigator.clipboard.writeText(generated.invite_code).then(() => {
      showToast('邀请码已复制')
    }).catch(() => {
      showToast('复制失败，请手动复制')
    })
  }

  function handleRevoke() {
    if (!revokeTarget?.id) return
    revokeMutation.mutate(revokeTarget.id, {
      onSuccess: () => {
        showToast(revokeTarget.status === 'pending' ? '邀请已取消' : '授权已撤销')
        setRevokeTarget(null)
        refetch()
      },
      onError: (e) => showToast('操作失败：' + e.message),
    })
  }

  return (
    <Modal open={true} onClose={onClose} title="协助邀请" maxWidth="md">
      {generated ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <p className="text-sm text-ink-secondary">邀请已发送，请将 6 位邀请码告知对方</p>
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-6 py-4">
            <span className="font-mono text-2xl font-bold tracking-wider text-primary">{generated.invite_code}</span>
            <button onClick={handleCopyCode} className="rounded-btn border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10">
              复制
            </button>
          </div>
          <p className="text-xs text-ink-secondary">
            对方在首页接受邀请时需输入此码；邀请信号剩余 {Math.max(0, dayjs(generated.signal_expires_at).diff(now, 'minute'))} 分钟
          </p>
          <p className="text-xs text-ink-secondary">
            协作时段：{dayjs(generated.collaboration_start_at).format('MM-DD HH:mm')} ～ {dayjs(generated.collaboration_end_at).format('MM-DD HH:mm')}，对方仅在该时段内可协助管理（接受不改变时段）
          </p>
          <p className="text-xs text-ink-secondary">请确认对方知晓注册邮箱或用户名，对方可在「设置 → 安全邮箱」中核对注册邮箱</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => { setGenerated(null); setFoundUser(null); setKeywordInput(''); setSearchError(null) }} className="rounded-btn border border-line px-6 py-2.5 text-sm font-medium text-ink-secondary">
              继续邀请
            </button>
            <button onClick={onClose} className="rounded-btn bg-primary px-6 py-2.5 text-sm font-semibold text-white">
              完成
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* 当前邀请列表 */}
          {activeInvites.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-ink">当前邀请</p>
              {activeInvites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-sm">
                    <span className="font-medium text-ink">{inv.invitee_username}</span>
                    <span className="ml-2 text-xs text-ink-secondary">{permissionLabels[inv.permissions] || inv.permissions}</span>
                    <span className="ml-2 text-xs text-ink-secondary">
                      {inv.status === 'pending'
                        ? `待接受 · 信号剩余 ${Math.max(0, dayjs(inv.signal_expires_at).diff(now, 'minute'))} 分钟`
                        : `协作中 · 至 ${dayjs(inv.collaboration_end_at).format('MM-DD HH:mm')}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setLogsTarget(inv.id ?? null)} className="text-xs text-ink-secondary hover:underline">
                      日志
                    </button>
                    <button
                      onClick={() => setRevokeTarget(inv)}
                      disabled={revokeMutation.isPending}
                      className="text-xs text-danger hover:underline disabled:opacity-50"
                    >
                      {inv.status === 'pending' ? '取消邀请' : '撤销授权'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 新建邀请表单 */}
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-ink">新建邀请</p>

            {/* 账户精确查找 */}
            <div>
              <div className="flex gap-2">
                <input
                  value={keywordInput}
                  onChange={(e) => {
                    setKeywordInput(e.target.value)
                    setFoundUser(null)
                    setSearchError(null)
                  }}
                  placeholder="输入对方注册邮箱或用户名…"
                  aria-label="对方注册邮箱或用户名"
                  className="h-11 flex-1 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
                />
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className="rounded-btn border border-primary px-4 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  {searching ? '查找中…' : '查找'}
                </button>
              </div>
              {searchError && <p className="mt-1 text-xs text-danger">{searchError}</p>}
              {foundUser && (
                <p className="mt-1 text-xs text-ink-secondary">
                  已找到：<span className="font-medium text-ink">{foundUser.username}</span>
                  {foundUser.email && <span>（{foundUser.email}）</span>}，确认无误后发送邀请
                </p>
              )}
            </div>

            {/* 权限选择 */}
            <div className="flex gap-2">
              {(['record', 'reconcile', 'both'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPermissions(p)}
                  className={`flex-1 rounded-btn border py-2 text-sm font-medium transition-colors ${
                    permissions === p
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-line text-ink-secondary hover:border-primary'
                  }`}
                >
                  {permissionLabels[p]}
                </button>
              ))}
            </div>

            {/* 协作起止时间（精确到分钟） */}
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-sm text-ink-secondary">协作时段</span>
              <input
                type="datetime-local"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                aria-label="协作开始时间"
                className="h-10 flex-1 rounded-btn border border-line px-3 text-sm outline-none focus:border-2 focus:border-primary"
              />
              <span className="text-sm text-ink-secondary">至</span>
              <input
                type="datetime-local"
                value={endInput}
                onChange={(e) => setEndInput(e.target.value)}
                aria-label="协作结束时间"
                className="h-10 flex-1 rounded-btn border border-line px-3 text-sm outline-none focus:border-2 focus:border-primary"
              />
            </div>

            {/* 提交按钮 */}
            <button
              onClick={handleCreate}
              disabled={!foundUser || createMutation.isPending}
              className="mt-2 rounded-btn bg-primary py-3 text-sm font-bold text-white disabled:bg-disabled"
            >
              {createMutation.isPending ? '发送中…' : '发送邀请'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        title={revokeTarget?.status === 'pending' ? '取消邀请' : '撤销授权'}
        message={
          revokeTarget?.status === 'pending'
            ? '确定取消此协作邀请？取消后对方首页的邀请信号将消失。'
            : '确定撤销此协作授权？撤销后对方将无法继续协助管理该礼簿。'
        }
        variant="warning"
        confirmLabel={revokeTarget?.status === 'pending' ? '取消邀请' : '撤销授权'}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
        loading={revokeMutation.isPending}
      />

      {logsTarget !== null && (
        <Modal open={true} onClose={() => setLogsTarget(null)} title="操作日志" maxWidth="md">
          <div className="flex flex-col gap-2">
            {logs.length === 0 && <p className="text-sm text-ink-secondary">暂无日志</p>}
            {logs.map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium text-ink">{log.action_type}</span>
                  {log.operator_name && <span className="ml-2 text-xs text-ink-secondary">{log.operator_name}</span>}
                  {log.detail && <p className="text-xs text-ink-secondary">{log.detail}</p>}
                </div>
                <span className="whitespace-nowrap text-xs text-ink-secondary">
                  {dayjs(log.created_at).format('MM-DD HH:mm')}
                </span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      <Toast message={toast} onClose={() => showToast(null)} />
    </Modal>
  )
}

/* ========================= 礼簿列表页 ========================= */

interface GuestbookCardProps {
  gb: GuestbookSummaryItem
  onDelete: (id: number) => void
  onInvite: (id: number) => void
  onUnarchive: (id: number) => void
}

/**
 * 单个礼簿卡片。
 * 注意：必须是组件外的稳定组件类型——定义在列表组件内部会导致
 * 每次渲染重建所有卡片的 DOM 子树（动画重置、状态丢失）。
 */
function GuestbookCard({ gb, onDelete, onInvite, onUnarchive }: GuestbookCardProps) {
  const navigate = useNavigate()
  const pct = gb.total_records > 0
    ? Math.round((gb.checked_count / gb.total_records) * 100)
    : 0
  return (
    <div className="mx-auto flex h-full w-full max-w-[350px] flex-col gap-3 rounded-card bg-card p-5 shadow-card transition-shadow hover:shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-ink">{gb.name}</h3>
            {gb.person_merged_at && (
              <span className="rounded bg-success/10 px-1.5 py-0.5 text-xs text-success">已合并</span>
            )}
            {gb.total_records === 0 && gb.id && (
              <button
                onClick={() => onDelete(gb.id!)}
                className="rounded px-1.5 py-0.5 text-xs font-medium text-danger transition-colors hover:bg-danger-bg"
                title="删除礼簿"
              >
                删除
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-secondary">
            {gb.event_type} · {gb.event_date}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <GuestbookStatusBadge status={gb.status} />
          <PrintGuestbookButton
            guestbook={gb}
            className="rounded px-1 py-0.5 text-xs text-ink-secondary transition-colors hover:text-primary"
          />
        </div>
      </div>
      {gb.total_records > 0 && (
        <div className="flex items-center gap-4 text-sm">
          <span className="font-bold text-ink">{formatFen(gb.total_amount)}</span>
          <span className="text-ink-secondary">{gb.total_records} 笔</span>
          <span className="text-ink-secondary">对账 {pct}%</span>
        </div>
      )}
      {gb.total_records > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <div className="flex items-center gap-3 text-xs text-ink-secondary">
        <span>创建于 {dayjs(gb.created_at).format('YYYY-MM-DD HH:mm')}</span>
        {gb.operator_note && <span>备注：{gb.operator_note}</span>}
      </div>
      <div className="mt-auto flex gap-2">
        {gb.status === 'active' && (
          <Link
            to="/guestbooks/$id/collect"
            params={{ id: String(gb.id) }}
            className="flex-1 rounded-btn bg-primary py-2.5 text-center text-sm font-semibold text-white"
          >
            进入收礼
          </Link>
        )}
        {/* 收尾中可继续补录宾客记录（F-2.8 收尾期补录） */}
        {gb.status === 'closing' && (
          <Link
            to="/guestbooks/$id/collect"
            params={{ id: String(gb.id) }}
            className="flex-1 rounded-btn bg-primary py-2.5 text-center text-sm font-semibold text-white"
          >
            进入补录
          </Link>
        )}
        {gb.status === 'active' && (
          <button
            onClick={() => gb.id && onInvite(gb.id)}
            className="rounded-btn border border-info px-4 py-2.5 text-sm font-medium text-info hover:bg-info/10"
          >
            协助邀请
          </button>
        )}
        <button
          onClick={() => navigate({ to: '/guestbooks/$id', params: { id: String(gb.id) } })}
          className="rounded-btn border border-line px-4 py-2.5 text-sm font-medium text-ink-secondary hover:border-primary"
        >
          礼簿详情
        </button>
        {(gb.status === 'closing' || gb.status === 'archived') && (
          <button
            className="rounded-btn border border-info px-4 py-2.5 text-sm font-medium text-info hover:bg-info/10"
            aria-label="将礼簿记录合并关联到人员库"
            title="将礼簿记录合并关联到人员库"
            onClick={() => navigate({ to: '/guestbooks/$id/merge', params: { id: String(gb.id) } })}
          >
            合并
          </button>
        )}
        {gb.status === 'archived' && (
          <button
            onClick={() => gb.id && onUnarchive(gb.id)}
            className="rounded-btn border border-warning px-4 py-2.5 text-sm font-medium text-warning hover:bg-warning/10"
            title="恢复为收尾中，可继续补录和修正"
          >
            恢复收尾中
          </button>
        )}
      </div>
    </div>
  )
}

export function GuestbookListPage() {
  const { data: guestbooks = [], isLoading: loading } = useAllGuestbookSummaries()
  const { toast, showToast } = useToast()
  const deleteMutation = useDeleteGuestbook()
  const unarchiveMutation = useUnarchiveGuestbook()
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [unarchiveId, setUnarchiveId] = useState<number | null>(null)
  const [inviteGuestbookId, setInviteGuestbookId] = useState<number | null>(null)

  const active = useMemo(() => guestbooks.filter((g) => g.status === 'active'), [guestbooks])
  const archived = useMemo(
    () => guestbooks.filter((g) => g.status === 'closing' || g.status === 'archived'),
    [guestbooks],
  )

  useEffect(() => {
    if (active.length > 0) {
      cacheGuestbooks(active).catch(() => {})
    }
  }, [active])

  const handleDelete = () => {
    if (!deleteId) return
    const idToDelete = deleteId
    setDeleteId(null)
    deleteMutation.mutate(idToDelete, {
      onSuccess: () => {
        showToast('礼簿已删除')
      },
      onError: (e) => {
        showToast('删除失败：' + e.message)
      },
    })
  }

  // 已归档礼簿恢复为收尾中（需二次确认）
  const handleUnarchive = () => {
    if (!unarchiveId) return
    const idToUnarchive = unarchiveId
    setUnarchiveId(null)
    unarchiveMutation.mutate(idToUnarchive, {
      onSuccess: () => {
        showToast('已恢复为收尾中')
      },
      onError: (e) => {
        showToast('操作失败：' + e.message)
      },
    })
  }

  return (
    <PageScaffold
      title="礼簿管理"
      description="管理您的宴请礼簿，新建或进入收礼现场"
      actions={
        <div className="flex gap-2">
          <Link
            to="/import"
            search={{ type: 'guestbook' }}
            className="rounded-btn border border-primary px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
          >
            📥 导入礼簿
          </Link>
          <Link
            to="/guestbooks/new"
            className="rounded-btn bg-primary px-5 py-2.5 text-sm font-semibold text-white"
          >
            ＋ 新建礼簿
          </Link>
        </div>
      }
    >
      {loading ? (
        <p className="py-10 text-center text-ink-secondary">加载中…</p>
      ) : guestbooks.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <span className="text-4xl">🧧</span>
          <p className="text-ink-secondary">还没有礼簿，新建一个开始收礼吧</p>
          <Link
            to="/guestbooks/new"
            className="rounded-btn bg-primary px-6 py-3 text-sm font-semibold text-white"
          >
            ＋ 新建礼簿
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {active.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-bold text-ink">进行中的礼簿</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 min-[950px]:grid-cols-2 min-[1380px]:grid-cols-3">
                {active.map((gb) => (
                  <GuestbookCard key={gb.id} gb={gb} onDelete={(id) => setDeleteId(id)} onInvite={(id) => setInviteGuestbookId(id)} onUnarchive={(id) => setUnarchiveId(id)} />
                ))}
              </div>
            </section>
          )}
          {archived.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-bold text-ink-secondary">已归档的礼簿</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 min-[950px]:grid-cols-2 min-[1380px]:grid-cols-3">
                {archived.map((gb) => (
                  <GuestbookCard key={gb.id} gb={gb} onDelete={(id) => setDeleteId(id)} onInvite={(id) => setInviteGuestbookId(id)} onUnarchive={(id) => setUnarchiveId(id)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="删除礼簿"
        message="确定删除该礼簿吗？此操作不可恢复。"
        variant="danger"
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        loading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={unarchiveId !== null}
        title="恢复为收尾中"
        message="将该礼簿从已归档恢复为收尾中？恢复后可以补录和修正记录，确认无误后可重新归档。"
        variant="warning"
        confirmLabel="恢复"
        onConfirm={handleUnarchive}
        onCancel={() => setUnarchiveId(null)}
        loading={unarchiveMutation.isPending}
      />

      {inviteGuestbookId !== null && (
        <InviteModal
          guestbookId={inviteGuestbookId}
          onClose={() => setInviteGuestbookId(null)}
        />
      )}

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}

/* ========================= 新建礼簿页 ========================= */

const eventTypes = [
  { value: 'wedding', label: '婚礼' },
  { value: 'engagement', label: '订婚' },
  { value: 'fullmoon', label: '满月酒' },
  { value: 'birthday', label: '周岁宴' },
  { value: 'birthday_banquet', label: '生日/寿宴' },
  { value: 'housewarming', label: '乔迁' },
  { value: 'graduation', label: '升学宴' },
  { value: 'funeral', label: '丧葬' },
  { value: 'holiday', label: '节日红包' },
  { value: 'other', label: '其他' },
]

export function GuestbookNewPage() {
  const navigate = useNavigate()
  const { toast, showToast } = useToast()
  const { data: existingGuestbooks = [] } = useAllGuestbookSummaries()

  const [name, setName] = useState('')
  const [eventType, setEventType] = useState('wedding')
  const [eventDate, setEventDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [note, setNote] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState(false)

  const createMutation = useCreateGuestbook()
  const { data: cashAccounts = [], isPending: isCashLoading } = usePaymentAccounts({ type: 'cash' })
  const { data: wechatAccounts = [], isPending: isWechatLoading } = usePaymentAccounts({ type: 'wechat' })

  // 排除已停用账户：停用账户在所有业务页面不可选择
  const allCash = (cashAccounts as PaymentAccount[]).filter((a) => !a.is_disabled)
  const allWechat = (wechatAccounts as PaymentAccount[]).filter((a) => !a.is_disabled)

  // 账户加载完成后，若系统中既无收银员也无微信账户，提示先去账户管理设置
  const isAccountsLoading = isCashLoading || isWechatLoading
  const noAccounts = !isAccountsLoading && allCash.length === 0 && allWechat.length === 0

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { showToast('请填写礼簿名称'); return }
    if (!eventDate) { showToast('请选择宴席日期'); return }

    const duplicate = existingGuestbooks.find((gb) => gb.name === name.trim())
    if (duplicate) {
      setDuplicateWarning(true)
      return
    }

    try {
      const gbId = await createMutation.mutateAsync({
        name: name.trim(),
        event_type: eventType,
        event_date: eventDate,
        operator_note: note || undefined,
      })
      showToast('礼簿创建成功')
      navigate({ to: '/guestbooks/$id/collect', params: { id: String(gbId) } })
    } catch (err) {
      console.error('创建礼簿失败:', err)
      showToast('创建失败：' + (err instanceof Error ? err.message : '未知错误'))
    }
  }

  const isPending = createMutation.isPending

  // 账户信息加载中：先显示加载态，避免数据未返回时误判为"无账户"而闪现弹窗
  if (isAccountsLoading) {
    return (
      <PageScaffold title="新建礼簿" description="创建新的宴请礼簿，开始现场收礼">
        <div className="mx-auto max-w-[36rem]">
          <div className="rounded-card bg-card p-10 text-center text-sm text-ink-secondary shadow-card">
            正在加载账户信息…
          </div>
        </div>
      </PageScaffold>
    )
  }

  return (
    <PageScaffold title="新建礼簿" description="创建新的宴请礼簿，开始现场收礼">
      <div className="mx-auto max-w-[36rem]">
        <form onSubmit={handleCreate} className="rounded-card bg-card p-6 shadow-card">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">礼簿名称 <span className="text-danger">*</span></span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：张三 & 李四 婚礼"
                className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
                autoFocus
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">宴席类型</span>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="h-12 rounded-btn border border-line bg-white px-4 text-base outline-none focus:border-2 focus:border-primary"
              >
                {eventTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">宴席日期 <span className="text-danger">*</span></span>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">备注</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="选填，如地点、特殊情况说明"
                className="h-12 rounded-btn border border-line px-4 text-base outline-none focus:border-2 focus:border-primary"
              />
            </label>

            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => navigate({ to: '/guestbooks' })}
                disabled={isPending}
                className="flex-1 rounded-btn border border-line py-3 font-medium text-ink-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isPending || !name.trim() || !eventDate}
                className="flex-1 rounded-btn bg-primary py-3 font-bold text-white disabled:bg-disabled"
              >
                {isPending ? '创建中…' : '新建并记账'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={duplicateWarning}
        title="礼簿名称重复"
        message="已存在同名礼簿，请使用其他名称。"
        variant="warning"
        confirmLabel="确定"
        onConfirm={() => setDuplicateWarning(false)}
        onCancel={() => setDuplicateWarning(false)}
        showCancel={false}
      />

      {/* 系统未设置任何收银员/微信账户时，引导先去账户管理 */}
      <ConfirmDialog
        open={noAccounts}
        title="请先设置收款账户"
        message="系统尚未设置收银员和微信账户。创建礼簿前，请先到「账户管理」添加至少一个收款账户。"
        variant="info"
        confirmLabel="去账户管理"
        cancelLabel="返回礼簿列表"
        onConfirm={() => navigate({ to: '/accounts' })}
        onCancel={() => navigate({ to: '/guestbooks' })}
      />

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
