import { useState, useEffect, type FormEvent } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import type { PaymentAccount } from '../types'
import {
  useTerminalSettings,
  useSaveTerminalSettings,
  usePaymentAccounts,
} from '../hooks/useQueries'
import { useAppStore } from '../store/appStore'

export default function TerminalSettingsPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  const guestbookId = Number(id)
  const clientId = useAppStore((s) => s.clientId)
  const { toast, showToast } = useToast()

  const { data: settings, isLoading } = useTerminalSettings(guestbookId, clientId)
  const { data: cashAccounts = [] } = usePaymentAccounts({ type: 'cash' })
  const { data: wechatAccounts = [] } = usePaymentAccounts({ type: 'wechat' })
  const saveSettings = useSaveTerminalSettings()

  const [operatorName, setOperatorName] = useState('')
  const [defaultCashAccount, setDefaultCashAccount] = useState<number | undefined>()
  const [defaultWechatAccount, setDefaultWechatAccount] = useState<number | undefined>()
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (settings && !initialized) {
      setOperatorName(settings.operator_name ?? '')
      setDefaultCashAccount(settings.default_cash_account)
      setDefaultWechatAccount(settings.default_wechat_account)
      setInitialized(true)
    }
  }, [settings, initialized])

  // 排除已停用账户：非默认但未停用的账户也可选
  const activeCashAccounts = (cashAccounts as PaymentAccount[]).filter((a) => !a.is_disabled)
  const activeWechatAccounts = (wechatAccounts as PaymentAccount[]).filter((a) => !a.is_disabled)

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
        default_cash_account: defaultCashAccount,
        default_wechat_account: defaultWechatAccount,
      })
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
      description="配置当前终端的收银人和默认收款账户"
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

        {/* 默认现金账户 */}
        <div className="rounded-card bg-card p-5 shadow-card">
          <h3 className="mb-1 text-lg font-bold text-ink">默认现金账户</h3>
          <p className="mb-4 text-sm text-ink-secondary">收银方式为现金时，自动选择此账户</p>
          <AccountSelector
            accounts={activeCashAccounts}
            value={defaultCashAccount}
            onChange={setDefaultCashAccount}
            placeholder="不指定默认账户"
          />
        </div>

        {/* 默认微信账户 */}
        <div className="rounded-card bg-card p-5 shadow-card">
          <h3 className="mb-1 text-lg font-bold text-ink">默认微信账户</h3>
          <p className="mb-4 text-sm text-ink-secondary">收银方式为微信时，自动选择此账户</p>
          <AccountSelector
            accounts={activeWechatAccounts}
            value={defaultWechatAccount}
            onChange={setDefaultWechatAccount}
            placeholder="不指定默认账户"
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

function AccountSelector({
  accounts,
  value,
  onChange,
  placeholder,
}: {
  accounts: PaymentAccount[]
  value: number | undefined
  onChange: (v: number | undefined) => void
  placeholder: string
}) {
  if (accounts.length === 0) {
    return (
      <p className="rounded-lg bg-bg px-3 py-2.5 text-sm text-ink-secondary">
        暂无可用账户，请先在「账户管理」页面添加
      </p>
    )
  }

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-ink outline-none focus:border-primary"
    >
      <option value="">{placeholder}</option>
      {accounts.map((acc) => (
        <option key={acc.id} value={acc.id}>
          {acc.name}
          {acc.daily_limit > 0 ? `（限额 ¥${(acc.daily_limit / 100).toFixed(0)}）` : ''}
        </option>
      ))}
    </select>
  )
}
