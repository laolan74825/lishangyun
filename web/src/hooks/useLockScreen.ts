import { useEffect, useCallback } from 'react'
import { useAppStore } from '../store/appStore'

export function useLockScreen() {
  const { lockState, setLocked, updateLastActivity } = useAppStore()

  const handleActivity = useCallback(() => {
    updateLastActivity()
    if (lockState.isLocked) {
      setLocked(false)
    }
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
