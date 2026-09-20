import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { setToken, setCurrentUser, type AuthUser } from '../lib/auth'

interface TokenResponse {
  access_token: string
  user: AuthUser
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (isRegister && password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login'
      const res = await api.post<TokenResponse>(endpoint, { username, password })
      setToken(res.access_token)
      setCurrentUser(res.user)
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-card bg-card p-8 shadow-card">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-ink">🧧 随礼记账本</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            {isRegister ? '创建管理员账户' : '登录以继续'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-primary"
              placeholder="请输入用户名"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-primary"
              placeholder="请输入密码"
            />
          </div>

          {isRegister && (
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">确认密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-primary"
                placeholder="请再次输入密码"
              />
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
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
            <button
              type="button"
              onClick={() => setIsRegister(true)}
              className="text-ink-secondary hover:text-primary"
            >
              首次使用？创建管理员账户
            </button>
          </div>
        )}
        {isRegister && (
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
    </div>
  )
}
