import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  showGlobalToast,
  dismissToast,
  clearStickyToast,
  subscribeToasts,
  __resetToastsForTest,
  type GlobalToastItem,
} from '../lib/toast-bus'
import { ApiError } from '../lib/api'
import {
  describeError,
  isOutageError,
  NETWORK_ERROR_TOAST_KEY,
  queryClient,
} from '../lib/queryClient'

describe('toast-bus', () => {
  beforeEach(() => {
    __resetToastsForTest()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function collect(): GlobalToastItem[] {
    const seen: GlobalToastItem[][] = []
    subscribeToasts((items) => seen.push(items))
    return seen[seen.length - 1]
  }

  it('普通提示会推送给订阅者', () => {
    showGlobalToast('请求失败')
    const items = collect()
    expect(items).toHaveLength(1)
    expect(items[0].message).toBe('请求失败')
    expect(items[0].kind).toBe('error')
  })

  it('相同内容 4 秒内只弹出一次（防轰炸）', () => {
    showGlobalToast('请求失败')
    showGlobalToast('请求失败')
    showGlobalToast('请求失败')
    expect(collect()).toHaveLength(1)
  })

  it('超过节流窗口后再次弹出', () => {
    showGlobalToast('请求失败')
    // 4500ms：越过 4000ms 节流窗口，但第一条的 5 秒自动消失尚未触发
    vi.advanceTimersByTime(4500)
    showGlobalToast('请求失败')
    expect(collect()).toHaveLength(2)
  })

  it('普通提示 5 秒后自动消失', () => {
    showGlobalToast('请求失败')
    expect(collect()).toHaveLength(1)
    vi.advanceTimersByTime(5000)
    expect(collect()).toHaveLength(0)
  })

  it('粘性提示按 key 去重替换，不自动消失', () => {
    showGlobalToast('无法连接到服务器 A', { sticky: true, key: 'net' })
    showGlobalToast('无法连接到服务器 B', { sticky: true, key: 'net' })
    const items = collect()
    expect(items).toHaveLength(1)
    expect(items[0].message).toBe('无法连接到服务器 B')
    vi.advanceTimersByTime(60000)
    expect(collect()).toHaveLength(1)
  })

  it('clearStickyToast 按 key 撤下粘性提示', () => {
    showGlobalToast('无法连接到服务器', { sticky: true, key: 'net' })
    clearStickyToast('net')
    expect(collect()).toHaveLength(0)
  })

  it('dismissToast 关闭指定提示', () => {
    showGlobalToast('第一条')
    showGlobalToast('第二条')
    const items = collect()
    dismissToast(items[0].id)
    expect(collect()).toHaveLength(1)
    expect(collect()[0].message).toBe('第二条')
  })

  it('退订后不再收到推送', () => {
    let count = 0
    const unsub = subscribeToasts(() => count++)
    unsub()
    showGlobalToast('请求失败')
    expect(count).toBe(1) // 只有订阅时的一次快照
  })
})

describe('queryClient 全局错误处理', () => {
  beforeEach(() => {
    __resetToastsForTest()
    queryClient.clear()
  })

  it('isOutageError 识别 status=0 与 503 的 ApiError', () => {
    expect(isOutageError(new ApiError(0, '无法连接'))).toBe(true)
    expect(isOutageError(new ApiError(503, '数据库连接失败'))).toBe(true)
    expect(isOutageError(new ApiError(500, '服务器错误'))).toBe(false)
    expect(isOutageError(new Error('其他错误'))).toBe(false)
  })

  it('describeError 输出用户可读的描述', () => {
    expect(describeError(new ApiError(0, '无法连接'))).toBe('无法连接')
    expect(describeError(new ApiError(503, '数据库连接失败，请确认数据库服务已启动后重试'))).toBe('数据库连接失败，请确认数据库服务已启动后重试')
    expect(describeError(new ApiError(400, '参数错误'))).toBe('请求失败（400）：参数错误')
    expect(describeError(new Error('未知'))).toBe('未知')
    expect(describeError('xx')).toBe('发生未知错误，请稍后重试')
  })

  it('查询失败触发粘性网络提示，成功后撤下', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = queryClient.getQueryCache().build(queryClient, {
      queryKey: ['network-fail-test'],
      queryFn: () => Promise.reject(new ApiError(0, '无法连接到服务器，请确认后端服务和数据库已启动')),
      retry: false,
    })
    await result.fetch().catch(() => {})
    let items: GlobalToastItem[] = []
    subscribeToasts((i) => (items = i))
    expect(items.some((i) => i.key === NETWORK_ERROR_TOAST_KEY && i.sticky)).toBe(true)

    // 模拟服务恢复：一个新的查询成功完成，粘性提示应被撤下
    await queryClient.getQueryCache().build(queryClient, {
      queryKey: ['recover-test'],
      queryFn: () => Promise.resolve('ok'),
      retry: false,
    }).fetch()
    expect(items.some((i) => i.key === NETWORK_ERROR_TOAST_KEY)).toBe(false)
    consoleSpy.mockRestore()
  })
})
