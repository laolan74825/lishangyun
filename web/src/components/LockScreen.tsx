import { useState, useRef, useEffect } from 'react'
import { useLockScreen } from '../hooks/useLockScreen'
import { getCurrentUser, isAuthenticated } from '../lib/auth'
import { verifyPassword, verifyLockPin } from '../lib/api-client'
import { useLockPinStatus, useProfile } from '../hooks/useQueries'
import { useAppStore } from '../store/appStore'

type UnlockMethod = 'password' | 'pin'

export default function LockScreen() {
  const { isLocked } = useLockScreen()
  // 未登录时不发起查询：这两个接口 401 会触发跳登录页，登录页上反复
  // 整页刷新（401 → 跳 /login → 再 401 的死循环）
  const authed = isAuthenticated()
  const { data: lockPin } = useLockPinStatus({ enabled: authed })
  const { data: profile } = useProfile({ enabled: authed })
  const setLockTimeout = useAppStore((s) => s.setLockTimeout)
  const pinEnabled = lockPin?.enabled === true

  // 服务端保存的自动锁定时间同步进锁屏状态（此前设置页改了却不生效）
  useEffect(() => {
    if (profile?.auto_lock_minutes) {
      setLockTimeout(profile.auto_lock_minutes)
    }
  }, [profile, setLockTimeout])

  const [method, setMethod] = useState<UnlockMethod>('password')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isLocked) {
      setPassword('')
      setPin('')
      setError('')
      // 只设了锁屏密码时默认选中锁屏密码方式
      setMethod((m) => (m === 'pin' && !pinEnabled ? 'password' : m))
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isLocked, pinEnabled])

  const unlock = () => {
    const { setLocked, updateLastActivity } = useAppStore.getState()
    setLocked(false)
    updateLastActivity()
    setPassword('')
    setPin('')
  }

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = method === 'password' ? password : pin
    if (!value.trim()) return

    setLoading(true)
    setError('')
    try {
      if (method === 'password') {
        await verifyPassword(password)
      } else {
        await verifyLockPin(pin)
      }
      unlock()
    } catch {
      setError(method === 'password' ? '密码错误，请重试' : '锁屏密码错误，请重试')
      setPassword('')
      setPin('')
      inputRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  // 未登录不渲染锁屏（页面已空闲超时也只在该登录用户在场时锁定）
  if (!isLocked || !authed) return null

  const user = getCurrentUser()
  const canSubmit = method === 'password' ? password.trim().length > 0 : pin.length === 4

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/60 p-4 backdrop-blur-md">
      <form
        onSubmit={handleUnlock}
        className="flex w-full max-w-xs flex-col items-center gap-5 rounded-card bg-card p-8 shadow-modal"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
          {user?.username?.charAt(0)?.toUpperCase() ?? '?'}
        </div>

        <div className="text-center">
          <p className="text-lg font-semibold text-ink">
            {user?.username ?? '用户'}
          </p>
          <p className="mt-1 text-sm text-ink-secondary">屏幕已锁定，{pinEnabled ? '输入登录密码或锁屏密码解锁' : '请输入密码解锁'}</p>
        </div>

        {pinEnabled && (
          <div className="flex w-full rounded-btn bg-bg p-1" role="tablist" aria-label="解锁方式">
            {(
              [
                ['password', '登录密码'],
                ['pin', '锁屏密码'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={method === value}
                onClick={() => {
                  setMethod(value)
                  setError('')
                  setTimeout(() => inputRef.current?.focus(), 50)
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  method === value ? 'bg-card text-ink shadow-card' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {method === 'password' ? (
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入登录密码"
            aria-label="登录密码"
            className="w-full rounded-btn border border-line bg-bg px-4 py-3 text-center text-lg outline-none focus:border-primary"
            autoComplete="current-password"
          />
        ) : (
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="请输入 4 位锁屏密码"
            aria-label="锁屏密码"
            className="w-full rounded-btn border border-line bg-bg px-4 py-3 text-center text-lg tracking-[0.5em] outline-none focus:border-primary"
            autoComplete="off"
          />
        )}

        {error && (
          <p className="text-sm text-danger" role="alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="w-full rounded-btn bg-primary py-3 text-lg font-semibold text-white transition-colors hover:bg-primary-deep disabled:opacity-50"
        >
          {loading ? '验证中…' : '解锁'}
        </button>
      </form>
    </div>
  )
}
