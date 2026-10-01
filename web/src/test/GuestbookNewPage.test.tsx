import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { PaymentAccount } from '../types'

/* ===== 可变的 mock 状态（vi.hoisted 保证在 vi.mock 工厂中可用）===== */

const mocks = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateGuestbook: vi.fn(),
  mockSaveTerminal: vi.fn(),
  cashAccounts: [] as PaymentAccount[],
  wechatAccounts: [] as PaymentAccount[],
  isCashLoading: false,
  isWechatLoading: false,
  guestbooks: [] as { id: number; name: string }[],
  operatorName: '',
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.mockNavigate,
  Link: (props: { to: string; children: ReactNode; className?: string }) => (
    <a href={props.to} className={props.className}>{props.children}</a>
  ),
}))

vi.mock('../hooks/useQueries', () => ({
  useAllGuestbookSummaries: () => ({ data: mocks.guestbooks }),
  useCreateGuestbook: () => ({ mutateAsync: mocks.mockCreateGuestbook, isPending: false }),
  useDeleteGuestbook: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePaymentAccounts: ({ type }: { type?: string }) =>
    type === 'cash'
      ? { data: mocks.cashAccounts, isPending: mocks.isCashLoading }
      : { data: mocks.wechatAccounts, isPending: mocks.isWechatLoading },
  useSaveTerminalSettings: () => ({ mutateAsync: mocks.mockSaveTerminal, isPending: false }),
  useCollaborationInvites: () => ({ data: [] }),
  useCreateCollaborationInvite: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevokeCollaborationInvite: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCollaborationInviteLogs: () => ({ data: [] }),
}))

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({ clientId: 'test-client', operatorName: mocks.operatorName }),
}))

import { GuestbookNewPage } from '../pages/GuestbookPage'

/* ===== 测试数据工厂 ===== */

function cashAccount(id: number, name: string, is_active = true): PaymentAccount {
  return { id, name, type: 'cash', daily_limit: 0, is_active, is_disabled: false, created_at: '2026-10-01T00:00:00' }
}

function wechatAccount(id: number, name: string, is_active = true): PaymentAccount {
  return { id, name, type: 'wechat', daily_limit: 20000000, is_active, is_disabled: false, created_at: '2026-10-01T00:00:00' }
}

async function renderPage() {
  render(<GuestbookNewPage />)
  // 等待账户加载完成（加载态消失）
  await waitFor(() => {
    expect(screen.queryByText('正在加载账户信息…')).not.toBeInTheDocument()
  })
}

async function fillAndSubmit(name = '张三婚礼') {
  fireEvent.change(screen.getByPlaceholderText('例如：张三 & 李四 婚礼'), {
    target: { value: name },
  })
  fireEvent.click(screen.getByRole('button', { name: /新建并记账/ }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cashAccounts = []
  mocks.wechatAccounts = []
  mocks.isCashLoading = false
  mocks.isWechatLoading = false
  mocks.guestbooks = []
  mocks.operatorName = ''
  mocks.mockCreateGuestbook.mockResolvedValue(42)
  mocks.mockSaveTerminal.mockResolvedValue(undefined)
})

describe('GuestbookNewPage - 无账户引导', () => {
  it('系统中既无收银员也无微信账户时，弹出引导去账户管理的弹窗', async () => {
    await renderPage()

    expect(screen.getByText('请先设置收款账户')).toBeInTheDocument()
    expect(screen.getByText(/请先到「账户管理」添加至少一个收款账户/)).toBeInTheDocument()
  })

  it('点击「去账户管理」跳转到账户管理页', async () => {
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: '去账户管理' }))

    expect(mocks.mockNavigate).toHaveBeenCalledWith({ to: '/accounts' })
  })

  it('点击「返回礼簿列表」回到礼簿列表页', async () => {
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: '返回礼簿列表' }))

    expect(mocks.mockNavigate).toHaveBeenCalledWith({ to: '/guestbooks' })
  })

  it('只有微信账户、没有收银员时不弹窗', async () => {
    mocks.wechatAccounts = [wechatAccount(1, '微信账户A')]

    await renderPage()

    expect(screen.queryByText('请先设置收款账户')).not.toBeInTheDocument()
  })
})

