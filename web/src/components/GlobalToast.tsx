import { useEffect, useState } from 'react'
import { subscribeToasts, dismissToast, type GlobalToastItem } from '../lib/toast-bus'

/**
 * 全局 Toast 容器 —— 渲染来自 toast-bus 的提示，
 * 包括 queryClient 全局错误钩子推送的网络/业务错误。
 * 错误用 danger 红色底，普通信息用 ink 深色底。
 */
export default function GlobalToast() {
  const [items, setItems] = useState<GlobalToastItem[]>([])

  useEffect(() => subscribeToasts(setItems), [])

  if (items.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center rounded-btn px-6 py-3 text-sm font-medium text-white shadow-lg ${
            t.kind === 'error' ? 'bg-danger' : 'bg-ink'
          }`}
          role={t.kind === 'error' ? 'alert' : 'status'}
        >
          {t.message}
          <button
            onClick={() => dismissToast(t.id)}
            className="ml-3 text-white/60 transition-colors hover:text-white"
            aria-label="关闭提示"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
