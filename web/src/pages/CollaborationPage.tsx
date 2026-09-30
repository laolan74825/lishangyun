import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import PageScaffold from '../components/PageScaffold'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Toast, { useToast } from '../components/Toast'
import {
  useAcceptedCollaborations,
  useCollaborationInviteLogs,
  useCollaborationInvites,
  useRevokeCollaborationInvite,
} from '../hooks/useQueries'
import type { CollaborationInvite, CollaborationInviteAccepted } from '../types'

const permissionLabels: Record<string, string> = {
  record: '仅记账',
  reconcile: '仅对账',
  both: '记账 + 对账',
}

const statusLabels: Record<string, string> = {
  pending: '待接受',
  accepted: '协作中',
  rejected: '已拒绝',
  revoked: '已撤销',
  expired: '已过期',
}

const statusFilters = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待接受' },
  { value: 'accepted', label: '协作中' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'revoked', label: '已撤销' },
  { value: 'expired', label: '已过期' },
]

const actionTypeLabels: Record<string, string> = {
  SEND: '发送邀请',
  ACCEPT: '接受邀请',
  REJECT: '拒绝邀请',
  REVOKE: '撤销',
}

function formatPeriod(start: string, end: string) {
  return `${dayjs(start).format('YYYY-MM-DD HH:mm')} ～ ${dayjs(end).format('YYYY-MM-DD HH:mm')}`
}

