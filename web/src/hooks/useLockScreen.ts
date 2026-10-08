import { useEffect, useCallback } from 'react'
import { useAppStore } from '../store/appStore'

export function useLockScreen() {
  const { lockState, setLocked, updateLastActivity } = useAppStore()

  const handleActivity = useCallback(() => {
    // 已锁屏时活动不解除锁定：解锁只能走锁屏界面的密码/锁屏密码验证
    if (lockState.isLocked) return
    updateLastActivity()
  }, [lockState.isLocked, setLocked, updateLastActivity])

  useEffect(() => {
    const checkLock = () => {
      const elapsed = Date.now() - lockState.lastActivity
      const timeoutMs = lockState.lockTimeout * 60 * 1000
      if (elapsed >= timeoutMs && !lockState.isLocked) {
        setLocked(true)
      }
    }

    const interval = setInterval(checkLock, 10000)

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true })
    })

    return () => {
      clearInterval(interval)
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity)
      })
    }
  }, [lockState, setLocked, handleActivity])

  return {
    isLocked: lockState.isLocked,
    lockTimeout: lockState.lockTimeout,
    setLocked,
    setLockTimeout: useAppStore.getState().setLockTimeout,
  }
}
