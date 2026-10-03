import { useState, useEffect, useCallback } from 'react'
import Modal from '../Modal'
import { listApprovals, reviewApproval } from '../../lib/api-client'
import { getCurrentUser } from '../../lib/auth'
import type { PendingApproval } from '../../types'

const ACTION_LABELS: Record<string, string> = {
  CREATE: '新建',
  UPDATE: '修改',
  DELETE: '删除',
}

const TABLE_LABELS: Record<string, string> = {
  daily_record: '日常记录',
  gb_record: '收礼记录',
  person: '人员档案',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已拒绝',
  expired: '已过期',
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  approved: 'bg-primary/10 text-primary',
  rejected: 'bg-danger/10 text-danger',
  expired: 'bg-ink-secondary/10 text-ink-secondary',
}

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'expired' | ''

export default function ApprovalQueuePanel({
  groupId,
  isOwnerOrAdmin,
  showToast,
}: {
  groupId: number
  isOwnerOrAdmin: boolean
  showToast: (msg: string) => void
}) {
  const [approvals, setApprovals] = useState<PendingApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [detail, setDetail] = useState<PendingApproval | null>(null)
  const [reviewing, setReviewing] = useState<PendingApproval | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const filters: { group_id: number; status?: string } = { group_id: groupId }
      if (statusFilter) filters.status = statusFilter
      const data = await listApprovals(filters)
      setApprovals(data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [groupId, statusFilter])

  useEffect(() => { load() }, [load])

  async function handleReview(approved: boolean) {
    if (!reviewing) return
    setSubmitting(true)
    try {
      await reviewApproval(reviewing.id!, approved, reviewNote.trim() || undefined)
      showToast(approved ? '已通过' : '已拒绝')
      setReviewing(null)
      setReviewNote('')
      load()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'pending', label: '待审批' },
    { key: 'approved', label: '已通过' },
    { key: 'rejected', label: '已拒绝' },
    { key: 'expired', label: '已过期' },
    { key: '', label: '全部' },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`whitespace-nowrap rounded-btn px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === f.key
                ? 'bg-primary text-white'
                : 'border border-line text-ink-secondary hover:border-primary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-ink-secondary">加载中…</p>
      ) : approvals.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-secondary">暂无审批记录</p>
      ) : (
        approvals.map((a) => (
          <ApprovalRow
            key={a.id}
            approval={a}
            isOwnerOrAdmin={isOwnerOrAdmin}
            onViewDetail={() => setDetail(a)}
            onReview={(action) => {
              setReviewAction(action)
              setReviewing(a)
              setReviewNote('')
            }}
          />
        ))
      )}

      {detail && (
        <ApprovalDetailModal
          approval={detail}
          onClose={() => setDetail(null)}
        />
      )}

      {reviewing && (
        <Modal
          open={true}
          onClose={() => { setReviewing(null); setReviewNote('') }}
          title={reviewAction === 'approve' ? '审批通过' : '审批拒绝'}
          actions={
            <>
              <button
                onClick={() => { setReviewing(null); setReviewNote('') }}
                disabled={submitting}
                className="flex-1 rounded-btn border border-line py-2.5 font-medium text-ink-secondary disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={() => handleReview(reviewAction === 'approve')}
                disabled={submitting}
                className={`flex-1 rounded-btn py-2.5 font-medium text-white disabled:opacity-50 ${
                  reviewAction === 'approve'
                    ? 'bg-primary hover:bg-primary/90'
                    : 'bg-danger hover:bg-danger/90'
                }`}
              >
                {submitting ? '处理中…' : reviewAction === 'approve' ? '通过' : '拒绝'}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-secondary">
              {reviewAction === 'approve'
                ? `确定通过「${reviewing.submitter_name || `用户${reviewing.submitter_id}`}」的${ACTION_LABELS[reviewing.action_type] || reviewing.action_type}申请吗？`
                : `确定拒绝此申请吗？`}
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">备注（可选）</span>
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="审批意见…"
                rows={3}
                className="rounded-btn border border-line px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ApprovalRow({
  approval,
  isOwnerOrAdmin,
  onViewDetail,
  onReview,
}: {
  approval: PendingApproval
  isOwnerOrAdmin: boolean
  onViewDetail: () => void
  onReview: (action: 'approve' | 'reject') => void
}) {
  const isPending = approval.status === 'pending'
  const currentUser = getCurrentUser()
  const isSelf = currentUser?.id === approval.submitter_id

  return (
    <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink">
            {TABLE_LABELS[approval.target_table] ?? approval.target_table}
            {' · '}
            {ACTION_LABELS[approval.action_type] ?? approval.action_type}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLES[approval.status] ?? ''}`}>
            {STATUS_LABELS[approval.status] ?? approval.status}
          </span>
        </div>
        <span className="text-xs text-ink-secondary">
          提交者：{approval.submitter_name || `用户${approval.submitter_id}`}
          {' · '}
          {new Date(approval.created_at).toLocaleDateString('zh-CN')}
          {approval.expires_at && isPending && (
            <>
              {' · '}
              <span className={isExpiringSoon(approval.expires_at) ? 'text-danger' : ''}>
                过期：{new Date(approval.expires_at).toLocaleDateString('zh-CN')}
              </span>
            </>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onViewDetail}
          className="rounded-md border border-line px-2 py-1 text-xs text-ink-secondary hover:border-primary hover:text-ink"
        >
          详情
        </button>
        {isPending && isOwnerOrAdmin && !isSelf && (
          <>
            <button
              onClick={() => onReview('approve')}
              className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
            >
              通过
            </button>
            <button
              onClick={() => onReview('reject')}
              className="rounded-md border border-danger/30 px-2 py-1 text-xs text-danger hover:border-danger"
            >
              拒绝
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ApprovalDetailModal({
  approval,
  onClose,
}: {
  approval: PendingApproval
  onClose: () => void
}) {
  let snapshot: Record<string, unknown> = {}
  try {
    snapshot = approval.data_snapshot ? JSON.parse(approval.data_snapshot) : {}
  } catch { /* ignore */ }

  const targetTable = (snapshot.target_table as string) || approval.target_table
  const action = approval.action_type

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="审批详情"
      maxWidth="lg"
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoItem label="操作类型" value={ACTION_LABELS[action] ?? action} />
          <InfoItem label="目标表" value={TABLE_LABELS[targetTable] ?? targetTable} />
          <InfoItem label="提交者" value={approval.submitter_name || `用户${approval.submitter_id}`} />
          <InfoItem label="状态" value={STATUS_LABELS[approval.status] ?? approval.status} />
          <InfoItem label="提交时间" value={new Date(approval.created_at).toLocaleString('zh-CN')} />
          {approval.review_note && (
            <InfoItem label="审批备注" value={approval.review_note} />
          )}
        </div>

        {action === 'CREATE' && snapshot.data != null && (
          <SnapshotDataSection title="新建数据" data={snapshot.data as Record<string, unknown>} />
        )}

        {action === 'UPDATE' && (
          <div className="flex flex-col gap-3">
            {snapshot.before != null && (
              <SnapshotDataSection title="修改前" data={snapshot.before as Record<string, unknown>} variant="before" />
            )}
            {snapshot.after != null && (
              <SnapshotDataSection title="修改后" data={snapshot.after as Record<string, unknown>} variant="after" />
            )}
          </div>
        )}

        {action === 'DELETE' && snapshot.data != null && (
          <SnapshotDataSection title="删除数据" data={snapshot.data as Record<string, unknown>} variant="before" />
        )}

        {!approval.data_snapshot && (
          <p className="text-center text-sm text-ink-secondary">无快照数据</p>
        )}
      </div>
    </Modal>
  )
}

function SnapshotDataSection({
  title,
  data,
  variant,
}: {
  title: string
  data: Record<string, unknown>
  variant?: 'before' | 'after'
}) {
  const borderColor = variant === 'before'
    ? 'border-danger/30'
    : variant === 'after'
      ? 'border-primary/30'
      : 'border-line'

  const entries = Object.entries(data).filter(([k]) => !['id', 'created_at', 'updated_at', 'is_deleted', 'deleted_at'].includes(k))

  if (entries.length === 0) return null

  return (
    <div className={`rounded-lg border ${borderColor} p-3`}>
      <p className="mb-2 text-xs font-medium text-ink-secondary">{title}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-baseline gap-2 text-sm">
            <span className="shrink-0 text-ink-secondary">{formatFieldName(key)}：</span>
            <span className="truncate text-ink">{formatFieldValue(key, value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-ink-secondary">{label}</span>
      <p className="text-sm font-medium text-ink">{value}</p>
    </div>
  )
}

function isExpiringSoon(expiresAt: string): boolean {
  const diff = new Date(expiresAt).getTime() - Date.now()
  return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000
}

const FIELD_NAMES: Record<string, string> = {
  person_name: '姓名',
  guest_name: '宾客姓名',
  name: '名称',
  amount: '金额',
  event_type: '事由',
  event_date: '日期',
  payment_method: '支付方式',
  phone: '电话',
  note: '备注',
  relation_tag: '关系标签',
  relationship_tag: '关系标签',
  type: '类型',
  is_private: '隐私',
  agent_name: '经手人',
  check_status: '对账状态',
  record_time: '记录时间',
  nickname: '称谓',
  aliases: '别名',
}

function formatFieldName(key: string): string {
  return FIELD_NAMES[key] ?? key
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (key === 'amount' && typeof value === 'number') return `¥${(value / 100).toFixed(2)}`
  if (key === 'is_private' && typeof value === 'boolean') return value ? '是' : '否'
  if (key === 'type' && value === 'in') return '收进'
  if (key === 'type' && value === 'out') return '送出'
  if (key === 'payment_method') {
    const map: Record<string, string> = { cash: '现金', wechat: '微信', other: '其他' }
    return map[String(value)] ?? String(value)
  }
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}
