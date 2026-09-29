import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '../test/utils'
import userEvent from '@testing-library/user-event'
import Toast, { useToast } from '../components/Toast'
import { renderHook } from '@testing-library/react'

describe('Toast component', () => {
  it('renders nothing when message is null', () => {
    const { container } = render(<Toast message={null} onClose={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders message text', () => {
    render(<Toast message="操作成功" onClose={() => {}} />)
    expect(screen.getByText('操作成功')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Toast message="测试" onClose={onClose} />)
    await user.click(screen.getByText('✕'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('useToast hook', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with null toast', () => {
    const { result } = renderHook(() => useToast())
    expect(result.current.toast).toBeNull()
  })

  it('sets toast message', () => {
    const { result } = renderHook(() => useToast())
    act(() => result.current.showToast('hello'))
    expect(result.current.toast).toBe('hello')
  })

  it('auto-dismisses after default 2500ms', () => {
    const { result } = renderHook(() => useToast())
    act(() => result.current.showToast('hello'))
    expect(result.current.toast).toBe('hello')

    act(() => { vi.advanceTimersByTime(2500) })
    expect(result.current.toast).toBeNull()
  })

  it('auto-dismisses after custom duration', () => {
    const { result } = renderHook(() => useToast(1000))
    act(() => result.current.showToast('hello'))

    act(() => { vi.advanceTimersByTime(999) })
    expect(result.current.toast).toBe('hello')

    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.toast).toBeNull()
  })

  it('clears toast immediately when set to null', () => {
    const { result } = renderHook(() => useToast())
    act(() => result.current.showToast('hello'))
    act(() => result.current.showToast(null))
    expect(result.current.toast).toBeNull()
  })
})
