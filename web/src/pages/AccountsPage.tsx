import { useState, useEffect, useCallback, useRef } from 'react'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import type { PaymentAccount, AccountType } from '../types'
import {
  getAllPaymentAccounts,
  createPaymentAccount,
  updatePaymentAccount,
  deletePaymentAccount,
  wechatRemainingLimit
} from '../lib/api-client'

const DEFAULT_WECHAT_LIMIT = 2_000_000_000 // 200000万 = 2,000,000,000 分

/** 账户设置页：管理现金收银人和微信收款账户 */
export default function AccountsPage() {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [remainingMap, setRemainingMap] = useState<Map<number, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const { toast, showToast } = useToast()

  /* 表单弹窗状态 */
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formType, setFormType] = useState<AccountType>('cash')
  const [formName, setFormName] = useState('')
  const [formLimit, setFormLimit] = useState('')
  const [formQrCode, setFormQrCode] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [formSubmitting, setFormSubmitting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const list = await getAllPaymentAccounts()
    setAccounts(list)
    const today = new Date().toISOString().slice(0, 10)
    const map = new Map<number, number>()
    await Promise.all(
      list
        .filter((a) => a.type === 'wechat')
        .map(async (a) => {
          const remaining = await wechatRemainingLimit(a, today)
          map.set(a.id!, remaining)
        })
    )
    setRemainingMap(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const cashAccounts = accounts.filter((a) => a.type === 'cash')
  const wechatAccounts = accounts.filter((a) => a.type === 'wechat')

  const openNew = (type: AccountType) => {
    setEditingId(null)
    setFormType(type)
    setFormName('')
    setFormLimit(type === 'wechat' ? (DEFAULT_WECHAT_LIMIT / 100).toString() : '')
    setFormQrCode('')
    setFormActive(true)
    setShowForm(true)
  }

  const openEdit = (a: PaymentAccount) => {
    setEditingId(a.id ?? null)
    setFormType(a.type)
    setFormName(a.name)
    setFormLimit((a.daily_limit / 100).toString())
    setFormQrCode(a.qr_code ?? '')
    setFormActive(a.is_active)
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!formName.trim()) {
      showToast('请填写名称')
      return
    }
    const limitFen = Math.round(parseFloat(formLimit || '0') * 100)
    if (formType === 'wechat' && (isNaN(limitFen) || limitFen <= 0)) {
      showToast('微信限额必须大于 0')
      return
    }

    setFormSubmitting(true)
    try {
      if (editingId != null) {
        await updatePaymentAccount(editingId, {
          name: formName.trim(),
          daily_limit: limitFen,
          qr_code: formQrCode || undefined,
          is_active: formActive
        })
        showToast('账户已更新')
      } else {
        await createPaymentAccount({
          name: formName.trim(),
          type: formType,
          daily_limit: formType === 'wechat' ? limitFen : 0,
          qr_code: formQrCode || undefined,
          is_active: true
        })
        showToast('账户已创建')
      }
      setShowForm(false)
      await load()
    } catch (e) {
      showToast('操作失败：' + (e as Error).message)
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该账户吗？')) return
    try {
      await deletePaymentAccount(id)
      showToast('账户已删除')
      await load()
    } catch (e) {
      showToast('删除失败：' + (e as Error).message)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setFormQrCode(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const AccountCard = ({ a }: { a: PaymentAccount }) => (
    <div className={`flex flex-col gap-3 rounded-card p-5 shadow-card ${a.is_active ? 'bg-card' : 'bg-gray-50'}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{a.type === 'cash' ? '💵' : '💚'}</span>
          <div>
            <h3 className={`font-bold ${a.is_active ? 'text-ink' : 'text-ink-secondary'}`}>{a.name}</h3>
            <p className="text-xs text-ink-secondary">
              {a.type === 'cash' ? '现金收银人' : '微信收款账户'}
              {!a.is_active && ' · 已停用'}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => openEdit(a)}
            className="rounded-btn px-3 py-1.5 text-xs font-medium text-info hover:bg-info/10"
          >
            编辑
          </button>
          <button
            onClick={() => handleDelete(a.id!)}
            className="rounded-btn px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg"
          >
            删除
          </button>
        </div>
      </div>

      {a.type === 'wechat' && (
        <>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-ink-secondary">每日限额：</span>
              <span className="font-medium text-ink">¥{(a.daily_limit / 100).toFixed(0)}</span>
            </div>
            {remainingMap.has(a.id!) && (
              <div>
                <span className="text-ink-secondary">剩余额度：</span>
                <span className={`font-medium ${(remainingMap.get(a.id!) ?? 0) <= 20000 ? 'text-danger' : 'text-ink'}`}>
                  ¥{((remainingMap.get(a.id!) ?? 0) / 100).toFixed(0)}
                </span>
              </div>
            )}
          </div>
          {a.qr_code && (
            <div className="flex items-center gap-3">
              <img src={a.qr_code} alt="收款码" className="h-16 w-16 rounded-lg object-contain" />
              <span className="text-xs text-ink-secondary">已上传收款二维码</span>
            </div>
          )}
        </>
      )}
    </div>
  )

  return (
    <PageScaffold
      title="账户设置"
      description="管理现金收银人和微信收款账户"
      actions={
        <div className="flex gap-2">
          <button
            onClick={() => openNew('cash')}
            className="rounded-btn border border-line px-4 py-2 text-sm font-medium text-ink hover:border-primary"
          >
            ＋ 现金收银人
          </button>
          <button
            onClick={() => openNew('wechat')}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            ＋ 微信账户
          </button>
        </div>
      }
    >
      {loading ? (
        <p className="py-10 text-center text-ink-secondary">加载中…</p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* 现金收银人 */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
              <span>💵</span> 现金收银人
            </h2>
            {cashAccounts.length === 0 ? (
              <p className="rounded-card bg-bg py-6 text-center text-sm text-ink-secondary">暂无现金收银人</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {cashAccounts.map((a) => (
                  <AccountCard key={a.id} a={a} />
                ))}
              </div>
            )}
          </section>

          {/* 微信收款账户 */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
              <span>💚</span> 微信收款账户
            </h2>
            {wechatAccounts.length === 0 ? (
              <p className="rounded-card bg-bg py-6 text-center text-sm text-ink-secondary">暂无微信收款账户</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {wechatAccounts.map((a) => (
                  <AccountCard key={a.id} a={a} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 表单弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[28rem] rounded-card bg-card p-6 shadow-xl">
            <h3 className="text-lg font-bold text-ink">
              {editingId != null ? '编辑账户' : formType === 'cash' ? '新增现金收银人' : '新增微信收款账户'}
            </h3>

            {/* 名称 */}
            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">名称 <span className="text-danger">*</span></span>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={formType === 'cash' ? '如：张三' : '如：新娘微信'}
                className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
              />
            </label>

            {/* 微信限额 */}
            {formType === 'wechat' && (
              <label className="mt-4 flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">每日限额（元）</span>
                <input
                  value={formLimit}
                  onChange={(e) => setFormLimit(e.target.value)}
                  inputMode="numeric"
                  placeholder="2000000000"
                  className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
                />
                <p className="text-xs text-ink-secondary">默认 200000万（2,000,000,000 分）</p>
              </label>
            )}

            {/* 收款二维码 */}
            {formType === 'wechat' && (
              <div className="mt-4 flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">收款二维码</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-btn border border-line px-4 py-2 text-sm text-ink-secondary hover:border-primary"
                  >
                    {formQrCode ? '更换图片' : '上传二维码'}
                  </button>
                  {formQrCode && (
                    <>
                      <img src={formQrCode} alt="预览" className="h-12 w-12 rounded object-contain" />
                      <button
                        type="button"
                        onClick={() => setFormQrCode('')}
                        className="text-xs text-danger"
                      >
                        清除
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 启用状态 */}
            {editingId != null && (
              <div className="mt-4 flex items-center gap-2">
                <input
                  id="active-toggle"
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <label htmlFor="active-toggle" className="text-sm text-ink">
                  启用该账户
                </label>
              </div>
            )}

            {/* 按钮 */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-btn border border-line py-2.5 font-medium text-ink-secondary"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={formSubmitting || !formName.trim()}
                className="flex-1 rounded-btn bg-primary py-2.5 font-medium text-white disabled:bg-disabled"
              >
                {formSubmitting ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
