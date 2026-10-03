import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { PaymentAccount } from '../types'

/* ===== 可变的 mock 状态（vi.hoisted 保证在 vi.mock 工厂中可用）===== */

const mocks = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateGuestbook: vi.fn(),
  cashAccounts: [] as PaymentAccount[],
  wechatAccounts: [] as PaymentAccount[],
  isCashLoading: false,
  isWechatLoading: false,
  guestbooks: [] as { id: number; name: string }[],
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
  useCollaborationInvites: () => ({ data: [] }),
  useCreateCollaborationInvite: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevokeCollaborationInvite: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCollaborationInviteLogs: () => ({ data: [] }),
}))

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({ clientId: 'test-client', operatorName: '' }),
}))

import { GuestbookNewPage } from '../pages/GuestbookPage'

/* ===== 测试数据工厂 ===== */

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
  mocks.mockCreateGuestbook.mockResolvedValue(42)
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

describe('GuestbookNewPage - 创建提交', () => {
  it('填写名称创建成功后跳转到收礼页', async () => {
    mocks.wechatAccounts = [wechatAccount(1, '微信账户A')]

    await renderPage()
    await fillAndSubmit('张三婚礼')

    await waitFor(() => {
      expect(mocks.mockCreateGuestbook).toHaveBeenCalledWith(
        expect.objectContaining({ name: '张三婚礼' })
      )
    })
    await waitFor(() => {
      expect(mocks.mockNavigate).toHaveBeenCalledWith({
        to: '/guestbooks/$id/collect',
        params: { id: '42' },
      })
    })
  })

  it('名称为空时提交按钮不可用', async () => {
    mocks.wechatAccounts = [wechatAccount(1, '微信账户A')]

    await renderPage()

    expect(screen.getByRole('button', { name: /新建并记账/ })).toBeDisabled()
    expect(mocks.mockCreateGuestbook).not.toHaveBeenCalled()
  })
})
