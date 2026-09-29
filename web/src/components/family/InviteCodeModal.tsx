import { useState } from 'react'
import Modal from '../Modal'
import { refreshInviteCode } from '../../lib/api-client'

interface Props {
  open: boolean
  onClose: () => void
  groupId: number
  inviteCode: string
  expiresAt?: string | null
  onRefreshed?: (code: string, expiresAt: string | null) => void
}

export default function InviteCodeModal({
  open,
  onClose,
  groupId,
  inviteCode,
  expiresAt,
  onRefreshed,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = inviteCode
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const res = await refreshInviteCode(groupId)
      onRefreshed?.(res.invite_code, res.invite_expires_at)
    } catch { /* toast in parent */ }
    finally {
      setRefreshing(false)
    }
  }

  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false

  return (
    <Modal open={open} onClose={onClose} title="邀请码" maxWidth="sm">
      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full flex-col items-center gap-1 rounded-lg border border-line bg-bg p-5">
          <span className="text-xs text-ink-secondary">邀请码</span>
          <span className="font-mono text-2xl font-bold tracking-widest text-primary">
            {inviteCode}
          </span>
          {expiresAt && (
            <span className={`mt-1 text-xs ${isExpired ? 'text-danger' : 'text-ink-secondary'}`}>
              {isExpired ? '已过期' : `有效期至 ${new Date(expiresAt).toLocaleString('zh-CN')}`}
            </span>
          )}
        </div>

        <div className="flex w-full gap-3">
          <button
            onClick={handleCopy}
            className="flex-1 rounded-btn bg-primary py-2.5 text-sm font-semibold text-white"
          >
            {copied ? '已复制' : '复制邀请码'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex-1 rounded-btn border border-line py-2.5 text-sm font-medium text-ink-secondary disabled:opacity-50"
          >
            {refreshing ? '刷新中…' : '重新生成'}
          </button>
        </div>

        <p className="text-center text-xs text-ink-secondary">
          将此邀请码分享给家庭成员，对方在「加入协作」页面输入即可加入。
        </p>
      </div>
    </Modal>
  )
}
