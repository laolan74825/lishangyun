import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSystemSettings } from '../../hooks/useQueries'
import { updateSystemSettings } from '../../lib/api-client'
import { queryKeys } from '../../hooks/queryKeys'
import Toast, { useToast } from '../../components/Toast'

export default function AdminSettingsPage() {
  const { toast, showToast } = useToast()
  const queryClient = useQueryClient()
  const { data: settings, isLoading } = useSystemSettings()

  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('465')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')

  useEffect(() => {
    if (settings) {
      setSmtpHost(settings.smtp_host || '')
      setSmtpPort(settings.smtp_port || '465')
      setSmtpUser(settings.smtp_user || '')
      setSmtpPassword('')
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, string | number> = {
        smtp_host: smtpHost,
        smtp_port: Number(smtpPort),
        smtp_user: smtpUser,
      }
      if (smtpPassword) {
        payload.smtp_password = smtpPassword
      }
      return updateSystemSettings(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.settings() })
      showToast('配置已保存')
      setSmtpPassword('')
    },
    onError: (err: Error) => {
      showToast(err.message || '保存失败')
    },
  })

  if (isLoading) {
    return <div className="py-20 text-center text-ink-secondary">加载中…</div>
  }

  return (
    <div className="mx-auto flex max-w-[36rem] flex-col gap-5">
      <section className="rounded-card bg-card p-6 shadow-card">
        <h2 className="text-section-title">📧 邮件服务配置</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          配置 SMTP 邮件服务，用于密码重置验证码发送。
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">SMTP 服务器</span>
            <input
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="如 smtp.qq.com"
              className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">SMTP 端口</span>
            <input
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
              placeholder="465"
              className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">发件邮箱</span>
            <input
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              placeholder="发件人邮箱地址"
              className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">邮箱密码/授权码</span>
            <input
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              type="password"
              placeholder={settings?.smtp_password_set ? '已配置，留空保持不变' : '邮箱密码或授权码'}
              className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
            />
            <span className="text-xs text-ink-secondary">密码将以 AES-256 加密存储</span>
          </label>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="mt-1 rounded-btn bg-primary py-2.5 font-semibold text-white disabled:opacity-50"
          >
            {saveMutation.isPending ? '保存中…' : '保存配置'}
          </button>
        </div>
      </section>

      <Toast message={toast} onClose={() => showToast(null)} />
    </div>
  )
}
