import { useState, useEffect } from 'react'
import Modal from '../Modal'
import { createAuthorizationCode, getAllGuestbooks, getAllPaymentAccounts } from '../../lib/api-client'
import type { Guestbook, PaymentAccount } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  showToast: (msg: string) => void
}

const PERMISSION_OPTIONS: { value: 'record' | 'reconcile' | 'both'; label: string; desc: string }[] = [
  { value: 'record', label: '仅记录', desc: '可以录入收礼数据' },
  { value: 'reconcile', label: '仅对账', desc: '可以查看和对账数据' },
  { value: 'both', label: '记录 + 对账', desc: '完整操作权限' },
]

const DURATION_PRESETS: { label: string; hours: number }[] = [
  { label: '1天', hours: 24 },
  { label: '3天', hours: 72 },
  { label: '7天', hours: 168 },
  { label: '30天', hours: 720 },
]

function formatDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function GenerateAuthCodeModal({ open, onClose, onCreated, showToast }: Props) {
  const [guestbooks, setGuestbooks] = useState<Guestbook[]>([])
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)

  const [guestbookId, setGuestbookId] = useState<number | ''>('')
  const [granteeName, setGranteeName] = useState('')
  const [granteeAccountId, setGranteeAccountId] = useState<number | ''>('')
  const [permissions, setPermissions] = useState<'record' | 'reconcile' | 'both'>('record')
  const [expiresAt, setExpiresAt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoadingMeta(true)
    Promise.all([getAllGuestbooks(), getAllPaymentAccounts()])
      .then(([gb, acc]) => {
        setGuestbooks(gb)
        setAccounts(acc)
      })
      .catch(() => showToast('加载数据失败'))
      .finally(() => setLoadingMeta(false))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setGuestbookId('')
    setGranteeName('')
    setGranteeAccountId('')
    setPermissions('record')
    setExpiresAt('')
  }

  function applyPreset(hours: number) {
    const d = new Date(Date.now() + hours * 3600 * 1000)
    setExpiresAt(formatDatetimeLocal(d))
  }

  async function handleSubmit() {
    if (!guestbookId) { showToast('请选择礼簿'); return }
    if (!granteeName.trim()) { showToast('请输入协作人员姓名'); return }
    if (!granteeAccountId) { showToast('请选择协作人员账户'); return }
    if (!expiresAt) { showToast('请设置协作截止时间'); return }

    const expiry = new Date(expiresAt)
    if (expiry <= new Date()) { showToast('截止时间不能早于当前'); return }

    setSubmitting(true)
    try {
      const res = await createAuthorizationCode({
        guestbook_id: guestbookId as number,
        grantee_name: granteeName.trim(),
        grantee_account_id: granteeAccountId as number,
        permissions,
        expires_at: expiry.toISOString(),
      })
      showToast(`授权码已生成：${res.code}`)
      reset()
      onCreated()
      onClose()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '生成失败')
    } finally {
      setSubmitting(false)
    }
  }

  const activeGuestbooks = guestbooks.filter((g) => g.status !== 'archived')

  return (
    <Modal open={open} onClose={onClose} title="邀请协作人员" maxWidth="md">
      {loadingMeta ? (
        <p className="py-8 text-center text-sm text-ink-secondary">加载中…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-ink-secondary">
            协作人员不同于家庭成员，仅在指定时间段内协助管理特定礼簿。
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">关联礼簿</span>
            <select
              value={guestbookId}
              onChange={(e) => setGuestbookId(e.target.value ? Number(e.target.value) : '')}
              className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
            >
              <option value="">选择礼簿</option>
              {activeGuestbooks.map((g) => (
                <option key={g.id} value={g.id}>{g.name}（{g.event_type}）</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">协作人员姓名</span>
            <input
              value={granteeName}
              onChange={(e) => setGranteeName(e.target.value)}
              placeholder="如：张三"
              maxLength={50}
              className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">协作人员账户</span>
            <select
              value={granteeAccountId}
              onChange={(e) => setGranteeAccountId(e.target.value ? Number(e.target.value) : '')}
              className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
            >
              <option value="">选择账户</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}（{a.type === 'wechat' ? '微信' : '现金'}）</option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">权限</span>
            <div className="flex gap-2">
              {PERMISSION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPermissions(opt.value)}
                  className={`flex-1 rounded-btn border px-3 py-2 text-xs transition-colors ${
                    permissions === opt.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-line text-ink-secondary hover:border-primary'
                  }`}
                >
                  <span className="font-medium">{opt.label}</span>
                  <span className="mt-0.5 block text-[10px] opacity-70">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">协作截止时间 <span className="text-danger">*</span></span>
            <div className="flex gap-2">
              {DURATION_PRESETS.map((p) => (
                <button
                  key={p.hours}
                  type="button"
                  onClick={() => applyPreset(p.hours)}
                  className="flex-1 rounded-btn border border-line py-2 text-xs text-ink-secondary transition-colors hover:border-primary hover:text-primary"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
              required
            />
            <span className="text-xs text-ink-secondary">到期后协作人员将无法继续操作该礼簿</span>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-2 rounded-btn bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? '生成中…' : '生成授权码'}
          </button>
        </div>
      )}
    </Modal>
  )
}
