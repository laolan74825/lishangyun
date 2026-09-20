import { useState, useCallback, useEffect } from 'react'

/**
 * 共享 Toast hook — 替代各页面重复实现的 toast 逻辑
 * 用法：
 *   const { toast, showToast } = useToast()
 *   // render
 *   {toast && <Toast message={toast} onClose={() => showToast(null)} />}
 */
export function useToast(autoDismissMs = 2500) {
  const [toast, setToast] = useState<string | null>(null)

  const showToast = useCallback((msg: string | null) => {
    setToast(msg)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), autoDismissMs)
    return () => clearTimeout(t)
  }, [toast, autoDismissMs])

  return { toast, showToast }
}

/** Toast 展示组件 */
export default function Toast({
  message,
  onClose
}: {
  message: string | null
  onClose: () => void
}) {
  if (!message) return null
  return (
    <div className="fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
      <div className="rounded-btn bg-ink px-6 py-3 text-sm font-medium text-white shadow-lg">
        {message}
        <button onClick={onClose} className="ml-3 text-white/60 hover:text-white">
          ✕
        </button>
      </div>
    </div>
  )
}
