import type { ReactNode } from 'react'
import Modal from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  loading?: boolean
  extraContent?: ReactNode
  showCancel?: boolean
  onConfirm: (e?: React.FormEvent) => void
  onCancel: () => void
}

const variantStyles = {
  danger: {
    button: 'bg-danger text-white hover:bg-danger/90',
    icon: '🗑️',
  },
  warning: {
    button: 'bg-warning text-white hover:bg-warning/90',
    icon: '⚠️',
  },
  info: {
    button: 'bg-primary text-white hover:bg-primary/90',
    icon: 'ℹ️',
  },
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'danger',
  loading = false,
  extraContent,
  showCancel = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const styles = variantStyles[variant]

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      actions={
        <>
          {showCancel && (
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-btn border border-line py-2.5 font-medium text-ink-secondary disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={() => onConfirm()}
            disabled={loading}
            className={`flex-1 rounded-btn py-2.5 font-medium text-white disabled:opacity-50 ${styles.button}`}
          >
            {loading ? '处理中…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{styles.icon}</span>
        <p className="flex-1 text-sm leading-relaxed text-ink-secondary">{message}</p>
      </div>
      {extraContent && <div className="mt-4">{extraContent}</div>}
    </Modal>
  )
}
