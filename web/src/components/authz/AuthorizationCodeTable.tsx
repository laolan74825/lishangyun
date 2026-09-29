import { useState, useEffect } from 'react'
import ConfirmDialog from '../ConfirmDialog'
import Modal from '../Modal'
import { revokeAuthorizationCode, getAuthorizationCodeLogs } from '../../lib/api-client'
import type { AuthorizationCode, AuthorizationActionLog } from '../../types'

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-success/10', text: 'text-success', label: '有效' },
  bound: { bg: 'bg-primary/10', text: 'text-primary', label: '已绑定' },
  revoked: { bg: 'bg-danger/10', text: 'text-danger', label: '已撤销' },
  expired: { bg: 'bg-ink-secondary/10', text: 'text-ink-secondary', label: '已过期' },
}

const PERMISSION_LABELS: Record<string, string> = {
  record: '仅记录',
  reconcile: '仅对账',
  both: '记录 + 对账',
}

interface Props {
  codes: AuthorizationCode[]
  guestbookNames: Record<number, string>
  onRefresh: () => void
  showToast: (msg: string) => void
}

export default function AuthorizationCodeTable({ codes, guestbookNames, onRefresh, showToast }: Props) {
  const [revoking, setRevoking] = useState<AuthorizationCode | null>(null)
  const [logCode, setLogCode] = useState<AuthorizationCode | null>(null)

  async function handleRevoke() {
    if (!revoking) return
    try {
      await revokeAuthorizationCode(revoking.id!)
      showToast('授权码已撤销')
      onRefresh()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '撤销失败')
    }
    setRevoking(null)
  }

  if (codes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card bg-card py-12 shadow-card">
        <span className="text-4xl">🔑</span>
        <p className="text-sm text-ink-secondary">暂无授权码</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {codes.map((c) => {
          const style = STATUS_STYLES[c.status] ?? STATUS_STYLES.expired
          const isRevocable = c.status === 'active' || c.status === 'bound'
          return (
            <div key={c.id} className="rounded-card bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold tracking-wider text-ink">{c.code}</span>
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                  </div>
                  <p className="text-sm text-ink-secondary">
                    被授权人：{c.grantee_name} · {PERMISSION_LABELS[c.permissions] ?? c.permissions}
                  </p>
                  <p className="text-xs text-ink-secondary">
                    礼簿：{guestbookNames[c.guestbook_id] ?? `#${c.guestbook_id}`}
                    {' · '}过期：{new Date(c.expires_at).toLocaleString('zh-CN')}
                    {c.bound_at && ` · 绑定于 ${new Date(c.bound_at).toLocaleString('zh-CN')}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setLogCode(c)}
                    className="rounded-btn border border-line px-3 py-1.5 text-xs text-ink-secondary hover:border-primary hover:text-primary"
                  >
                    日志
                  </button>
                  {isRevocable && (
                    <button
                      onClick={() => setRevoking(c)}
                      className="rounded-btn border border-danger/30 px-3 py-1.5 text-xs text-danger hover:border-danger"
                    >
                      撤销
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={revoking !== null}
        title="撤销授权码"
        message={revoking ? `确定撤销「${revoking.grantee_name}」的授权码（${revoking.code}）吗？撤销后对方将无法继续操作。` : ''}
        variant="danger"
        confirmLabel="确认撤销"
        onConfirm={handleRevoke}
        onCancel={() => setRevoking(null)}
      />

      {logCode && <ActionLogModal code={logCode} onClose={() => setLogCode(null)} />}
    </>
  )
}

function ActionLogModal({ code, onClose }: { code: AuthorizationCode; onClose: () => void }) {
  const [logs, setLogs] = useState<AuthorizationActionLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAuthorizationCodeLogs(code.id!)
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [code.id])

  const ACTION_LABELS: Record<string, string> = {
    GENERATE: '生成',
    BIND: '绑定',
    REVOKE: '撤销',
  }

  return (
    <Modal open={true} onClose={onClose} title={`操作日志 — ${code.code}`} maxWidth="md">
      {loading ? (
        <p className="py-8 text-center text-sm text-ink-secondary">加载中…</p>
      ) : logs.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-secondary">暂无操作记录</p>
      ) : (
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="rounded-lg border border-line px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">
                  {ACTION_LABELS[log.action_type] ?? log.action_type}
                </span>
                <span className="text-xs text-ink-secondary">
                  {new Date(log.created_at).toLocaleString('zh-CN')}
                </span>
              </div>
              {log.detail && (
                <p className="mt-1 text-xs text-ink-secondary">{log.detail}</p>
              )}
              {log.operator_name && (
                <p className="mt-0.5 text-xs text-ink-secondary">操作人：{log.operator_name}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
