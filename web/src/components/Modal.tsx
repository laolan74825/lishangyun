import type { ReactNode } from 'react'

/**
 * 共享弹窗组件 — 统一遮罩层、容器、关闭逻辑
 * 规范来源：ui-design-spec 4.4 弹窗
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  actions,
  maxWidth = 'sm'
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  actions?: ReactNode
  maxWidth?: 'sm' | 'md' | 'lg'
}) {
  if (!open) return null

  const widthClass = {
    sm: 'max-w-[24rem]',
    md: 'max-w-[28rem]',
    lg: 'max-w-[32rem]'
  }[maxWidth]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`w-full ${widthClass} rounded-card bg-card p-6 shadow-xl`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-btn p-1 text-ink-secondary hover:bg-bg hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {actions && <div className="mt-5 flex gap-3">{actions}</div>}
      </div>
    </div>
  )
}
