import { useEffect } from 'react'
import { useGuestbook } from '../hooks/useQueries'
import { cacheGuestbook, getCachedGuestbook, type CachedGuestbook } from '../lib/dexie'

/**
 * 离线感知的礼簿查询 hook。
 * 在线时从 API 获取并缓存至 IndexedDB；离线时回退到本地缓存。
 */
export function useCachedGuestbook(guestbookId: number) {
  const { data: apiGuestbook, isLoading, isError } = useGuestbook(guestbookId)

  useEffect(() => {
    if (apiGuestbook?.id) {
      cacheGuestbook(apiGuestbook).catch(() => {})
    }
  }, [apiGuestbook])

  return {
    data: apiGuestbook,
    isLoading,
    isError,
    getCached: () => getCachedGuestbook(guestbookId),
  }
}

export type { CachedGuestbook }
