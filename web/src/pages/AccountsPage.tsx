import { useState, useEffect, useRef } from 'react'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import type { PaymentAccount, AccountType } from '../types'
import {
  usePaymentAccounts,
  useCreatePaymentAccount,
  useUpdatePaymentAccount,
  useDeletePaymentAccount,
  useGuestbooks,
  useSaveTerminalSettings,
} from '../hooks/useQueries'
import { wechatRemainingLimit, getTerminalSettings } from '../lib/api-client'

// 微信账户默认每日限额：20万元 = 20,000,000 分
const DEFAULT_WECHAT_LIMIT = 20_000_000 // 20万 = 20,000,000 分

/**
 * 账户设置页：管理系统账户和礼簿账户
 *
 * 两个标签页：
 * 1. 系统账户设置：管理全局的收银员和微信账户，每种类型只能有一个"默认账户"（is_active=true）
 * 2. 礼簿账户设置：为每个礼簿单独指定收款账户（可选，默认使用"系统默认"）
 *
 * "系统默认"解析逻辑（在 CollectPage 中实现）：
 * - 优先使用礼簿终端设置中指定的账户
 * - 如果礼簿设置为"系统默认"（undefined），则使用 is_active=true 的账户
 * - 如果都没有，则使用该类型的第一个账户（兜底）
 */
