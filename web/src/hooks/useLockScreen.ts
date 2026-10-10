import { useEffect, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import { isAuthenticated } from '../lib/auth'

/**
 * 自动锁屏 hook。
 *
 * 判定原则：距离"最后活跃时间"超过锁定时长即锁。
 * - 活动事件（点击/按键/触摸/滚动）只在未超时时刷新活跃时间；
 *   已超时后的第一次活动先执行锁屏、不刷新时间——否则电脑睡眠期间
 *   JS 定时器停摆，唤醒后用户一点击就刷新倒计时，锁永远不会触发。
 * - 定时器在后台标签/熄屏时会被浏览器节流甚至暂停，因此除 10s 轮询外，
 *   还在 visibilitychange / focus（点亮屏幕、切回标签）时立即判定。
 * - 最后活跃时间持久化在 localStorage，浏览器重开后仍按真实离开时长判定。
 */
export function useLockScreen() {
  const { lockState, setLocked, updateLastActivity } = useAppStore()

  /** 判定并执行锁屏，返回当前是否已锁 */
  const checkLock = useCallback(() => {
    // 未登录不锁屏：没有账户可用来解锁，锁死页面会把登录/初始化流程堵死
    if (!isAuthenticated()) return false
    const state = useAppStore.getState().lockState
    if (state.isLocked) return true
    const elapsed = Date.now() - state.lastActivity
    if (elapsed >= state.lockTimeout * 60 * 1000) {
      setLocked(true)
      return true
    }
    return false
  }, [setLocked])

  const handleActivity = useCallback(() => {
    // 已超时：先锁屏，不刷新活跃时间（避免"唤醒-点击-倒计时重置"竞态导致永不锁定）
    if (checkLock()) return
    updateLastActivity()
  }, [checkLock, updateLastActivity])

  useEffect(() => {
    const interval = setInterval(checkLock, 10000)
    // 熄屏唤醒 / 切回标签时立即判定一次，不等被节流的定时器
    document.addEventListener('visibilitychange', checkLock)
    window.addEventListener('focus', checkLock)

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true })
    })

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', checkLock)
      window.removeEventListener('focus', checkLock)
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity)
      })
    }
  }, [checkLock, handleActivity])

  return {
    isLocked: lockState.isLocked,
    lockTimeout: lockState.lockTimeout,
    setLocked,
    setLockTimeout: useAppStore.getState().setLockTimeout,
  }
}
