import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'
import { clearStickyToast, showGlobalToast } from './toast-bus'

/**
 * 「服务器不可达」粘性提示的 key。
 * 出现网络错误时置顶常驻显示，任何一次请求成功后立即撤下。
 */
export const NETWORK_ERROR_TOAST_KEY = 'network-error'

/**
 * 「服务不可用」判定：网络层失败（status 0，服务器完全不可达）或
 * 后端明确返回 503（数据库连接失败等服务端故障），都按常驻提示处理。
 */
export function isOutageError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 0 || err.status === 503)
}

/** 把任意异常转成一句用户看得懂的话 */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    // 这两类的 detail 本身已是面向用户的完整句子
    if (err.status === 0 || err.status === 503) return err.detail
    return `请求失败（${err.status}）：${err.detail}`
  }
  if (err instanceof Error && err.message) return err.message
  return '发生未知错误，请稍后重试'
}

interface QueryMeta {
  silent?: boolean
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (isOutageError(error)) {
        showGlobalToast((error as ApiError).detail, {
          sticky: true,
          key: NETWORK_ERROR_TOAST_KEY,
        })
        return
      }
      // 个别查询可选择静默（在自己的 useQuery 里设 meta: { silent: true }）
      const meta = query.meta as QueryMeta | undefined
      if (meta?.silent === true) return
      showGlobalToast(describeError(error))
    },
    onSuccess: () => {
      // 任何一个查询成功，说明服务已恢复，撤掉网络故障提示
      clearStickyToast(NETWORK_ERROR_TOAST_KEY)
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isOutageError(error)) {
        showGlobalToast((error as ApiError).detail, {
          sticky: true,
          key: NETWORK_ERROR_TOAST_KEY,
        })
        return
      }
      showGlobalToast(describeError(error))
    },
    onSuccess: () => {
      clearStickyToast(NETWORK_ERROR_TOAST_KEY)
    },
  }),
})
