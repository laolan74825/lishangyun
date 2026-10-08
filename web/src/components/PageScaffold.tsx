import type { ReactNode } from 'react'

/**
 * 页面骨架：统一的页面标题区 + 卡片容器
 * 后续实现各页面时替换 children 中的占位内容即可
 */
export default function PageScaffold({
  title,
  description,
  actions,
  children
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* 窄屏（手机）时标题与操作按钮上下布局，避免按钮组横向顶出屏幕 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-page-title">{title}</h1>
          {description && <p className="mt-1 text-caption text-ink-secondary">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

/** 占位卡片：标注需求文档中的功能编号，便于按里程碑逐步实现 */
export function PlaceholderCard({ module, features }: { module: string; features: string[] }) {
  return (
    <div className="rounded-card bg-card p-6 shadow-card">
      <h2 className="text-section-title">{module}</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-caption text-ink-secondary">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  )
}