/** 协作人员管理：我发出的邀请 + 我接受的协作 */
export default function CollaborationPage() {
  const [tab, setTab] = useState<'sent' | 'received'>('sent')
  const [statusFilter, setStatusFilter] = useState('')
  const [guestbookFilter, setGuestbookFilter] = useState<number | ''>('')
  const [revokeTarget, setRevokeTarget] = useState<CollaborationInvite | null>(null)
  const [logsTarget, setLogsTarget] = useState<number | null>(null)
  const { toast, showToast } = useToast()

  const { data: invites = [], isLoading: invitesLoading } = useCollaborationInvites()
  const { data: accepted = [], isLoading: acceptedLoading } = useAcceptedCollaborations()
  const revokeMutation = useRevokeCollaborationInvite()
  const { data: logs = [] } = useCollaborationInviteLogs(logsTarget)

  const guestbookOptions = useMemo(() => {
    const map = new Map<number, string>()
    invites.forEach((inv) => map.set(inv.guestbook_id, `礼簿 #${inv.guestbook_id}`))
    return [...map.entries()]
  }, [invites])

  const filteredInvites = useMemo(() => {
    return invites.filter((inv) => {
      if (statusFilter && inv.status !== statusFilter) return false
      if (guestbookFilter !== '' && inv.guestbook_id !== guestbookFilter) return false
      return true
    })
  }, [invites, statusFilter, guestbookFilter])

  function handleRevoke() {
    if (!revokeTarget?.id) return
    revokeMutation.mutate(revokeTarget.id, {
      onSuccess: () => {
        showToast(revokeTarget.status === 'pending' ? '邀请已取消' : '授权已撤销')
        setRevokeTarget(null)
      },
      onError: (e) => showToast('操作失败：' + e.message),
    })
  }

  function renderSentActions(invite: CollaborationInvite) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setLogsTarget(invite.id ?? null)}
          className="rounded-btn border border-line px-3 py-1.5 text-xs text-ink-secondary hover:border-primary"
        >
          日志
        </button>
        {invite.status === 'pending' && (
          <button
            onClick={() => setRevokeTarget(invite)}
            className="rounded-btn border border-warning px-3 py-1.5 text-xs text-warning hover:bg-warning/10"
          >
            取消邀请
          </button>
        )}
        {invite.status === 'accepted' && (
          <button
            onClick={() => setRevokeTarget(invite)}
            className="rounded-btn border border-danger px-3 py-1.5 text-xs text-danger hover:bg-danger-bg"
          >
            撤销授权
          </button>
        )}
      </div>
    )
  }

  function renderStatusBadge(status: string) {
    const color =
      status === 'accepted'
        ? 'bg-success-bg text-success-deep'
        : status === 'pending'
          ? 'bg-info/10 text-info'
          : 'bg-gray-100 text-ink-secondary'
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
        {statusLabels[status] || status}
      </span>
    )
  }

  function receivedStatus(item: CollaborationInviteAccepted): { label: string; active: boolean } {
    const now = dayjs()
    const start = dayjs(item.collaboration_start_at)
    const end = dayjs(item.collaboration_end_at)
    if (now.isBefore(start)) return { label: '未开始', active: false }
    if (now.isAfter(end)) return { label: '已过期', active: false }
    return { label: '协作中', active: true }
  }

  return (
    <PageScaffold title="协作管理" description="管理您发出的协作邀请和接受的协作">
      {/* Tab 切换 */}
      <div className="flex gap-2 border-b border-line">
        {(
          [
            { key: 'sent', label: '我发出的邀请' },
            { key: 'received', label: '我接受的协作' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-secondary hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sent' ? (
        <div className="flex flex-col gap-4">
          {/* 筛选 */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-btn border border-line bg-card px-3 text-sm outline-none focus:border-primary"
            >
              {statusFilters.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              value={guestbookFilter}
              onChange={(e) => setGuestbookFilter(e.target.value === '' ? '' : Number(e.target.value))}
              className="h-10 rounded-btn border border-line bg-card px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">全部礼簿</option>
              {guestbookOptions.map(([id]) => (
                <option key={id} value={id}>
                  礼簿 #{id}
                </option>
              ))}
            </select>
          </div>

          {invitesLoading ? (
            <p className="py-10 text-center text-sm text-ink-secondary">加载中…</p>
          ) : filteredInvites.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-secondary">
              暂无邀请，可在礼簿页面点击「协助邀请」发送
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {filteredInvites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-card p-4 shadow-card"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{invite.invitee_username}</span>
                      {renderStatusBadge(invite.status)}
                    </div>
                    <p className="mt-1 text-xs text-ink-secondary">
                      礼簿 #{invite.guestbook_id} · {permissionLabels[invite.permissions] || invite.permissions}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-secondary">
                      协作时段：{formatPeriod(invite.collaboration_start_at, invite.collaboration_end_at)}
                    </p>
                    {invite.status === 'pending' && (
                      <p className="mt-0.5 text-xs text-info">
                        邀请信号有效至 {dayjs(invite.signal_expires_at).format('HH:mm:ss')}
                      </p>
                    )}
                  </div>
                  {renderSentActions(invite)}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {acceptedLoading ? (
            <p className="py-10 text-center text-sm text-ink-secondary">加载中…</p>
          ) : accepted.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-secondary">
              暂无接受的协作，收到邀请后可在首页接受
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {accepted.map((item) => {
                const st = receivedStatus(item)
                return (
                  <li
                    key={item.id}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-card bg-card p-4 shadow-card ${st.active ? '' : 'opacity-60'}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{item.inviter_username}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            st.active ? 'bg-success-bg text-success-deep' : 'bg-gray-100 text-ink-secondary'
                          }`}
                        >
                          {st.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-secondary">
                        「{item.guestbook_name}」 · {permissionLabels[item.permissions] || item.permissions}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-secondary">
                        协作时段：{formatPeriod(item.collaboration_start_at, item.collaboration_end_at)}
                      </p>
                    </div>
                    {st.active && (
                      <button
                        onClick={() => showToast('受限视图即将推出，可通过礼簿详情访问')}
                        className="rounded-btn border border-primary px-4 py-2 text-xs font-medium text-primary hover:bg-primary/10"
                      >
                        进入礼簿
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* 撤销确认 */}
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

      {/* 日志弹窗 */}
      {logsTarget !== null && (
        <Modal open={true} onClose={() => setLogsTarget(null)} title="操作日志" maxWidth="md">
          <div className="flex flex-col gap-2">
            {logs.length === 0 && <p className="text-sm text-ink-secondary">暂无日志</p>}
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium text-ink">
                    {actionTypeLabels[log.action_type] || log.action_type}
                  </span>
                  {log.operator_name && (
                    <span className="ml-2 text-xs text-ink-secondary">{log.operator_name}</span>
                  )}
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
    </PageScaffold>
  )
}