export default function AccountsPage() {
  // 当前激活的标签页：'system'（系统账户）或 'guestbook'（礼簿账户）
  const [activeTab, setActiveTab] = useState<'system' | 'guestbook'>('system')
  // 获取所有收款账户（包括激活和未激活的）
  const { data: accounts = [], isLoading: loading } = usePaymentAccounts()
  // 微信账户的剩余额度映射：accountId -> remainingFen
  const [remainingMap, setRemainingMap] = useState<Map<number, number>>(new Map())
  const { toast, showToast } = useToast()

  // TanStack Query mutations：用于创建、更新、删除账户
  const createMutation = useCreatePaymentAccount()
  const updateMutation = useUpdatePaymentAccount()
  const deleteMutation = useDeletePaymentAccount()

  /* ========== 礼簿级别账户设置 ========== */
  // 获取所有礼簿列表
  const { data: guestbooks = [] } = useGuestbooks()
  // 保存终端设置的 mutation
  const saveTerminal = useSaveTerminalSettings()
  // 每个礼簿的账户设置映射：guestbookId -> { cash?: accountId, wechat?: accountId }
  // 如果字段为 undefined，表示使用"系统默认"
  const [guestbookSettings, setGuestbookSettings] = useState<Map<number, { cash?: number; wechat?: number }>>(new Map())

  // 加载每个礼簿的终端设置（使用 client_id="default" 作为默认终端）
  // 终端设置使用 (guestbook_id, client_id) 复合键，这里 client_id 固定为 "default"
  useEffect(() => {
    if (guestbooks.length === 0) return
    const map = new Map<number, { cash?: number; wechat?: number }>()
    // 并行获取所有礼簿的终端设置
    Promise.all(
      guestbooks.map(async (gb) => {
        if (!gb.id) return
        const settings = await getTerminalSettings(gb.id, 'default')
        if (settings) {
          // 保存该礼簿的默认收银员和微信账户 ID
          map.set(gb.id, { cash: settings.default_cash_account, wechat: settings.default_wechat_account })
        }
      })
    ).then(() => setGuestbookSettings(new Map(map)))
  }, [guestbooks])

  // 处理礼簿账户设置变更
  // 当用户在"礼簿账户设置"标签页中修改下拉框时调用
  // value 为 undefined 表示选择"系统默认"
  const handleGuestbookAccountChange = async (
    guestbookId: number,
    field: 'cash' | 'wechat',
    value: number | undefined,
  ) => {
    // 更新本地状态
    const current = guestbookSettings.get(guestbookId) || {}
    const updated = { ...current, [field]: value }
    setGuestbookSettings((prev) => {
      const next = new Map(prev)
      next.set(guestbookId, updated)
      return next
    })
    try {
      // 保存到后端终端设置
      // guestbook_id 作为查询参数，其余字段作为请求体
      await saveTerminal.mutateAsync({
        guestbook_id: guestbookId,
        client_id: 'default',  // 默认终端
        operator_name: '',
        default_cash_account: updated.cash,  // undefined 表示"系统默认"
        default_wechat_account: updated.wechat,  // undefined 表示"系统默认"
      })
      showToast('礼簿账户已更新')
    } catch {
      showToast('保存失败')
    }
  }

  // 加载每个未停用微信账户的今日剩余额度
  // 非默认但未停用的账户也可收款，需要同样关注额度
  useEffect(() => {
    const enabledWechatAccounts = accounts.filter((a) => a.type === 'wechat' && !a.is_disabled)
    if (enabledWechatAccounts.length === 0) return
    const today = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD 格式
    const map = new Map<number, number>()
    // 并行查询每个未停用微信账户的今日已收款金额
    Promise.all(
      enabledWechatAccounts.map(async (a) => {
        const remaining = await wechatRemainingLimit(a, today)
        map.set(a.id!, remaining)
      })
    ).then(() => setRemainingMap(new Map(map)))
  }, [accounts])

  /* ========== 表单弹窗状态 ========== */
  const [showForm, setShowForm] = useState(false)  // 是否显示表单弹窗
  const [editingId, setEditingId] = useState<number | null>(null)  // 编辑模式下的账户 ID，null 表示新建
  const [formType, setFormType] = useState<AccountType>('cash')  // 账户类型：cash 或 wechat
  const [formName, setFormName] = useState('')  // 账户名称（收银员姓名或微信账户名）
  const [formLimit, setFormLimit] = useState('')  // 每日限额（单位：元，仅微信账户使用）
  const [formQrCode, setFormQrCode] = useState('')  // 收款二维码（Base64 Data URL，仅微信账户）
  const [formActive, setFormActive] = useState(true)  // 是否激活该账户（仅编辑模式可修改）
  const [deletingAccountId, setDeletingAccountId] = useState<number | null>(null)  // 待删除的账户 ID

  const fileInputRef = useRef<HTMLInputElement>(null)  // 文件输入框引用（用于上传二维码）

  // 按类型分组账户
  const cashAccounts = accounts.filter((a) => a.type === 'cash')
  const wechatAccounts = accounts.filter((a) => a.type === 'wechat')

  // 实时检测名称是否与其他账户重名（跨类型）
  const isNameDuplicate =
    formName.trim().length > 0 &&
    accounts.some(
      (a) => a.name === formName.trim() && a.id !== editingId,
    )

  // 打开新建账户弹窗
  // type: 'cash'（收银员）或 'wechat'（微信账户）
  const openNew = (type: AccountType) => {
    setEditingId(null)  // null 表示新建模式
    setFormType(type)
    setFormName('')
    // 微信账户默认限额 200000万元，现金账户不需要限额
    setFormLimit(type === 'wechat' ? (DEFAULT_WECHAT_LIMIT / 100).toString() : '')
    setFormQrCode('')
    setFormActive(true)  // 新建账户默认激活
    setShowForm(true)
  }

  // 打开编辑账户弹窗
  const openEdit = (a: PaymentAccount) => {
    setEditingId(a.id ?? null)
    setFormType(a.type)
    setFormName(a.name)
    // 将分转换为元显示
    setFormLimit((a.daily_limit / 100).toString())
    setFormQrCode(a.qr_code ?? '')
    setFormActive(a.is_active)
    setShowForm(true)
  }

  // 提交表单（新建或更新账户）
  const handleSubmit = async () => {
    // 验证必填字段
    if (!formName.trim()) {
      showToast('请填写名称')
      return
    }
    // 将元转换为分
    const limitFen = Math.round(parseFloat(formLimit || '0') * 100)
    // 微信账户必须设置有效限额
    if (formType === 'wechat' && (isNaN(limitFen) || limitFen <= 0)) {
      showToast('微信限额必须大于 0')
      return
    }

    // 构造请求体
    const payload = {
      name: formName.trim(),
      type: formType,
      // 微信账户使用用户设置的限额，现金账户限额为 0（不限制）
      daily_limit: formType === 'wechat' ? limitFen : 0,
      qr_code: formQrCode || undefined,  // 空字符串转为 undefined
      // 新建时默认激活，编辑时使用用户设置的值
      is_active: editingId != null ? formActive : true,
    }

    if (editingId != null) {
      // 更新模式
      updateMutation.mutate(
        { id: editingId, changes: payload },
        {
          onSuccess: async () => {
            // 注意：后端已自动处理"激活一个账户时停用同类型其他账户"的逻辑
            // 这里的前端循环停用逻辑是冗余的，但保留作为防御性编程
            // 如果将该账户设为激活，停用同类型的其他激活账户
            if (formActive) {
              const others = accounts.filter((a) => a.type === formType && a.id !== editingId && a.is_active)
              for (const other of others) {
                await updateMutation.mutateAsync({
                  id: other.id!,
                  changes: { ...other, is_active: false },
                })
              }
            }
            showToast('账户已更新')
            setShowForm(false)
          },
          onError: (e) => { if (e.message !== '账户名称不能重复') showToast('操作失败：' + e.message) },
        }
      )
    } else {
      // 新建模式：新建账户均为启用状态（编辑分支不发送 is_disabled，避免误启用已停用的账户）
      createMutation.mutate({ ...payload, is_disabled: false }, {
        onSuccess: async () => {
          // 同上，后端已自动处理，这里作为防御性编程
          // 如果新建账户为激活状态，停用同类型的所有激活账户
          if (payload.is_active) {
            const others = accounts.filter((a) => a.type === formType && a.is_active)
            for (const other of others) {
              await updateMutation.mutateAsync({
                id: other.id!,
                changes: { ...other, is_active: false },
              })
            }
          }
          showToast('账户已创建')
          setShowForm(false)
        },
        onError: (e) => { if (e.message !== '账户名称不能重复') showToast('操作失败：' + e.message) },
      })
    }
  }

  // 删除账户（软删除，由后端处理）
  const handleDelete = async (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => showToast('账户已删除'),
      onError: (e) => showToast('删除失败：' + e.message),
    })
    setDeletingAccountId(null)  // 关闭确认弹窗
  }

  // 处理二维码文件上传
  // 将图片转换为 Base64 Data URL 存储到 formQrCode
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setFormQrCode(reader.result as string)  // Base64 Data URL
    }
    reader.readAsDataURL(file)
  }

  // 将账户设为默认（激活）
  // 当用户点击账户卡片上的单选按钮时调用
  // 后端会自动停用同类型的其他激活账户
  const handleSetActive = async (accountId: number) => {
    const account = accounts.find((a) => a.id === accountId)
    // 如果账户不存在或已经是激活状态，直接返回
    if (!account || account.is_active) return
    try {
      // 只需发送一个请求将 is_active 设为 true
      // 后端会自动处理"停用同类型其他账户"的逻辑
      await updateMutation.mutateAsync({
        id: accountId,
        changes: { ...account, is_active: true },
      })
      showToast('已设为默认账户')
    } catch {
      showToast('设置失败')
    }
  }

  // 停用/启用账户
  // 停用后账户在所有业务页面不可选择；停用默认账户会自动取消其默认身份（后端处理）
  const handleToggleDisabled = async (account: PaymentAccount) => {
    try {
      await updateMutation.mutateAsync({
        id: account.id!,
        changes: { ...account, is_disabled: !account.is_disabled },
      })
      showToast(account.is_disabled ? '账户已启用' : '账户已停用')
    } catch {
      showToast('操作失败')
    }
  }

  // 账户卡片组件：显示单个账户的信息和操作按钮
  const AccountCard = ({ a }: { a: PaymentAccount }) => (
    <div className={`flex flex-col gap-3 rounded-card p-5 shadow-card ${a.is_disabled ? 'bg-gray-50' : 'bg-card'}`}>
      {/* 账户名称和操作按钮 */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {/* 账户类型图标：💵 收银员，💚 微信 */}
          <span className="text-2xl">{a.type === 'cash' ? '💵' : '💚'}</span>
          <div>
            <h3 className={`font-bold ${a.is_disabled ? 'text-ink-secondary' : 'text-ink'}`}>{a.name}</h3>
            <p className="text-xs text-ink-secondary">
              {a.type === 'cash' ? '收银员' : '微信账户'}
              {a.is_active && ' · 默认'}
              {a.is_disabled && ' · 已停用'}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* 编辑、停用/启用和删除按钮 */}
          <div className="flex gap-1">
            <button
              onClick={() => openEdit(a)}
              className="rounded-btn px-3 py-1.5 text-xs font-medium text-info hover:bg-info/10"
            >
              编辑
            </button>
            <button
              onClick={() => handleToggleDisabled(a)}
              className="rounded-btn px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-bg"
            >
              {a.is_disabled ? '启用' : '停用'}
            </button>
            <button
              onClick={() => setDeletingAccountId(a.id!)}
              className="rounded-btn px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg"
            >
              删除
            </button>
          </div>
          {/* 设为默认账户的单选按钮 */}
          {/* 同一类型的账户共享一个 name，确保只能选中一个；停用账户不可设为默认 */}
          <label className={`flex items-center gap-1.5 ${a.is_disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
            <input
              type="radio"
              name={`account-${a.type}`}  // 按类型分组
              checked={a.is_active}  // 是否当前激活
              disabled={a.is_disabled}  // 停用账户不能设为默认
              onChange={() => handleSetActive(a.id!)}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-xs text-ink-secondary">设为默认值</span>
          </label>
        </div>
      </div>

      {/* 微信账户特有信息：限额和二维码 */}
      {a.type === 'wechat' && (
        <>
          {/* 每日限额和剩余额度 */}
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-ink-secondary">每日限额：</span>
              <span className="font-medium text-ink">¥{(a.daily_limit / 100).toFixed(0)}</span>
            </div>
            {/* 剩余额度：对所有未停用的微信账户显示（非默认账户也可收款，需要关注额度） */}
            {!a.is_disabled && remainingMap.has(a.id!) && (
              <div>
                <span className="text-ink-secondary">剩余额度：</span>
                {/* 剩余额度 ≤ 200元时显示红色警告 */}
                <span className={`font-medium ${(remainingMap.get(a.id!) ?? 0) <= 20000 ? 'text-danger' : 'text-ink'}`}>
                  ¥{((remainingMap.get(a.id!) ?? 0) / 100).toFixed(0)}
                </span>
              </div>
            )}
          </div>
          {/* 收款二维码预览 */}
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
      title="账户管理"
      description="管理系统账户和礼簿账户"
      actions={
        // 顶部操作按钮：仅在"系统账户设置"标签页显示
        <div className="flex gap-2">
          {activeTab === 'system' && (
            <>
              <button
                onClick={() => openNew('cash')}
                className="rounded-btn border border-line px-4 py-2 text-sm font-medium text-ink hover:border-primary"
              >
                ＋ 收银员
              </button>
              <button
                onClick={() => openNew('wechat')}
                className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-white"
              >
                ＋ 微信账户
              </button>
            </>
          )}
        </div>
      }
    >
      {/* 说明文字：解释两级账户设置的关系 */}
      <p className="mb-4 text-sm text-ink-secondary">
        可在<span className="text-primary">系统账户设置</span>中设置统一的收款设置，也可单独在
        <span className="text-primary">礼簿账户设置</span>中独立设置收款账户
      </p>

      {/* 标签页切换按钮 */}
      <div className="mb-6 flex gap-1 border-b border-line">
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'system'
              ? 'border-b-2 border-primary text-primary'
              : 'text-ink-secondary hover:text-ink'
          }`}
        >
          系统账户设置
        </button>
        <button
          onClick={() => setActiveTab('guestbook')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'guestbook'
              ? 'border-b-2 border-primary text-primary'
              : 'text-ink-secondary hover:text-ink'
          }`}
        >
          礼簿账户设置
        </button>
      </div>

      {/* ========== 系统账户设置标签页 ========== */}
      {/* 显示所有收银员和微信账户，每种类型只能有一个"默认账户" */}
      {activeTab === 'system' && (
        <>
          {loading ? (
            <p className="py-10 text-center text-ink-secondary">加载中…</p>
          ) : (
            <div className="flex flex-col gap-6">
              {/* 收银员（现金账户）列表 */}
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
                  <span>💵</span> 收银员
            </h2>
            {cashAccounts.length === 0 ? (
              <p className="rounded-card bg-bg py-6 text-center text-sm text-ink-secondary">暂无收银员</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {cashAccounts.map((a) => (
                  <AccountCard key={a.id} a={a} />
                ))}
              </div>
            )}
          </section>

          {/* 微信账户列表 */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
              <span>💚</span> 微信账户
            </h2>
            {wechatAccounts.length === 0 ? (
              <p className="rounded-card bg-bg py-6 text-center text-sm text-ink-secondary">暂无微信账户</p>
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
        </>
      )}

      {/* ========== 礼簿账户设置标签页 ========== */}
      {/* 为每个礼簿单独指定收款账户（可选） */}
      {/* 如果选择"系统默认"（value=undefined），则使用系统账户设置中 is_active=true 的账户 */}
      {activeTab === 'guestbook' && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
            <span>📒</span> 礼簿账户设置
          </h2>
            {guestbooks.length === 0 ? (
              <p className="rounded-card bg-bg py-6 text-center text-sm text-ink-secondary">暂无礼簿</p>
            ) : (
              <div className="flex flex-col gap-3">
                {/* 过滤掉已归档的礼簿（已归档不可修改） */}
                {guestbooks
                  .filter((gb) => gb.status !== 'archived')
                  .map((gb) => {
                    const settings = guestbookSettings.get(gb.id!) || {}
                    return (
                      <div key={gb.id} className="rounded-card bg-card p-4 shadow-card">
                        {/* 礼簿名称和状态 */}
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <h3 className="font-bold text-ink">{gb.name}</h3>
                            <p className="text-xs text-ink-secondary">
                              {gb.event_type} · {gb.event_date}
                              {gb.status === 'closing' && ' · 收尾中'}
                            </p>
                          </div>
                        </div>
                        {/* 收银员和微信账户下拉选择器 */}
                        <div className="grid gap-3 sm:grid-cols-2">
                          {/* 收银员选择器 */}
                          {/* value=undefined（空字符串）表示"系统默认" */}
                          <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-ink-secondary">收银员</span>
                            <select
                              value={settings.cash ?? ''}  // undefined 转为空字符串显示"系统默认"
                              onChange={(e) =>
                                handleGuestbookAccountChange(
                                  gb.id!,
                                  'cash',
                                  // 空字符串转回 undefined，表示"系统默认"
                                  e.target.value ? Number(e.target.value) : undefined,
                                )
                              }
                              disabled={gb.status === 'closing'}  // 收尾中不可修改
                              className="h-10 rounded-btn border border-line bg-white px-3 text-sm outline-none focus:border-primary disabled:opacity-50"
                            >
                              <option value="">系统默认</option>
                              {cashAccounts.filter((acc) => !acc.is_disabled).map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          {/* 微信账户选择器 */}
                          {/* 同上，value=undefined 表示"系统默认" */}
                          <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-ink-secondary">微信账户</span>
                            <select
                              value={settings.wechat ?? ''}
                              onChange={(e) =>
                                handleGuestbookAccountChange(
                                  gb.id!,
                                  'wechat',
                                  e.target.value ? Number(e.target.value) : undefined,
                                )
                              }
                              disabled={gb.status === 'closing'}
                              className="h-10 rounded-btn border border-line bg-white px-3 text-sm outline-none focus:border-primary disabled:opacity-50"
                            >
                              <option value="">系统默认</option>
                              {wechatAccounts.filter((acc) => !acc.is_disabled).map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
            {/* 提示：已归档的礼簿不可修改 */}
            {guestbooks.some((gb) => gb.status === 'archived') && (
              <p className="mt-2 text-xs text-ink-secondary">已归档的礼簿不可修改账户设置</p>
            )}
          </section>
      )}

      {/* ========== 新建/编辑账户表单弹窗 ========== */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId != null ? '编辑账户' : formType === 'cash' ? '新增收银员' : '新增微信账户'}
        maxWidth="md"
        actions={
          <>
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 rounded-btn border border-line py-2.5 font-medium text-ink-secondary"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending || !formName.trim() || isNameDuplicate}
              className="flex-1 rounded-btn bg-primary py-2.5 font-medium text-white disabled:bg-disabled"
            >
              {createMutation.isPending || updateMutation.isPending ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        {/* 账户名称（必填） */}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">名称 <span className="text-danger">*</span></span>
          <input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder={formType === 'cash' ? '如：张三' : '如：新娘微信'}
            className={`h-11 rounded-btn border px-4 text-base outline-none ${isNameDuplicate ? 'border-danger' : 'border-line focus:border-primary'}`}
          />
          {isNameDuplicate && (
            <span className="text-xs text-danger">已存在同名账户，请更换名称</span>
          )}
        </label>

        {/* 微信账户特有：每日限额 */}
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

        {/* 微信账户特有：收款二维码上传 */}
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

        {/* 启用状态开关（仅编辑模式显示） */}
        {/* 新建账户默认激活，不可选择 */}
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
      </Modal>

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        open={deletingAccountId !== null}
        title="删除账户"
        message="确定删除该账户吗？"
        variant="danger"
        confirmLabel="删除"
        onConfirm={() => deletingAccountId && handleDelete(deletingAccountId)}
        onCancel={() => setDeletingAccountId(null)}
        loading={deleteMutation.isPending}
      />

      {/* Toast 通知 */}
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}
