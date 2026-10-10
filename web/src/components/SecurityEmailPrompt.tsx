import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useSecurityEmails } from '../hooks/useQueries'
import { getCurrentUser } from '../lib/auth'

/**
 * 新用户安全邮箱引导弹窗。
 *
 * 注册时安全邮箱为选填；未绑定已验证安全邮箱的用户，
 * 首次进入应用时弹窗提醒去设置页绑定——安全邮箱是除手机号外
 * 找回密码的兜底通道（手机号失效/换号场景）。
 *
 * 弹窗按用户ID记忆"本次不再提醒"；绑定邮箱后自然消失。
 */
export default function SecurityEmailPrompt() {
  const navigate = useNavigate()
  const user = getCurrentUser()
  const { data: emails, isLoading } = useSecurityEmails()
  const [dismissed, setDismissed] = useState(false)

  if (!user || isLoading || dismissed) return null

  const hasVerifiedEmail = (emails ?? []).some((e) => e.is_verified)
  if (hasVerifiedEmail) return null

  const dismissKey = `gr_email_prompt_hide_${user.id}`
  if (localStorage.getItem(dismissKey)) return null

  function handleDismiss() {
    localStorage.setItem(dismissKey, '1')
    setDismissed(true)
  }

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="设置安全邮箱提醒"
        className="w-full max-w-sm rounded-card bg-card p-6 shadow-modal"
      >
        <div className="text-center">
          <span className="text-4xl">📮</span>
          <h2 className="mt-3 text-lg font-semibold text-ink">建议您设置安全邮箱</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
            您还没有绑定安全邮箱。一旦手机号停用或换号，安全邮箱是找回密码的唯一兜底通道，
            花一分钟绑定更安心。
          </p>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => navigate({ to: '/settings' })}
            className="rounded-btn bg-primary py-2.5 font-semibold text-white transition-colors hover:bg-primary/90"
          >
            去设置安全邮箱
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-btn py-2 text-sm text-ink-secondary transition-colors hover:text-ink"
          >
            暂不设置
          </button>
        </div>
      </div>
    </div>
  )
}
