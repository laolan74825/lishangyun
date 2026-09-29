import { useState, useEffect, useCallback } from 'react'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import AuthorizationCodeTable from '../components/authz/AuthorizationCodeTable'
import GenerateAuthCodeModal from '../components/authz/GenerateAuthCodeModal'
import {
  listAuthorizationCodes,
  getAllGuestbooks,
  bindAuthorizationCode,
} from '../lib/api-client'
import type { AuthorizationCode, Guestbook } from '../types'

type Tab = 'codes' | 'bind'
type StatusFilter = '' | 'active' | 'bound' | 'revoked' | 'expired'

export default function AuthorizationPage() {
  const { toast, showToast } = useToast()
  const [activeTab, setActiveTab] = useState<Tab>('codes')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'codes', label: '协作人员列表' },
    { key: 'bind', label: '绑定协作邀请' },
  ]

  return (
    <PageScaffold title="协作人员管理" description="邀请协作人员在指定时间内协助管理礼簿，协作人员不同于家庭成员">
      <div className="flex flex-col gap-4">
        <div className="flex gap-1 border-b border-line">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-ink-secondary hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'codes' && <CodesList showToast={showToast} />}
        {activeTab === 'bind' && <BindPanel showToast={showToast} />}
      </div>
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}

function CodesList({ showToast }: { showToast: (msg: string) => void }) {
  const [codes, setCodes] = useState<AuthorizationCode[]>([])
  const [guestbooks, setGuestbooks] = useState<Guestbook[]>([])
  const [loading, setLoading] = useState(true)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [guestbookFilter, setGuestbookFilter] = useState<number | ''>('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [codeData, gbData] = await Promise.all([
        listAuthorizationCodes({
          status: statusFilter || undefined,
          guestbook_id: guestbookFilter || undefined,
        }),
        getAllGuestbooks(),
      ])
      setCodes(codeData)
      setGuestbooks(gbData)
    } catch {
      showToast('加载失败')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, guestbookFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const guestbookNames: Record<number, string> = {}
  for (const g of guestbooks) {
    if (g.id) guestbookNames[g.id] = g.name
  }

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: '', label: '全部状态' },
    { value: 'active', label: '有效' },
    { value: 'bound', label: '已绑定' },
    { value: 'revoked', label: '已撤销' },
    { value: 'expired', label: '已过期' },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-btn border border-line px-3 py-2 text-sm outline-none focus:border-primary"
        >
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={guestbookFilter}
          onChange={(e) => setGuestbookFilter(e.target.value ? Number(e.target.value) : '')}
          className="rounded-btn border border-line px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">全部礼簿</option>
          {guestbooks.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          onClick={() => setGenerateOpen(true)}
          className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white"
        >
          邀请协作人员
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-ink-secondary">加载中…</div>
      ) : (
        <AuthorizationCodeTable
          codes={codes}
          guestbookNames={guestbookNames}
          onRefresh={load}
          showToast={showToast}
        />
      )}

      <GenerateAuthCodeModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onCreated={load}
        showToast={showToast}
      />
    </>
  )
}

function BindPanel({ showToast }: { showToast: (msg: string) => void }) {
  const [code, setCode] = useState('')
  const [grantorAccountId, setGrantorAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleBind() {
    if (!code.trim()) { showToast('请输入授权码'); return }
    if (!grantorAccountId.trim()) { showToast('请输入授权人账户 ID'); return }
    setSubmitting(true)
    try {
      const res = await bindAuthorizationCode(code.trim().toUpperCase(), Number(grantorAccountId))
      showToast(`${res.message}，礼簿 #${res.guestbook_id}，权限：${res.permissions}`)
      setCode('')
      setGrantorAccountId('')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '绑定失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-card bg-card p-6 shadow-card">
      <div className="flex flex-col items-center gap-2">
        <span className="text-4xl">🔐</span>
        <h2 className="text-lg font-bold text-ink">绑定协作邀请</h2>
        <p className="text-center text-sm text-ink-secondary">
          输入他人分享给你的授权码，绑定后即可协助管理对应礼簿。
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">授权码</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="输入 16 位授权码"
          className="h-11 rounded-btn border border-line px-4 font-mono text-base tracking-wider outline-none focus:border-primary"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">邀请人账户 ID</span>
        <input
          value={grantorAccountId}
          onChange={(e) => setGrantorAccountId(e.target.value)}
          placeholder="输入邀请人的账户 ID"
          type="number"
          className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
        />
      </label>

      <button
        onClick={handleBind}
        disabled={submitting}
        className="mt-2 rounded-btn bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? '绑定中…' : '绑定'}
      </button>
    </div>
  )
}
