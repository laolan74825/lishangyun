import { useEffect, useCallback } from 'react'
import type { RefObject } from 'react'

interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  handler: () => void
  description?: string
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  enabled: boolean = true,
  containerRef?: RefObject<HTMLElement>
) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        if (!event.ctrlKey && !event.altKey && !event.metaKey) {
          return
        }
      }

      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey
        const altMatch = shortcut.alt ? event.altKey : !event.altKey

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          event.preventDefault()
          shortcut.handler()
          return
        }
      }
    },
    [shortcuts, enabled]
  )

  useEffect(() => {
    const container = containerRef?.current ?? document
    container.addEventListener('keydown', handleKeyDown as EventListener)
    return () => {
      container.removeEventListener('keydown', handleKeyDown as EventListener)
    }
  }, [handleKeyDown, containerRef])
}

export const COLLECT_SHORTCUTS = {
  SUBMIT: { key: 'Enter', description: '提交记录' },
  TAB_NEXT: { key: 'Tab', description: '切换字段' },
  PAYMENT_CASH: { key: '1', description: '现金支付' },
  PAYMENT_WECHAT: { key: '2', description: '微信支付' },
  PAYMENT_OTHER: { key: '3', description: '其他支付' },
  NEW_RECORD: { key: 'n', ctrl: true, description: '新建记录' },
  SEARCH: { key: 'f', ctrl: true, description: '搜索' },
  CLOSE: { key: 'Escape', description: '关闭/返回' },
}

export const RECONCILE_SHORTCUTS = {
  TOGGLE_CHECK: { key: ' ', description: '勾选/取消' },
  SELECT_ALL: { key: 'a', ctrl: true, description: '全选' },
}
