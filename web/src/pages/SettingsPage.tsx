import { useState, useEffect } from 'react'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import { getClientId } from '../lib/client'
import { useAppStore } from '../store/appStore'
import { getCurrentUser } from '../lib/auth'
import { api } from '../lib/api'

interface SmtpSettings {
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_password: string
}

interface AppUser {
  id: number
  username: string
  role: string
  email?: string
  is_active: boolean
}

const OPERATOR_KEY = 'gr_operator_name'

function loadOperatorName(): string {
  return localStorage.getItem(OPERATOR_KEY) || ''
}

function saveOperatorName(name: string) {
  localStorage.setItem(OPERATOR_KEY, name)
}

export default function SettingsPage() {
  const clientId = getClientId()
  const { toast, showToast } = useToast()
  const currentUser = getCurrentUser()
  const isAdmin = currentUser?.role === 'admin'

  const setOperatorName = useAppStore((s) => s.setOperatorName)
  const [operatorName, setLocalOperator] = useState(loadOperatorName)

  useEffect(() => {
    const saved = loadOperatorName()
    if (saved) setOperatorName(saved)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleOperatorChange(value: string) {
    setLocalOperator(value)
    saveOperatorName(value)
    setOperatorName(value)
  }

  return (
    <PageScaffold title="系统设置" description="终端信息、账户安全与系统管理">
      <div className="mx-auto flex max-w-[36rem] flex-col gap-5">
        {/* 本终端信息 */}
        <section className="rounded-card bg-card p-6 shadow-card">
          <h2 className="text-section-title">🖥️ 本终端信息</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            每台设备拥有独立终端标识，多客户端收礼时用于区分记账来源。
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">终端标识</span>
              <input
                value={clientId}
                readOnly
                className="h-11 rounded-btn border border-line bg-bg px-4 text-sm font-mono text-ink-secondary outline-none"
              />
              <span className="text-xs text-ink-secondary">自动分配，不可修改</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">记账员姓名 <span className="text-danger">*</span></span>
              <input
                value={operatorName}
                onChange={(e) => handleOperatorChange(e.target.value)}
                placeholder="请输入您的姓名"
                className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
              />
              <span className="text-xs text-ink-secondary">收礼时自动记录为操作人</span>
            </label>
          </div>
        </section>

        {/* 账户安全 */}
        <section className="rounded-card bg-card p-6 shadow-card">
          <h2 className="text-section-title">🔐 账户安全</h2>
          <ChangePasswordSection showToast={showToast} />
        </section>

        {/* 管理员：SMTP 设置 */}
        {isAdmin && (
          <section className="rounded-card bg-card p-6 shadow-card">
            <h2 className="text-section-title">📧 邮件服务配置</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              配置 SMTP 邮件服务，用于密码重置验证码发送。
            </p>
            <SmtpSettingsSection showToast={showToast} />
          </section>
        )}

        {/* 管理员：用户管理 */}
        {isAdmin && (
          <section className="rounded-card bg-card p-6 shadow-card">
            <h2 className="text-section-title">👤 用户管理</h2>
            <UserManagementSection showToast={showToast} />
          </section>
        )}

        {/* 关于 */}
        <section className="rounded-card bg-card p-6 shadow-card">
          <h2 className="text-section-title">ℹ️ 关于</h2>
          <div className="mt-3 flex flex-col gap-2 text-sm text-ink-secondary">
            <p><span className="font-medium text-ink">随礼记账本</span> v1.0.0</p>
            <p>数据存储：服务端 PostgreSQL（支持多终端协作）</p>
            <p>技术栈：React + FastAPI + PostgreSQL</p>
            <p className="text-xs">当前登录：{currentUser?.username}（{currentUser?.role}）</p>
          </div>
        </section>
      </div>

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}

function ChangePasswordSection({ showToast }: { showToast: (msg: string) => void }) {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleChange() {
    if (!newPassword || newPassword.length < 6) { showToast('新密码至少 6 位'); return }
    if (newPassword !== confirmPassword) { showToast('两次密码不一致'); return }
    setLoading(true)
    try {
      await api.put('/auth/password', { old_password: oldPassword, new_password: newPassword })
      showToast('密码已修改')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '修改失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">当前密码</span>
        <input
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          type="password"
          placeholder="输入当前密码"
          className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">新密码</span>
        <input
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          type="password"
          placeholder="至少 6 位"
          className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">确认新密码</span>
        <input
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          type="password"
          placeholder="再次输入新密码"
          className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
        />
      </label>
      <button
        onClick={handleChange}
        disabled={loading}
        className="mt-1 rounded-btn bg-primary py-2.5 font-semibold text-white disabled:opacity-50"
      >
        {loading ? '提交中…' : '修改密码'}
      </button>
    </div>
  )
}

function SmtpSettingsSection({ showToast }: { showToast: (msg: string) => void }) {
  const [settings, setSettings] = useState<SmtpSettings>({
    smtp_host: '', smtp_port: '465', smtp_user: '', smtp_password: '',
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const data = await api.get<Record<string, string>>('/admin/settings')
        setSettings({
          smtp_host: data.smtp_host || '',
          smtp_port: data.smtp_port || '465',
          smtp_user: data.smtp_user || '',
          smtp_password: '',
        })
      } catch { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      await api.put('/admin/settings', settings)
      showToast('邮件服务配置已保存')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="mt-3 text-sm text-ink-secondary">加载中…</p>

  return (
    <div className="mt-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">SMTP 服务器</span>
        <input
          value={settings.smtp_host}
          onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
          placeholder="如 smtp.qq.com"
          className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">SMTP 端口</span>
        <input
          value={settings.smtp_port}
          onChange={(e) => setSettings({ ...settings, smtp_port: e.target.value })}
          placeholder="465"
          className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">发件邮箱</span>
        <input
          value={settings.smtp_user}
          onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })}
          placeholder="发件人邮箱地址"
          className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">邮箱密码/授权码</span>
        <input
          value={settings.smtp_password}
          onChange={(e) => setSettings({ ...settings, smtp_password: e.target.value })}
          type="password"
          placeholder="邮箱密码或授权码"
          className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
        />
        <span className="text-xs text-ink-secondary">密码将以 AES-256 加密存储</span>
      </label>
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-1 rounded-btn bg-primary py-2.5 font-semibold text-white disabled:opacity-50"
      >
        {saving ? '保存中…' : '保存配置'}
      </button>
    </div>
  )
}

function UserManagementSection({ showToast }: { showToast: (msg: string) => void }) {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'editor' | 'viewer'>('editor')
  const [newEmail, setNewEmail] = useState('')

  async function loadUsers() {
    setLoading(true)
    try {
      const data = await api.get<AppUser[]>('/admin/users')
      setUsers(data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { loadUsers() }, [])

  async function handleCreate() {
    if (!newUsername.trim()) { showToast('请填写用户名'); return }
    if (!newPassword || newPassword.length < 6) { showToast('密码至少 6 位'); return }
    try {
      await api.post('/admin/users', {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
        email: newEmail.trim() || undefined,
      })
      showToast('用户已创建')
      setShowCreate(false)
      setNewUsername('')
      setNewPassword('')
      setNewEmail('')
      setNewRole('editor')
      loadUsers()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '创建失败')
    }
  }

  async function handleToggleActive(user: AppUser) {
    try {
      await api.put(`/admin/users/${user.id}`, { is_active: !user.is_active })
      loadUsers()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '操作失败')
    }
  }

  async function handleDelete(user: AppUser) {
    if (!confirm(`确定删除用户「${user.username}」吗？`)) return
    try {
      await api.delete(`/admin/users/${user.id}`)
      showToast('用户已删除')
      loadUsers()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '删除失败')
    }
  }

  const roleLabels: Record<string, string> = { admin: '管理员', editor: '编辑', viewer: '只读' }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {loading ? (
        <p className="text-sm text-ink-secondary">加载中…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between rounded-lg border border-line px-4 py-2.5">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-ink">{u.username}</span>
                <span className="text-xs text-ink-secondary">
                  {roleLabels[u.role] || u.role}
                  {u.email ? ` · ${u.email}` : ''}
                  {!u.is_active && ' · 已禁用'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleToggleActive(u)}
                  className="rounded-md border border-line px-2 py-1 text-xs text-ink-secondary hover:border-primary"
                >
                  {u.is_active ? '禁用' : '启用'}
                </button>
                {u.role !== 'admin' && (
                  <button
                    onClick={() => handleDelete(u)}
                    className="rounded-md border border-danger/30 px-2 py-1 text-xs text-danger hover:border-danger"
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-btn border border-primary py-2.5 text-sm font-medium text-primary"
        >
          ＋ 新建用户
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">用户名</span>
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="登录用户名"
              className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">密码</span>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              placeholder="至少 6 位"
              className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">邮箱（可选）</span>
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              type="email"
              placeholder="用于密码重置"
              className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">角色</span>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'editor' | 'viewer')}
              className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
            >
              <option value="editor">编辑（可增删改）</option>
              <option value="viewer">只读</option>
            </select>
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setShowCreate(false)}
              className="flex-1 rounded-btn border border-line py-2.5 text-sm font-medium text-ink-secondary"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              className="flex-1 rounded-btn bg-primary py-2.5 text-sm font-semibold text-white"
            >
              创建
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
