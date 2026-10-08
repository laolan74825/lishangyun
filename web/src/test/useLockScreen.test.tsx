import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLockScreen } from '../hooks/useLockScreen'
import { useAppStore } from '../store/appStore'

/**
 * 锁屏 hook 回归测试：
 * 曾出现"锁屏后任意点击/按键即自动解锁"的 bug（活动事件处理器里直接 setLocked(false)），
 * 锁形同虚设。此处固定期望行为：已锁屏时活动不解除锁定。
 */
describe('useLockScreen', () => {
  beforeEach(() => {
    vi.useRealTimers()
    useAppStore.setState({
      lockState: { isLocked: false, lockTimeout: 30, lastActivity: 0 },
    })
  })

  it('未锁屏时活动会更新最后活跃时间', () => {
    const { result } = renderHook(() => useLockScreen())
    const before = Date.now()
    act(() => {
      document.dispatchEvent(new Event('mousedown'))
    })
    expect(useAppStore.getState().lockState.lastActivity).toBeGreaterThanOrEqual(before)
    expect(result.current.isLocked).toBe(false)
  })

  it.each(['mousedown', 'keydown', 'touchstart', 'scroll'])(
    '已锁屏时 %s 活动不会自动解锁',
    (eventName) => {
      useAppStore.setState({
        lockState: { isLocked: true, lockTimeout: 30, lastActivity: Date.now() },
      })
      const { result } = renderHook(() => useLockScreen())
      act(() => {
        document.dispatchEvent(new Event(eventName))
      })
      expect(result.current.isLocked).toBe(true)
    },
  )

  it('超过锁定时长无活动后自动锁定', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T12:00:00'))
    useAppStore.setState({
      lockState: { isLocked: false, lockTimeout: 1, lastActivity: Date.now() },
    })
    const { result } = renderHook(() => useLockScreen())
    // 前进 1 分钟（超过 1 分钟锁定时长），等 interval 跑一轮
    vi.setSystemTime(new Date('2026-10-08T12:01:30'))
    act(() => {
      vi.advanceTimersByTime(15000)
    })
    expect(result.current.isLocked).toBe(true)
    vi.useRealTimers()
  })
})
