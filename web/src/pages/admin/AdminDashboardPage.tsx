import { Link } from '@tanstack/react-router'
import PageScaffold from '../../components/PageScaffold'
import { useAdminUsers, useAdminAuditLogs } from '../../hooks/useQueries'
import { actionLabels, tableLabels } from '../../lib/admin-labels'

export default function AdminDashboardPage() {
  const { data: usersData, isLoading: usersLoading } = useAdminUsers(1, 1)
  const { data: logsData, isLoading: logsLoading } = useAdminAuditLogs(1, 10)

  const totalUsers = usersData?.pagination?.total_count ?? 0
  const logs = logsData?.items ?? []
  const loading = usersLoading || logsLoading

  return (
    <PageScaffold title="仪表盘" description="系统概览与最近活动">
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-card bg-card p-5 shadow-card">
            <div className="text-sm text-ink-secondary">总用户数</div>
            <div className="mt-1 text-2xl font-bold text-ink">
              {loading ? '…' : totalUsers}
            </div>
          </div>
        </div>

        <div className="rounded-card bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-section-title">最近操作</h2>
            <Link
              to="/admin/audit"
              className="text-sm text-primary hover:underline"
            >
              查看全部
            </Link>
          </div>
          {logsLoading ? (
            <p className="mt-3 text-sm text-ink-secondary">加载中…</p>
          ) : logs.length === 0 ? (
            <p className="mt-3 text-sm text-ink-secondary">暂无操作记录</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center justify-between rounded-btn bg-bg px-4 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {actionLabels[log.action_type] ?? log.action_type}
                    </span>
                    <span className="text-ink-secondary">
                      {tableLabels[log.target_table] ?? log.target_table}
                    </span>
                    <span className="text-ink-secondary">#{log.target_id}</span>
                  </div>
                  <span className="text-xs text-ink-secondary">
                    {new Date(log.created_at).toLocaleString('zh-CN')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-card bg-card p-5 shadow-card">
          <h2 className="text-section-title">快捷入口</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link
              to="/admin/users"
              className="flex flex-col items-center gap-2 rounded-btn bg-bg p-4 text-center hover:bg-primary/5"
            >
              <span className="text-2xl">👥</span>
              <span className="text-sm text-ink">用户管理</span>
            </Link>
            <Link
              to="/admin/audit"
              className="flex flex-col items-center gap-2 rounded-btn bg-bg p-4 text-center hover:bg-primary/5"
            >
              <span className="text-2xl">📋</span>
              <span className="text-sm text-ink">审计日志</span>
            </Link>
            <Link
              to="/admin/settings"
              className="flex flex-col items-center gap-2 rounded-btn bg-bg p-4 text-center hover:bg-primary/5"
            >
              <span className="text-2xl">⚙️</span>
              <span className="text-sm text-ink">系统配置</span>
            </Link>
            <Link
              to="/admin/announcements"
              className="flex flex-col items-center gap-2 rounded-btn bg-bg p-4 text-center hover:bg-primary/5"
            >
              <span className="text-2xl">📢</span>
              <span className="text-sm text-ink">公告管理</span>
            </Link>
          </div>
        </div>
      </div>
    </PageScaffold>
  )
}
