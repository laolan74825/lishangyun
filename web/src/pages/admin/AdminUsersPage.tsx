import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import PageScaffold from '../../components/PageScaffold'
import Toast, { useToast } from '../../components/Toast'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useAdminUsers } from '../../hooks/useQueries'
import { queryKeys } from '../../hooks/queryKeys'
import * as api from '../../lib/api-client'
import { getCurrentUser } from '../../lib/auth'
import type { AdminUser, AdminUserCreate } from '../../types'

const roleLabels: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '系统管理员',
  user: '一般用户',
}

interface CreateFormState {
  username: string
  password: string
  role: string
  email: string
  nickname: string
}

const initialFormState: CreateFormState = {
  username: '',
  password: '',
  role: 'user',
  email: '',
  nickname: '',
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient()
  const { toast, showToast } = useToast()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAdminUsers(page, 20)
  const users = data?.items ?? []
  const pagination = data?.pagination

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CreateFormState>(initialFormState)
  const [togglingUser, setTogglingUser] = useState<AdminUser | null>(null)
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null)

  const invalidateUsers = () => {
    queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.all, 'users'] })
  }

  const createMutation = useMutation({
    mutationFn: (data: AdminUserCreate) => api.createAdminUser(data),
    onSuccess: () => {
      showToast('用户已创建')
      setShowCreate(false)
      setForm(initialFormState)
      invalidateUsers()
    },
    onError: (err: Error) => {
      showToast(err.message || '创建失败')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.updateAdminUser(id, { is_active: isActive }),
    onSuccess: (_, { isActive }) => {
      showToast(isActive ? '已启用' : '已禁用')
      invalidateUsers()
    },
    onError: (err: Error) => {
      showToast(err.message || '操作失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteAdminUser(id),
    onSuccess: () => {
      showToast('用户已删除')
      invalidateUsers()
    },
    onError: (err: Error) => {
      showToast(err.message || '删除失败')
    },
  })

  // 超级管理员授权/收回系统管理员
  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      api.updateAdminUser(id, { role }),
    onSuccess: (_, { role }) => {
      showToast(role === 'admin' ? '已授权为系统管理员' : '已降为一般用户')
      invalidateUsers()
    },
    onError: (err: Error) => {
      showToast(err.message || '操作失败')
    },
  })

  function handleCreate() {
    if (!form.username.trim()) { showToast('请填写用户名'); return }
    if (!form.password || form.password.length < 6) { showToast('密码至少 6 位'); return }
    createMutation.mutate({
      username: form.username.trim(),
      password: form.password,
      role: form.role,
      nickname: form.nickname.trim() || undefined,
      email: form.email.trim() || undefined,
    })
  }

  function handleToggleActive() {
    if (!togglingUser) return
    toggleMutation.mutate({ id: togglingUser.id, isActive: !togglingUser.is_active })
    setTogglingUser(null)
  }

  function handleDelete() {
    if (!deletingUser) return
    deleteMutation.mutate(deletingUser.id)
    setDeletingUser(null)
  }

  function updateForm(field: keyof CreateFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <PageScaffold title="用户管理" description="管理系统用户账户">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-secondary">
            {pagination ? `共 ${pagination.total_count} 个用户` : ''}
          </p>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            ＋ 新建用户
          </button>
        </div>

        {showCreate && (
          <div className="rounded-card bg-card p-5 shadow-card">
            <h3 className="mb-4 text-sm font-semibold text-ink">新建用户</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">用户名 <span className="text-danger">*</span></span>
                <input
                  value={form.username}
                  onChange={(e) => updateForm('username', e.target.value)}
                  placeholder="登录用户名"
                  className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">密码 <span className="text-danger">*</span></span>
                <input
                  value={form.password}
                  onChange={(e) => updateForm('password', e.target.value)}
                  type="password"
                  placeholder="至少 6 位"
                  className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">昵称</span>
                <input
                  value={form.nickname}
                  onChange={(e) => updateForm('nickname', e.target.value)}
                  placeholder="可选"
                  className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">邮箱</span>
                <input
                  value={form.email}
                  onChange={(e) => updateForm('email', e.target.value)}
                  type="email"
                  placeholder="用于密码重置"
                  className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">角色</span>
                <select
                  value={form.role}
                  onChange={(e) => updateForm('role', e.target.value)}
                  className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
                >
                  <option value="user">一般用户</option>
                  {/* 只有超级管理员可以直接创建系统管理员 */}
                  {getCurrentUser()?.role === 'super_admin' && (
                    <option value="admin">系统管理员</option>
                  )}
                </select>
                {getCurrentUser()?.role !== 'super_admin' && (
                  <span className="text-xs text-ink-secondary">创建系统管理员需要超级管理员权限</span>
                )}
              </label>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-btn border border-line px-6 py-2 text-sm text-ink-secondary"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="rounded-btn bg-primary px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {createMutation.isPending ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        )}

        <div className="rounded-card bg-card shadow-card">
          {isLoading ? (
            <p className="p-5 text-sm text-ink-secondary">加载中…</p>
          ) : users.length === 0 ? (
            <p className="p-5 text-sm text-ink-secondary">暂无用户</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-ink-secondary">
                    <th className="px-5 py-3 font-medium">用户名</th>
                    <th className="px-5 py-3 font-medium">角色</th>
                    <th className="px-5 py-3 font-medium">邮箱</th>
                    <th className="px-5 py-3 font-medium">状态</th>
                    <th className="px-5 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-3">
                        <div className="font-medium text-ink">{u.username}</div>
                        {u.nickname && (
                          <div className="text-xs text-ink-secondary">{u.nickname}</div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                          u.role === 'super_admin' || u.role === 'admin'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-bg text-ink-secondary'
                        }`}>
                          {roleLabels[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-ink-secondary">{u.email || '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs ${u.is_active ? 'text-success' : 'text-danger'}`}>
                          {u.is_active ? '活跃' : '已禁用'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2">
                          {/* 仅超级管理员可授权/收回系统管理员，且不能操作超级管理员 */}
                          {getCurrentUser()?.role === 'super_admin' && u.role !== 'super_admin' && (
                            <button
                              onClick={() =>
                                roleMutation.mutate({
                                  id: u.id,
                                  role: u.role === 'admin' ? 'user' : 'admin',
                                })
                              }
                              disabled={roleMutation.isPending}
                              className="rounded-md border border-line px-2 py-1 text-xs text-ink-secondary hover:border-primary disabled:opacity-50"
                            >
                              {u.role === 'admin' ? '降为一般用户' : '设为系统管理员'}
                            </button>
                          )}
                          <button
                            onClick={() => setTogglingUser(u)}
                            className="rounded-md border border-line px-2 py-1 text-xs text-ink-secondary hover:border-primary"
                          >
                            {u.is_active ? '禁用' : '启用'}
                          </button>
                          {u.role !== 'super_admin' && (
                            <button
                              onClick={() => setDeletingUser(u)}
                              className="rounded-md border border-danger/30 px-2 py-1 text-xs text-danger hover:border-danger"
                            >
                              删除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <span className="text-xs text-ink-secondary">
                第 {pagination.page} / {pagination.total_pages} 页
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-line px-3 py-1 text-xs disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                  disabled={page >= pagination.total_pages}
                  className="rounded-md border border-line px-3 py-1 text-xs disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={togglingUser !== null}
        title={togglingUser?.is_active ? '禁用用户' : '启用用户'}
        message={togglingUser ? `确定${togglingUser.is_active ? '禁用' : '启用'}用户「${togglingUser.username}」吗？` : ''}
        confirmLabel="确认"
        onConfirm={handleToggleActive}
        onCancel={() => setTogglingUser(null)}
      />

      <ConfirmDialog
        open={deletingUser !== null}
        title="删除用户"
        message={deletingUser ? `确定删除用户「${deletingUser.username}」吗？此操作将软删除该用户。` : ''}
        variant="danger"
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeletingUser(null)}
      />

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
