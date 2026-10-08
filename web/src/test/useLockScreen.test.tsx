import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLockScreen } from '../hooks/useLockScreen'
import { useAppStore } from '../store/appStore'

/**
 * 锁屏 hook 回归测试。
 * 历史 bug：
 * 1. 锁屏后任意点击即自动解锁（活动处理器里直接 setLocked(false)）；
 * 2. 离开很久回来不锁屏——定时器在电脑睡眠时停摆，唤醒后用户第一次点击
 *    先刷新了"最后活跃时间"，倒计时重置，锁永远触发不了。
 * 此处固定期望行为：已超时后的活动先执行锁屏、不刷新活跃时间；
 * 熄屏唤醒（visibilitychange/focus）时立即判定；活跃时间持久化。
 */
describe('useLockScreen', () => {
  beforeEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    useAppStore.setState({
      lockState: { isLocked: false, lockTimeout: 30, lastActivity: Date.now() },
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

  it('最后活跃时间持久化到 localStorage（浏览器重开后按真实离开时长判定）', () => {
    renderHook(() => useLockScreen())
    act(() => {
      document.dispatchEvent(new Event('keydown'))
    })
    const saved = Number(localStorage.getItem('gr_last_activity'))
    expect(saved).toBeGreaterThan(0)
    expect(useAppStore.getState().lockState.lastActivity).toBe(saved)
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

  it('已超时后的第一次活动先锁屏、不刷新活跃时间', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T12:00:00'))
    // 最后活跃时间在 30 分钟锁定时长之前
    const stale = Date.now() - 31 * 60 * 1000
    useAppStore.setState({
      lockState: { isLocked: false, lockTimeout: 30, lastActivity: stale },
    })
    const { result } = renderHook(() => useLockScreen())
    act(() => {
      document.dispatchEvent(new Event('mousedown'))
    })
    expect(result.current.isLocked).toBe(true)
    // 活跃时间不得被这次点击刷新（否则倒计时重新开始，永不锁定）
    expect(useAppStore.getState().lockState.lastActivity).toBe(stale)
    vi.useRealTimers()
  })

  it('熄屏唤醒（visibilitychange）时立即判定锁定，不等定时器', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T12:00:00'))
    const stale = Date.now() - 60 * 60 * 1000
    useAppStore.setState({
      lockState: { isLocked: false, lockTimeout: 30, lastActivity: stale },
    })
    const { result } = renderHook(() => useLockScreen())
    // 不推进任何定时器，直接模拟唤醒事件
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current.isLocked).toBe(true)
    vi.useRealTimers()
  })

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
