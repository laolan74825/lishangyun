interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="mb-4 text-5xl">{icon}</span>
      <h3 className="mb-2 text-lg font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mb-6 max-w-sm text-sm text-ink-secondary">{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-btn bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-deep"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
