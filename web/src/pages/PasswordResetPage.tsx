import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { requestPasswordReset, confirmPasswordReset } from '../lib/api-client'

type Step = 'email' | 'reset'

export default function PasswordResetPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const startCountdown = useCallback(() => {
    setCountdown(60)
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          timerRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  async function handleSendCode() {
    if (!email) return
    setError('')
    setSending(true)
    try {
      await requestPasswordReset(email)
      startCountdown()
      setStep('reset')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '验证码发送失败')
    } finally {
      setSending(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    if (newPassword.length < 6) {
      setError('密码长度至少 6 位')
      return
    }

    if (!code) {
      setError('请输入验证码')
      return
    }

    setLoading(true)
    try {
      await confirmPasswordReset({ email, code, new_password: newPassword })
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '密码重置失败')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <div className="w-full max-w-sm rounded-card bg-card p-8 text-center shadow-card">
          <span className="text-5xl">✅</span>
          <h2 className="mt-4 text-xl font-bold text-ink">密码重置成功</h2>
          <p className="mt-2 text-sm text-ink-secondary">请使用新密码登录</p>
          <Link
            to="/login"
            className="mt-6 inline-block rounded-btn bg-primary px-8 py-2.5 font-semibold text-white"
          >
            返回登录
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-card bg-card p-8 shadow-card">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-ink">🔑 重置密码</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            {step === 'email' ? '输入安全邮箱，获取验证码' : '输入验证码和新密码'}
          </p>
        </div>

        {step === 'email' ? (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">安全邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-primary"
                placeholder="请输入注册时的安全邮箱"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
            )}

            <button
              onClick={handleSendCode}
              disabled={sending || !email}
              className="rounded-btn bg-primary py-2.5 font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {sending ? '发送中…' : '发送验证码'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="rounded-lg bg-bg px-3 py-2 text-sm text-ink-secondary">
              验证码已发送至 <span className="font-medium text-ink">{email}</span>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-ink">验证码</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  maxLength={6}
                  autoFocus
                  className="flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-primary"
                  placeholder="请输入验证码"
                />
                <button
                  type="button"
                  disabled={countdown > 0 || sending}
                  onClick={handleSendCode}
                  className="whitespace-nowrap rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                >
                  {sending ? '发送中…' : countdown > 0 ? `${countdown}s` : '重新发送'}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-ink">新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-primary"
                placeholder="请输入新密码（至少 6 位）"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-ink">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-primary"
                placeholder="请再次输入新密码"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading || !code || !newPassword || !confirmPassword}
              className="rounded-btn bg-primary py-2.5 font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? '重置中…' : '重置密码'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm">
          <Link to="/login" className="text-ink-secondary hover:text-primary">
            返回登录
          </Link>
        </div>
      </div>
    </div>
  )
}
