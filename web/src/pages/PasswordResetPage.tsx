import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import {
  requestPasswordReset,
  requestPasswordResetByPhone,
  confirmPasswordReset,
  requestPasswordResetHint,
} from '../lib/api-client'
import EmailSuggestInput, { rememberEmail } from '../components/EmailSuggestInput'

type Method = 'email' | 'phone'
type Step = 'request' | 'reset'

const PHONE_PATTERN = /^1[3-9]\d{9}$/

export default function PasswordResetPage() {
  const [method, setMethod] = useState<Method>('email')
  const [step, setStep] = useState<Step>('request')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [hintError, setHintError] = useState('')
  const [hintLoading, setHintLoading] = useState(false)
  /** 最近一次发起过查询的用户名，用于失焦去重（同一用户名不重复查询） */
  const [hintFor, setHintFor] = useState('')
  const [phone, setPhone] = useState('')
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

  /** 根据用户名获取掩码邮箱提示，帮助用户回忆应输入哪个邮箱 */
  async function fetchEmailHint() {
    const name = username.trim()
    if (!name) return
    setHintError('')
    setHintLoading(true)
    try {
      const res = await requestPasswordResetHint(name)
      setHintFor(name)
      if (res.masked_email) {
        setMaskedEmail(res.masked_email)
      } else {
        setMaskedEmail('')
        setHintError('未找到该用户或用户未绑定安全邮箱，请检查用户名是否正确')
      }
    } catch (err) {
      setHintFor(name)
      setMaskedEmail('')
      setHintError(err instanceof Error ? err.message : '查询失败，请稍后重试')
    } finally {
      setHintLoading(false)
    }
  }

  /** 用户名输入框失焦时自动查询掩码邮箱（每个用户名只查一次） */
  function handleUsernameBlur() {
    const name = username.trim()
    if (name && hintFor !== name && !hintLoading) {
      void fetchEmailHint()
    }
  }

  async function handleSendCode() {
    setError('')
    setSending(true)
    try {
      if (method === 'email') {
        if (!email) {
          setSending(false)
          return
        }
        // 已查到掩码邮箱时校验域名，尽早发现输错邮箱
        const maskedDomain = maskedEmail.includes('@') ? maskedEmail.split('@')[1] : ''
        const inputDomain = email.includes('@') ? email.split('@')[1] : ''
        if (maskedDomain && inputDomain && maskedDomain !== inputDomain) {
          setError(`邮箱域名与绑定的安全邮箱（@${maskedDomain}）不一致，请检查`)
          setSending(false)
          return
        }
        await requestPasswordReset(email)
        rememberEmail(email)
      } else {
        if (!PHONE_PATTERN.test(phone)) {
          setError('请输入正确的 11 位手机号')
          setSending(false)
          return
        }
        await requestPasswordResetByPhone(phone)
      }
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
      await confirmPasswordReset(
        method === 'email'
          ? { email, code, new_password: newPassword }
          : { phone, code, new_password: newPassword },
      )
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

  const targetLabel = method === 'email' ? email : phone

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-card bg-card p-8 shadow-card">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-ink">🔑 重置密码</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            {step === 'request'
              ? method === 'email'
                ? '通过安全邮箱获取验证码'
                : '通过注册手机号获取验证码'
              : '输入验证码和新密码'}
          </p>
        </div>

        <div className="mb-5 flex rounded-btn bg-bg p-1" role="tablist" aria-label="找回方式">
          {(
            [
              ['email', '邮箱找回'],
              ['phone', '手机找回'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={method === value}
              onClick={() => {
                setMethod(value)
                setStep('request')
                setError('')
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                method === value ? 'bg-card text-ink shadow-card' : 'text-ink-secondary hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {step === 'request' ? (
          <div className="flex flex-col gap-4">
            {method === 'email' ? (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">用户名</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value)
                        setMaskedEmail('')
                        setHintError('')
                        setHintFor('')
                      }}
                      onBlur={handleUsernameBlur}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          fetchEmailHint()
                        }
                      }}
                      required
                      autoFocus
                      className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-primary"
                      placeholder="请输入用户名"
                    />
                    <button
                      type="button"
                      onClick={fetchEmailHint}
                      disabled={hintLoading || !username.trim()}
                      className="whitespace-nowrap rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                    >
                      {hintLoading ? '查询中…' : '邮箱提示'}
                    </button>
                  </div>
                  {maskedEmail && (
                    <p className="mt-1.5 text-xs text-ink-secondary">
                      您的安全邮箱为 <span className="font-medium text-ink">{maskedEmail}</span>，请在下方输入完整邮箱地址
                    </p>
                  )}
                  {hintError && (
                    <p className="mt-1.5 text-xs text-danger">{hintError}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">安全邮箱</label>
                  <EmailSuggestInput
                    value={email}
                    onChange={setEmail}
                    required
                    placeholder={maskedEmail ? `请输入 ${maskedEmail} 的完整邮箱地址` : '请输入注册时的安全邮箱'}
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">注册手机号</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))
                    setError('')
                  }}
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="tel"
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-primary"
                  placeholder="请输入注册时使用的手机号"
                />
                <p className="mt-1.5 text-xs text-ink-secondary">
                  验证码将发送至该手机号（未注册的手机号不会收到短信）
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
            )}

            <button
              onClick={handleSendCode}
              disabled={sending || (method === 'email' ? !email : !PHONE_PATTERN.test(phone))}
              className="rounded-btn bg-primary py-2.5 font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {sending ? '发送中…' : '发送验证码'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="rounded-lg bg-bg px-3 py-2 text-sm text-ink-secondary">
              验证码已发送至 <span className="font-medium text-ink">{targetLabel}</span>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-ink">验证码</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-primary"
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
                autoComplete="new-password"
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
                autoComplete="new-password"
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
