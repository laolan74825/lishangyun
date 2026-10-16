import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAppStore } from '../store/appStore'
import { getCurrentUser, setCurrentUser, clearToken, isAdmin } from '../lib/auth'
import { syncEngine } from '../lib/sync-engine'
import { APP_VERSION } from '../lib/version'
import SyncStatusBadge from '../components/SyncStatusBadge'
import ConflictResolutionPanel from '../components/ConflictResolutionPanel'
import {
  useProfile,
  useSecurityEmails,
  useUpdateProfile,
  useAddSecurityEmail,
  useDeleteSecurityEmail,
  useDeleteAccount,
  useLockPinStatus,
  useSetLockPin,
  useClearLockPin,
} from '../hooks/useQueries'
import { sendSecurityEmailCode, changePassword } from '../lib/api-client'
import type { SecurityEmailItem } from '../types'

const OPERATOR_KEY = 'gr_operator_name'

function loadOperatorName(): string {
  return localStorage.getItem(OPERATOR_KEY) || ''
}

function saveOperatorName(name: string) {
  localStorage.setItem(OPERATOR_KEY, name)
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '系统管理员',
  user: '一般用户',
}

function roleLabel(role: string | undefined): string {
  return (role && ROLE_LABELS[role]) || '未知角色'
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { toast, showToast } = useToast()
  const currentUser = getCurrentUser()

  const setOperatorName = useAppStore((s) => s.setOperatorName)
  const [operatorName, setLocalOperator] = useState(loadOperatorName)

  const { data: profile } = useProfile()
  const { data: securityEmails = [] } = useSecurityEmails()
  const updateProfile = useUpdateProfile()
  const deleteAccount = useDeleteAccount()

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')

  const [nickname, setNickname] = useState(profile?.nickname ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [autoLockMinutes, setAutoLockMinutes] = useState(String(profile?.auto_lock_minutes ?? 30))

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname ?? '')
      setUsername(profile.username ?? '')
      setAutoLockMinutes(String(profile.auto_lock_minutes ?? 30))
    }
  }, [profile])

  async function handleSaveProfile() {
    try {
      const newUsername = username.trim()
      await updateProfile.mutateAsync({
        nickname: nickname.trim() || undefined,
        username: newUsername || undefined,
      })
      // 同步更新本地缓存的用户信息（导航栏、锁屏等处直接读它）
      const stored = getCurrentUser()
      if (stored && newUsername && newUsername !== stored.username) {
        setCurrentUser({ ...stored, username: newUsername })
      }
      showToast('资料已保存')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败')
    }
  }

  async function handleSaveLockTime() {
    const minutes = parseInt(autoLockMinutes)
    if (isNaN(minutes) || minutes < 1) {
      showToast('锁定时间无效')
      return
    }
    try {
      await updateProfile.mutateAsync({ auto_lock_minutes: minutes })
      showToast('锁定时间已保存')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败')
    }
  }

  useEffect(() => {
    const saved = loadOperatorName()
    if (saved) setOperatorName(saved)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleOperatorChange(value: string) {
    setLocalOperator(value)
    saveOperatorName(value)
    setOperatorName(value)
  }

  async function handleDeleteAccount() {
    if (!deletePassword) {
      showToast('请输入密码')
      return
    }
    try {
      await deleteAccount.mutateAsync(deletePassword)
      showToast('账户已注销')
      clearToken()
      navigate({ to: '/login' })
    } catch (err) {
      showToast(err instanceof Error ? err.message : '注销失败')
    }
  }

  return (
    <PageScaffold title="系统设置" description="个人资料、锁屏与账户安全、数据同步">
      <div className="mx-auto flex max-w-[36rem] flex-col gap-5">
        {/* 个人资料 */}
        <section className="rounded-card bg-card p-6 shadow-card">
          <h2 className="text-section-title">👤 个人资料</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            登录账户信息与本机个人设置。
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">用户 ID</span>
              <span className="text-sm font-mono text-ink-secondary">{currentUser?.id ?? '-'}</span>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">用户名</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="3~50 个字符，可用于登录"
                className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
              />
              <span className="text-xs text-ink-secondary">可使用用户名或手机号登录；注册时留空会自动生成</span>
            </label>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">角色</span>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{roleLabel(currentUser?.role)}</span>
            </div>
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
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">昵称</span>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="选填"
                className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
              />
            </label>
            <button
              onClick={handleSaveProfile}
              disabled={updateProfile.isPending}
              className="mt-1 rounded-btn bg-primary py-2.5 font-semibold text-white disabled:opacity-50"
            >
              {updateProfile.isPending ? '保存中…' : '保存资料'}
            </button>
          </div>
        </section>

        {/* 锁屏 */}
        <section className="rounded-card bg-card p-6 shadow-card">
          <h2 className="text-section-title">🔒 锁屏</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            无操作自动锁定屏幕，解锁需输入密码，保护账目隐私。
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">自动锁定时间（分钟）</span>
              <input
                type="number"
                value={autoLockMinutes}
                onChange={(e) => setAutoLockMinutes(e.target.value)}
                min="1"
                className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
              />
              <span className="text-xs text-ink-secondary">无操作超过此时间后自动锁定</span>
            </label>
            <button
              onClick={handleSaveLockTime}
              disabled={updateProfile.isPending}
              className="mt-1 rounded-btn bg-primary py-2.5 font-semibold text-white disabled:opacity-50"
            >
              {updateProfile.isPending ? '保存中…' : '保存锁定时间'}
            </button>
            <div className="my-1 border-t border-line" />
            <LockPinSection showToast={showToast} />
          </div>
        </section>

        {/* 账户安全 */}
        <section className="rounded-card bg-card p-6 shadow-card">
          <h2 className="text-section-title">🔐 账户安全</h2>
          <ChangePasswordSection showToast={showToast} />
          <div className="my-4 border-t border-line" />
          <h3 className="text-sm font-bold text-ink">📧 安全邮箱</h3>
          <p className="mt-1 text-xs text-ink-secondary">用于找回密码和接收安全通知。</p>
          <SecurityEmailSection
            emails={securityEmails}
            showToast={showToast}
          />
        </section>

        {/* 数据同步 */}
        <section className="rounded-card bg-card p-6 shadow-card">
          <h2 className="text-section-title">🔄 数据同步</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            本地数据自动同步至云端，支持多设备数据一致性。
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">同步状态</span>
              <SyncStatusBadge />
            </div>
            <button
              onClick={() => {
                syncEngine.sync()
                showToast('正在同步…')
              }}
              className="h-11 rounded-btn bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90"
            >
              立即同步
            </button>
          </div>
          <div className="mt-4">
            <ConflictResolutionPanel />
          </div>
        </section>

        {/* 更多功能 */}
        <section className="rounded-card bg-card p-6 shadow-card">
          <h2 className="text-section-title">🔗 更多功能</h2>
          <div className="mt-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => navigate({ to: '/family' })}
                className="flex items-center gap-3 rounded-lg border border-line p-4 text-left transition-colors hover:bg-bg"
              >
                <span className="text-2xl">👨‍👩‍👧‍👦</span>
                <div>
                  <p className="text-sm font-medium text-ink">家庭管理</p>
                  <p className="text-xs text-ink-secondary">创建或加入家庭组</p>
                </div>
              </button>
              <button
                onClick={() => navigate({ to: '/security' })}
                className="flex items-center gap-3 rounded-lg border border-line p-4 text-left transition-colors hover:bg-bg"
              >
                <span className="text-2xl">🛡️</span>
                <div>
                  <p className="text-sm font-medium text-ink">安全模式</p>
                  <p className="text-xs text-ink-secondary">增强数据加密保护</p>
                </div>
              </button>
            </div>
            {isAdmin() && (
              <Link
                to="/admin"
                className="flex items-center justify-between rounded-lg border border-line p-4 transition-colors hover:bg-bg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🛠️</span>
                  <div>
                    <p className="text-sm font-medium text-ink">管理后台</p>
                    <p className="text-xs text-ink-secondary">用户管理、系统配置、审计日志、公告与回收站</p>
                  </div>
                </div>
                <span className="text-xl text-primary">→</span>
              </Link>
            )}
          </div>
        </section>

        {/* 注销账户 */}
        <section className="rounded-card border border-danger/30 bg-card p-6 shadow-card">
          <h2 className="text-section-title">⚠️ 注销账户</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            注销后账户将无法恢复，所有数据将被永久删除。
          </p>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="mt-4 rounded-btn border border-danger px-4 py-2 text-sm text-danger hover:bg-danger-bg"
          >
            注销账户
          </button>
        </section>

        {/* 关于 */}
        <section className="rounded-card bg-card p-6 shadow-card">
          <h2 className="text-section-title">ℹ️ 关于</h2>
          <div className="mt-3 flex flex-col gap-2 text-sm text-ink-secondary">
            <p><span className="font-medium text-ink">礼尚云</span> · 人情往来小账本 v{APP_VERSION}</p>
            <p>数据存储：服务端 PostgreSQL（支持多终端协作）</p>
            <p>技术栈：React + FastAPI + PostgreSQL</p>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="注销账户"
        message="此操作不可撤销，确定要注销账户吗？"
        variant="danger"
        confirmLabel="注销"
        onConfirm={handleDeleteAccount}
        onCancel={() => {
          setShowDeleteConfirm(false)
          setDeletePassword('')
        }}
        loading={deleteAccount.isPending}
        extraContent={
          <input
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            placeholder="请输入密码确认"
            className="mt-3 h-11 w-full rounded-btn border border-line px-4 text-base outline-none focus:border-danger"
            autoFocus
          />
        }
      />

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}

/** 锁屏密码：4 位数字，可随时设置/修改/清除；设置与清除都需验证登录密码 */
function LockPinSection({ showToast }: { showToast: (msg: string) => void }) {
  const { data: lockPin } = useLockPinStatus()
  const setLockPin = useSetLockPin()
  const clearLockPin = useClearLockPin()

  const [mode, setMode] = useState<'idle' | 'set' | 'clear'>('idle')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [pinError, setPinError] = useState('')

  const enabled = lockPin?.enabled === true

  function resetForm() {
    setMode('idle')
    setPin('')
    setPinConfirm('')
    setPassword('')
    setPinError('')
  }

  async function handleSet() {
    if (!/^\d{4}$/.test(pin)) {
      setPinError('请输入 4 位数字密码')
      return
    }
    if (pin !== pinConfirm) {
      setPinError('两次输入不一致')
      return
    }
    if (!password) {
      setPinError('请输入登录密码确认')
      return
    }
    try {
      await setLockPin.mutateAsync({ pin, password })
      showToast('锁屏密码已设置')
      resetForm()
    } catch (err) {
      setPinError(err instanceof Error ? err.message : '设置失败')
    }
  }

  async function handleClear() {
    if (!password) {
      setPinError('请输入登录密码确认')
      return
    }
    try {
      await clearLockPin.mutateAsync(password)
      showToast('锁屏密码已清除')
      resetForm()
    } catch (err) {
      setPinError(err instanceof Error ? err.message : '清除失败')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">锁屏密码</p>
          <p className="text-xs text-ink-secondary">4 位数字，锁屏后输入它或登录密码均可解锁</p>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs ${enabled ? 'bg-primary/10 text-primary' : 'bg-black/5 text-ink-secondary'}`}>
          {enabled ? '已设置' : '未设置'}
        </span>
      </div>

      {mode === 'idle' ? (
        <div className="flex gap-2">
          <button
            onClick={() => { setMode('set'); setPinError('') }}
            className="rounded-btn bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/20"
          >
            {enabled ? '修改锁屏密码' : '设置锁屏密码'}
          </button>
          {enabled && (
            <button
              onClick={() => { setMode('clear'); setPinError('') }}
              className="rounded-btn border border-danger/40 px-4 py-2 text-sm text-danger hover:bg-danger/10"
            >
              清除
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg bg-bg p-3">
          {mode === 'set' && (
            <>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError('') }}
                placeholder="输入 4 位数字密码"
                aria-label="锁屏密码"
                autoComplete="off"
                className="h-11 rounded-btn border border-line px-4 text-base tracking-[0.5em] outline-none focus:border-primary"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinConfirm}
                onChange={(e) => { setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError('') }}
                placeholder="再次输入确认"
                aria-label="确认锁屏密码"
                autoComplete="off"
                className="h-11 rounded-btn border border-line px-4 text-base tracking-[0.5em] outline-none focus:border-primary"
              />
            </>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setPinError('') }}
            placeholder="输入登录密码确认身份"
            aria-label="登录密码"
            autoComplete="current-password"
            className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
          />
          {pinError && <p className="text-xs text-danger" role="alert">{pinError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="flex-1 rounded-btn border border-line py-2 text-sm text-ink-secondary"
            >
              取消
            </button>
            <button
              type="button"
              onClick={mode === 'set' ? handleSet : handleClear}
              disabled={setLockPin.isPending || clearLockPin.isPending}
              className={`flex-1 rounded-btn py-2 text-sm font-semibold text-white disabled:opacity-50 ${mode === 'set' ? 'bg-primary' : 'bg-danger'}`}
            >
              {setLockPin.isPending || clearLockPin.isPending
                ? '处理中…'
                : mode === 'set' ? '确认设置' : '确认清除'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ChangePasswordSection({ showToast }: { showToast: (msg: string) => void }) {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [oldPasswordError, setOldPasswordError] = useState('')

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess() {
      showToast('密码已修改')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setOldPasswordError('')
    },
    onError(err: Error) {
      const message = err.message || '修改失败'
      // 当前密码错误：在输入框下方显示红色提示，其他错误仍用 Toast
      if (message.includes('原密码') || message.includes('当前密码')) {
        setOldPasswordError(message)
      } else {
        showToast(message)
      }
    },
  })

  function handleSubmit() {
    if (!newPassword || newPassword.length < 6) { showToast('新密码至少 6 位'); return }
    if (newPassword !== confirmPassword) { showToast('两次密码不一致'); return }
    mutation.mutate({ old_password: oldPassword, new_password: newPassword })
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">当前密码</span>
        <input
          value={oldPassword}
          onChange={(e) => {
            setOldPassword(e.target.value)
            setOldPasswordError('')
          }}
          type="password"
          placeholder="输入当前密码"
          className={`h-11 rounded-btn border px-4 text-base outline-none focus:border-primary ${oldPasswordError ? 'border-danger' : 'border-line'}`}
        />
        {oldPasswordError && (
          <span className="text-xs text-danger">{oldPasswordError}</span>
        )}
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
        onClick={handleSubmit}
        disabled={mutation.isPending}
        className="mt-1 rounded-btn bg-primary py-2.5 font-semibold text-white disabled:opacity-50"
      >
        {mutation.isPending ? '提交中…' : '修改密码'}
      </button>
    </div>
  )
}

function SecurityEmailSection({
  emails,
  showToast,
}: {
  emails: SecurityEmailItem[]
  showToast: (msg: string) => void
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)

  const addEmail = useAddSecurityEmail()
  const deleteEmail = useDeleteSecurityEmail()

  async function handleSendCode() {
    if (!email.trim()) {
      showToast('请输入邮箱')
      return
    }
    setSendingCode(true)
    try {
      await sendSecurityEmailCode(email.trim())
      showToast('验证码已发送')
      setCodeSent(true)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '发送失败')
    } finally {
      setSendingCode(false)
    }
  }

  async function handleAddEmail(e: FormEvent) {
    e.preventDefault()
    if (!code.trim()) {
      showToast('请输入验证码')
      return
    }
    try {
      await addEmail.mutateAsync({ email: email.trim(), code: code.trim() })
      showToast('邮箱已添加')
      setShowAddForm(false)
      setEmail('')
      setCode('')
      setCodeSent(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '添加失败')
    }
  }

  async function handleDeleteEmail(emailId: number) {
    try {
      await deleteEmail.mutateAsync(emailId)
      showToast('邮箱已删除')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败')
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {emails.length > 0 ? (
        <div className="flex flex-col gap-2">
          {emails.map((se) => (
            <div key={se.id} className="flex items-center justify-between rounded-lg bg-bg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-ink">{se.email}</span>
                {se.is_primary && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">主要</span>
                )}
              </div>
              {!se.is_primary && (
                <button
                  onClick={() => handleDeleteEmail(se.id)}
                  disabled={deleteEmail.isPending}
                  className="text-sm text-danger hover:underline disabled:opacity-50"
                >
                  删除
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-secondary">暂未添加安全邮箱</p>
      )}

      {showAddForm ? (
        <form onSubmit={handleAddEmail} className="flex flex-col gap-2 rounded-lg bg-bg p-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="输入邮箱地址"
            className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
            required
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="输入验证码"
              className="flex-1 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
              required
            />
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sendingCode || !email.trim() || codeSent}
              className="rounded-btn bg-primary/10 px-4 text-sm text-primary disabled:opacity-50"
            >
              {sendingCode ? '发送中…' : codeSent ? '已发送' : '发送验证码'}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false)
                setEmail('')
                setCode('')
                setCodeSent(false)
              }}
              className="flex-1 rounded-btn border border-line py-2 text-sm text-ink-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={addEmail.isPending}
              className="flex-1 rounded-btn bg-primary py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {addEmail.isPending ? '添加中…' : '添加'}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="rounded-btn bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/20"
        >
          + 添加安全邮箱
        </button>
      )}
    </div>
  )
}