describe('GuestbookNewPage - 默认账户与提交', () => {
  it('有账户时不弹窗，收银员和微信账户默认「系统默认」', async () => {
    mocks.cashAccounts = [cashAccount(1, '王收银员')]
    mocks.wechatAccounts = [wechatAccount(2, '微信账户A')]

    await renderPage()

    expect(screen.queryByText('请先设置收款账户')).not.toBeInTheDocument()
    const selects = screen.getAllByRole('combobox')
    // 下拉顺序：宴席类型、收银员、微信账户
    expect(selects[1]).toHaveValue('')
    expect(selects[2]).toHaveValue('')
    expect(screen.getByRole('option', { name: '王收银员' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '微信账户A' })).toBeInTheDocument()
  })

  it('默认「系统默认」提交时，操作员取当前激活的收银员，账户字段为空（跟随系统默认）', async () => {
    mocks.cashAccounts = [cashAccount(1, '王收银员'), cashAccount(2, '李收银员', false)]
    mocks.wechatAccounts = [wechatAccount(3, '微信账户A')]

    await renderPage()
    await fillAndSubmit()

    await waitFor(() => {
      expect(mocks.mockSaveTerminal).toHaveBeenCalled()
    })
    expect(mocks.mockSaveTerminal).toHaveBeenCalledWith({
      guestbook_id: 42,
      client_id: 'default',
      operator_name: '王收银员',
      default_cash_account: undefined,
      default_wechat_account: undefined,
    })
    await waitFor(() => {
      expect(mocks.mockNavigate).toHaveBeenCalledWith({
        to: '/guestbooks/$id/collect',
        params: { id: '42' },
      })
    })
  })

  it('手动选择其他收银员和微信账户后，提交保存所选账户', async () => {
    mocks.cashAccounts = [cashAccount(1, '王收银员'), cashAccount(2, '李收银员', false)]
    mocks.wechatAccounts = [wechatAccount(3, '微信账户A'), wechatAccount(4, '微信账户B', false)]

    await renderPage()
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: '2' } })
    fireEvent.change(selects[2], { target: { value: '4' } })
    await fillAndSubmit()

    await waitFor(() => {
      expect(mocks.mockSaveTerminal).toHaveBeenCalled()
    })
    expect(mocks.mockSaveTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        operator_name: '李收银员',
        default_cash_account: 2,
        default_wechat_account: 4,
      })
    )
  })

  it('没有激活的收银员时，兜底使用第一个收银员账户作为操作员', async () => {
    mocks.cashAccounts = [cashAccount(1, '王收银员', false), cashAccount(2, '李收银员', false)]

    await renderPage()
    await fillAndSubmit()

    await waitFor(() => {
      expect(mocks.mockSaveTerminal).toHaveBeenCalled()
    })
    expect(mocks.mockSaveTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ operator_name: '王收银员' })
    )
  })

  it('完全没有收银员账户且本机操作员姓名为空时，提示选择收银员', async () => {
    mocks.wechatAccounts = [wechatAccount(3, '微信账户A')]

    await renderPage()
    await fillAndSubmit()

    expect(await screen.findByText('请选择收银员')).toBeInTheDocument()
    expect(mocks.mockCreateGuestbook).not.toHaveBeenCalled()
  })

  it('完全没有收银员账户时，使用本机操作员姓名', async () => {
    mocks.operatorName = '张三'
    mocks.wechatAccounts = [wechatAccount(3, '微信账户A')]

    await renderPage()
    await fillAndSubmit()

    await waitFor(() => {
      expect(mocks.mockSaveTerminal).toHaveBeenCalled()
    })
    expect(mocks.mockSaveTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ operator_name: '张三' })
    )
  })
})
