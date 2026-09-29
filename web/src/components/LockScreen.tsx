import { useState, useRef, useEffect } from 'react'
import { useLockScreen } from '../hooks/useLockScreen'
import { getCurrentUser } from '../lib/auth'
import { api } from '../lib/api'
import { useAppStore } from '../store/appStore'

export default function LockScreen() {
  const { isLocked } = useLockScreen()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isLocked) {
      setPassword('')
      setError('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isLocked])

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return

    setLoading(true)
    setError('')
    try {
      const user = getCurrentUser()
      if (!user) {
        setError('用户信息丢失，请重新登录')
        return
      }
      await api.post('/auth/verify-password', { password })
      const { setLocked, updateLastActivity } = useAppStore.getState()
      setLocked(false)
      updateLastActivity()
      setPassword('')
    } catch {
      setError('密码错误，请重试')
      setPassword('')
      inputRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  if (!isLocked) return null

  const user = getCurrentUser()

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/60 backdrop-blur-md">
      <form
        onSubmit={handleUnlock}
        className="flex w-80 flex-col items-center gap-6 rounded-card bg-card p-8 shadow-modal"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
          {user?.username?.charAt(0)?.toUpperCase() ?? '?'}
        </div>

        <div className="text-center">
          <p className="text-lg font-semibold text-ink">
            {user?.username ?? '用户'}
          </p>
          <p className="mt-1 text-sm text-ink-secondary">屏幕已锁定，请输入密码解锁</p>
        </div>

        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="请输入密码"
          className="w-full rounded-btn border border-line bg-bg px-4 py-3 text-center text-lg outline-none focus:border-primary"
          autoComplete="current-password"
        />

        {error && (
          <p className="text-sm text-danger">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !password.trim()}
          className="w-full rounded-btn bg-primary py-3 text-lg font-semibold text-white transition-colors hover:bg-primary-deep disabled:opacity-50"
        >
          {loading ? '验证中…' : '解锁'}
        </button>
      </form>
    </div>
  )
}
