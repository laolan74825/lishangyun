/**
 * 全局 Toast 事件总线
 *
 * 用途：queryClient / api 等非 React 模块发生错误时，也能把提示推送到界面。
 * 与组件内 useToast 的区别：这里维护全局单例列表，由 <GlobalToast /> 统一渲染。
 *
 * - 普通提示：相同内容 4 秒内只弹出一次，5 秒后自动消失
 * - 粘性提示（sticky）：用于「服务器连不上」这类需要持续可见的状态条，
 *   以 key 去重，同 key 的旧提示会被替换，直到调用方主动清除
 */

export type ToastKind = 'error' | 'info'

export interface GlobalToastItem {
  id: number
  message: string
  kind: ToastKind
  sticky: boolean
  key: string
}

export interface ShowToastOptions {
  kind?: ToastKind
  sticky?: boolean
  /** 去重键，默认用 message 本身 */
  key?: string
}

type Listener = (items: GlobalToastItem[]) => void

let items: GlobalToastItem[] = []
let seq = 0
const listeners = new Set<Listener>()

function emit() {
  const snapshot = [...items]
  for (const l of listeners) l(snapshot)
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  listener([...items])
  return () => {
    listeners.delete(listener)
  }
}

const THROTTLE_MS = 4000
const AUTO_DISMISS_MS = 5000
const lastShownAt = new Map<string, number>()

export function showGlobalToast(message: string, options?: ShowToastOptions): void {
  const key = options?.key ?? message
  const sticky = options?.sticky ?? false

  if (!sticky) {
    const now = Date.now()
    const last = lastShownAt.get(key) ?? 0
    if (now - last < THROTTLE_MS) return
    lastShownAt.set(key, now)
  }

  // 粘性提示按 key 去重替换，避免堆叠
  items = sticky ? items.filter((i) => i.key !== key) : items

  seq += 1
  const item: GlobalToastItem = {
    id: seq,
    message,
    kind: options?.kind ?? 'error',
    sticky,
    key,
  }
  items = [...items, item]
  emit()

  if (!sticky) {
    setTimeout(() => dismissToast(item.id), AUTO_DISMISS_MS)
  }
}

export function dismissToast(id: number): void {
  if (!items.some((i) => i.id === id)) return
  items = items.filter((i) => i.id !== id)
  emit()
}

export function clearStickyToast(key: string): void {
  if (!items.some((i) => i.key === key)) return
  items = items.filter((i) => i.key !== key)
  emit()
}

/** 测试辅助：重置内部状态 */
export function __resetToastsForTest(): void {
  items = []
  lastShownAt.clear()
}
