import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { api } from '../lib/api'
import { setToken, setCurrentUser, type AuthUser } from '../lib/auth'
import { showGlobalToast } from '../lib/toast-bus'
import { describeError, isOutageError, NETWORK_ERROR_TOAST_KEY } from '../lib/queryClient'
import EmailSuggestInput, { rememberEmail } from '../components/EmailSuggestInput'

interface TokenResponse {
  access_token: string
  user: AuthUser
}

interface AuthStatus {
  needs_init: boolean
  user_count: number
}

type ErrorField = 'username' | 'password' | 'confirm' | 'phone' | 'code' | 'terms'

const PHONE_PATTERN = /^1[3-9]\d{9}$/

export default function LoginPage() {
  const navigate = useNavigate()
  const [isRegister, setIsRegister] = useState(false)
  const [needsInit, setNeedsInit] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [securityEmail1, setSecurityEmail1] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [sendingCode, setSendingCode] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [error, setError] = useState('')
  const [errorField, setErrorField] = useState<ErrorField>('password')
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    api.get<AuthStatus>('/auth/status').then((status) => {
      if (status.needs_init) {
        setNeedsInit(true)
        setIsRegister(true)
      }
    }).catch((err) => {
      // 服务器不可达时必须让用户知情，不能静默（全局 Toast，含节流去重）
      showGlobalToast(describeError(err), isOutageError(err)
        ? { sticky: true, key: NETWORK_ERROR_TOAST_KEY }
        : undefined)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // 协议弹窗打开时支持 Esc 关闭
  useEffect(() => {
    if (!showTerms) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowTerms(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showTerms])

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

  function setFieldError(message: string, field: ErrorField) {
    setError(message)
    setErrorField(field)
  }

  async function handleSendCode() {
    if (!phone) return
    setError('')
    setSendingCode(true)
    try {
      await api.post('/auth/send-sms-code', { phone })
      startCountdown()
    } catch (err: unknown) {
      setFieldError(err instanceof Error ? err.message : '验证码发送失败', 'code')
    } finally {
      setSendingCode(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (isRegister && password !== confirmPassword) {
      setFieldError('两次输入的密码不一致', 'confirm')
      return
    }

    if (isRegister && !PHONE_PATTERN.test(phone)) {
      setFieldError('请输入正确的 11 位手机号', 'phone')
      return
    }

    if (isRegister && !phoneCode) {
      setFieldError('请输入短信验证码', 'code')
      return
    }

    if (isRegister && !agreedToTerms) {
      setFieldError('请先阅读并同意用户协议', 'terms')
      return
    }

    setLoading(true)
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login'
      const body = isRegister
        ? {
            username: username.trim() || undefined,
            password,
            phone,
            phone_code: phoneCode,
            security_email_1: securityEmail1 || undefined,
          }
        : { username, password }
      const res = await api.post<TokenResponse>(endpoint, body)
      setToken(res.access_token)
      setCurrentUser(res.user)
      if (isRegister && securityEmail1) {
        rememberEmail(securityEmail1)
      }
      const isAdmin = res.user.role === 'super_admin' || res.user.role === 'admin'
      navigate({ to: isAdmin ? '/admin' : '/', replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败'
      // 注册时的接口错误（如用户名/手机号已存在）归到对应字段，登录时归到密码字段
      if (isRegister && msg.includes('手机号')) {
        setFieldError(msg, 'phone')
      } else {
        setFieldError(msg, isRegister ? 'username' : 'password')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-card bg-card p-8 shadow-card">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-ink">🧧 礼尚云</h1>
          <p className="mt-1 text-xs text-ink-secondary">人情往来小账本</p>
          <p className="mt-2 text-sm text-ink-secondary">
            {needsInit ? '首次运行，请创建系统管理员' : isRegister ? '创建新账户' : '登录以继续'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              {isRegister ? '用户名（选填）' : '账号'}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                setError('')
              }}
              required={!isRegister}
              autoFocus
              autoComplete="username"
              className={`w-full rounded-lg border bg-bg px-3 py-2 text-ink outline-none focus:border-primary ${error && errorField === 'username' ? 'border-danger' : 'border-line'}`}
              placeholder={isRegister ? '请输入用户名' : '请输入用户名或手机号'}
            />
            {isRegister && (
              <p className="mt-1 text-xs text-ink-secondary">
                留空将自动生成（如 用户_20260001），注册后可在系统设置中修改
              </p>
            )}
            {!isRegister && (
              <p className="mt-1 text-xs text-ink-secondary">支持用户名或手机号登录</p>
            )}
            {error && errorField === 'username' && (
              <p className="mt-1 text-xs text-danger">{error}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              required
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              className={`w-full rounded-lg border bg-bg px-3 py-2 text-ink outline-none focus:border-primary ${error && errorField === 'password' ? 'border-danger' : 'border-line'}`}
              placeholder="请输入密码"
            />
            {error && errorField === 'password' && (
              <p className="mt-1 text-xs text-danger">{error}</p>
            )}
          </div>

          {isRegister && (
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                确认密码
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setError('')
                }}
                required
                autoComplete="new-password"
                className={`w-full rounded-lg border bg-bg px-3 py-2 text-ink outline-none focus:border-primary ${error && errorField === 'confirm' ? 'border-danger' : 'border-line'}`}
                placeholder="请再次输入密码"
              />
              {error && errorField === 'confirm' && (
                <p className="mt-1 text-xs text-danger">{error}</p>
              )}
            </div>
          )}

          {isRegister && (
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                手机号 <span className="text-danger">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))
                  setError('')
                }}
                required
                inputMode="numeric"
                autoComplete="tel"
                aria-label="手机号"
                className={`w-full rounded-lg border bg-bg px-3 py-2 text-ink outline-none focus:border-primary ${error && errorField === 'phone' ? 'border-danger' : 'border-line'}`}
                placeholder="用于注册和找回账号"
              />
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={phoneCode}
                  onChange={(e) => {
                    setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    setError('')
                  }}
                  required
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label="短信验证码"
                  className={`min-w-0 flex-1 rounded-lg border bg-bg px-3 py-2 text-ink outline-none focus:border-primary ${error && errorField === 'code' ? 'border-danger' : 'border-line'}`}
                  placeholder="短信验证码"
                />
                <button
                  type="button"
                  disabled={countdown > 0 || sendingCode || !PHONE_PATTERN.test(phone)}
                  onClick={handleSendCode}
                  className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                >
                  {sendingCode ? '发送中…' : countdown > 0 ? `${countdown}s` : '发送验证码'}
                </button>
              </div>
              {error && (errorField === 'phone' || errorField === 'code') && (
                <p className="mt-1 text-xs text-danger">{error}</p>
              )}
            </div>
          )}

          {isRegister && (
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">
                安全邮箱 <span className="text-xs font-normal text-ink-secondary">（选填）</span>
              </label>
              <EmailSuggestInput
                value={securityEmail1}
                onChange={setSecurityEmail1}
                autoComplete="email"
                placeholder="用于找回密码，可稍后在设置中绑定"
              />
            </div>
          )}

          {isRegister && (
            <div>
              <label className="flex items-start gap-2 text-sm text-ink-secondary">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => {
                    setAgreedToTerms(e.target.checked)
                    setError('')
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-line"
                />
                <span>
                  我已阅读并同意
                  <button
                    type="button"
                    onClick={() => setShowTerms(true)}
                    className="text-primary hover:underline"
                  >
                    《用户协议》
                  </button>
                </span>
              </label>
              {error && errorField === 'terms' && (
                <p className="mt-1 text-xs text-danger">{error}</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-btn bg-primary py-2.5 font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? '请稍候…' : isRegister ? '注册' : '登录'}
          </button>
        </form>

        {!isRegister && (
          <div className="mt-6 flex flex-col gap-2 text-center text-sm">
            <Link to="/password-reset" className="text-ink-secondary hover:text-primary">
              忘记密码？
            </Link>
            <button
              type="button"
              onClick={() => setIsRegister(true)}
              className="text-ink-secondary hover:text-primary"
            >
              没有账户？立即注册
            </button>
          </div>
        )}
        {isRegister && !needsInit && (
          <div className="mt-6 text-center text-sm">
            <button
              type="button"
              onClick={() => { setIsRegister(false); setError('') }}
              className="text-ink-secondary hover:text-primary"
            >
              已有账户？返回登录
            </button>
          </div>
        )}
      </div>

      {showTerms && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowTerms(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="用户协议"
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-card bg-card p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-ink">用户协议</h2>
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                aria-label="关闭用户协议"
                className="rounded-lg px-2 py-1 text-lg text-ink-secondary transition-colors hover:bg-bg hover:text-ink"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 text-sm leading-relaxed text-ink-secondary">
              <p className="font-medium text-ink">欢迎使用礼尚云</p>
              <p>本协议是您与礼尚云服务提供者之间关于使用本服务所订立的协议。请您仔细阅读本协议，特别是免除或者限制责任的条款、法律适用和争议解决条款。如您对本协议有任何疑问，可向客服咨询。</p>

              <h3 className="font-semibold text-ink">一、服务内容</h3>
              <p>礼尚云是一款人情往来记录工具，随手记录收礼送礼、管理礼簿、对账统计，让每一份心意都有处安放。本服务通过网站、移动应用等形式向您提供。</p>

              <h3 className="font-semibold text-ink">二、账号注册与使用</h3>
              <p>1. 您需要提供真实、准确的个人信息完成注册。<br/>
              2. 您应妥善保管账号密码，因您自身原因导致的账号泄露或损失由您自行承担。<br/>
              3. 您不得将账号转让、出借给他人使用。<br/>
              4. 如发现账号异常，应立即通知我们。</p>

              <h3 className="font-semibold text-ink">三、用户行为规范</h3>
              <p>您在使用本服务时应遵守法律法规，不得利用本服务从事以下行为：<br/>
              1. 发布、传播违法违规信息；<br/>
              2. 侵犯他人知识产权、商业秘密等合法权益；<br/>
              3. 干扰、破坏本服务正常运行；<br/>
              4. 其他违反法律法规或公序良俗的行为。</p>

              <h3 className="font-semibold text-ink">四、隐私保护</h3>
              <p>1. 我们将按照隐私政策收集、使用、存储和保护您的个人信息。<br/>
              2. 您的礼金记录、人员信息等数据属于您的个人隐私，我们将采取技术措施予以保护。<br/>
              3. 未经您同意，我们不会向第三方披露您的个人信息，法律法规另有规定的除外。</p>

              <h3 className="font-semibold text-ink">五、知识产权</h3>
              <p>本服务包含的软件、界面设计、文字、图片等知识产权归服务提供者所有。您仅可获得本服务的使用权，不得复制、修改、反向工程或用于商业用途。</p>

              <h3 className="font-semibold text-ink">六、免责声明</h3>
              <p>1. 因不可抗力、系统维护等原因导致服务中断，我们不承担责任，但应提前通知。<br/>
              2. 您应自行备份重要数据，因您未备份导致的数据丢失我们不承担责任。<br/>
              3. 本服务按"现状"提供，我们不提供任何明示或暗示的保证。</p>

              <h3 className="font-semibold text-ink">七、协议变更</h3>
              <p>我们有权根据需要修改本协议，修改后的协议将在平台上公布。如您继续使用本服务，即视为同意修改后的协议。</p>

              <h3 className="font-semibold text-ink">八、法律适用与争议解决</h3>
              <p>本协议的成立、生效、履行、解释及争议解决均适用中华人民共和国法律。因本协议产生的争议，双方应友好协商解决；协商不成的，可向服务提供者所在地有管辖权的人民法院提起诉讼。</p>

              <p className="pt-2 text-xs text-ink-secondary/60">最后更新日期：2026 年 9 月 25 日</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
