import { useEffect, useRef, useCallback } from 'react'
import { getToken } from '../lib/auth'
import { useAppStore } from '../store/appStore'
import type { GbRecord } from '../types'

interface WebSocketMessage {
  type: 'new_record' | 'update_record' | 'delete_record' | 'sync_complete' | 'error'
  data?: GbRecord | Record<string, unknown>
  message?: string
}

export function useGuestbookWebSocket(guestbookId: number | undefined) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const isMountedRef = useRef(true)
  const prependGbRecord = useAppStore((s) => s.prependGbRecord)
  const setSyncStatus = useAppStore((s) => s.setSyncStatus)

  const connect = useCallback(() => {
    if (!guestbookId) return

    const token = getToken()
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/ws/guestbooks/${guestbookId}?token=${token}`
    )

    ws.onopen = () => {
      if (!isMountedRef.current) {
        ws.close()
        return
      }
      setSyncStatus('synced')
    }

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return
      try {
        const msg: WebSocketMessage = JSON.parse(event.data)
        switch (msg.type) {
          case 'new_record':
            if (msg.data) {
              prependGbRecord(msg.data as GbRecord)
            }
            break
          case 'sync_complete':
            setSyncStatus('synced')
            break
          case 'error':
            console.error('[WS] Server error:', msg.message)
            break
        }
      } catch (err) {
        console.error('[WS] Failed to parse message:', err)
      }
    }

    ws.onclose = (event) => {
      if (!isMountedRef.current) return
      setSyncStatus('offline')
      // 4001=认证失败 4003=无权访问：重连无意义，不再重试
      if (event.code === 4001 || event.code === 4003) return
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          connect()
        }
      }, 3000)
    }

    ws.onerror = () => {}

    wsRef.current = ws
  }, [guestbookId, prependGbRecord, setSyncStatus])

  useEffect(() => {
    isMountedRef.current = true
    connect()

    return () => {
      isMountedRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      const ws = wsRef.current
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onclose = null
        ws.onerror = null
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.addEventListener('open', () => ws.close())
        } else {
          ws.close()
        }
        wsRef.current = null
      }
    }
  }, [connect])

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { send }
}
