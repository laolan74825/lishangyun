import { useState, useEffect, type FormEvent } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import {
  useTerminalSettings,
  useSaveTerminalSettings,
} from '../hooks/useQueries'
import { useAppStore } from '../store/appStore'

export default function TerminalSettingsPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const guestbookId = Number(id)
  const clientId = useAppStore((s) => s.clientId)
  const setStoreOperatorName = useAppStore((s) => s.setOperatorName)
  const { toast, showToast } = useToast()

  const { data: settings, isLoading } = useTerminalSettings(guestbookId, clientId)
  const saveSettings = useSaveTerminalSettings()

  const [operatorName, setOperatorName] = useState('')
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (settings && !initialized) {
      setOperatorName(settings.operator_name ?? '')
      setInitialized(true)
    }
  }, [settings, initialized])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!operatorName.trim()) {
      showToast('请输入收银人姓名')
      return
    }

    try {
      await saveSettings.mutateAsync({
        guestbook_id: guestbookId,
        client_id: clientId,
        operator_name: operatorName.trim(),
        default_cash_account: undefined,
        default_wechat_account: undefined,
      })
      // 同步到全局状态：收礼记录的操作员姓名取自这里
      setStoreOperatorName(operatorName.trim())
      showToast('终端设置已保存')
    } catch (err) {
      showToast('保存失败：' + (err instanceof Error ? err.message : '未知错误'))
    }
  }

  if (isLoading) {
    return (
      <PageScaffold title="终端设置">
        <div className="py-20 text-center text-ink-secondary">加载中…</div>
      </PageScaffold>
    )
  }

  return (
    <PageScaffold
      title="终端设置"
      description="配置当前终端的收银人姓名；收款账户统一使用系统当前账户，不再单独设置"
      actions={
        <Link
          to="/guestbooks/$id"
          params={{ id: String(guestbookId) }}
          className="rounded-btn border border-line px-4 py-2 text-sm text-ink-secondary hover:border-primary"
        >
          返回礼簿
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* 收银人 */}
        <div className="rounded-card bg-card p-5 shadow-card">
          <h3 className="mb-1 text-lg font-bold text-ink">收银人</h3>
          <p className="mb-4 text-sm text-ink-secondary">当前终端的收银员姓名，会记录在每笔收礼记录中</p>
          <input
            type="text"
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            placeholder="请输入收银人姓名"
            className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-ink outline-none focus:border-primary"
            maxLength={50}
          />
        </div>

        <button
          type="submit"
          disabled={saveSettings.isPending || !operatorName.trim()}
          className="self-end rounded-btn bg-primary px-8 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {saveSettings.isPending ? '保存中…' : '保存设置'}
        </button>
      </form>

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
