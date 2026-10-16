import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { ReactNode } from 'react'

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: (props: { to: string; children: ReactNode; className?: string }) => {
    const { to, children, ...rest } = props
    return <a href={to} {...rest}>{children}</a>
  },
}))

import PasswordResetPage from '../pages/PasswordResetPage'

const server = setupServer(
  http.post('/api/auth/password-reset/request', () => {
    return HttpResponse.json({ message: '验证码已发送' })
  }),
  http.post('/api/auth/password-reset/request-phone', () => {
    return HttpResponse.json({ message: '验证码已发送' })
  }),
  http.post('/api/auth/password-reset/email-hint', () => {
    return HttpResponse.json({ masked_email: 'te***@test.com' })
  }),
  http.post('/api/auth/password-reset/confirm', () => {
    return HttpResponse.json({ message: '密码已重置' })
  }),
)

beforeEach(() => {
  mockNavigate.mockClear()
})

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('PasswordResetPage - 找回方式切换', () => {
  it('默认显示邮箱找回（含用户名输入）', () => {
    render(<PasswordResetPage />)

    expect(screen.getByRole('tab', { name: '邮箱找回' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByPlaceholderText('请输入用户名')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送验证码' })).toBeInTheDocument()
  })

  it('切换到手机找回后显示手机号输入、隐藏用户名输入', async () => {
    const user = userEvent.setup()
    render(<PasswordResetPage />)

    await user.click(screen.getByRole('tab', { name: '手机找回' }))

    expect(screen.getByRole('tab', { name: '手机找回' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByPlaceholderText('请输入注册时使用的手机号')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('请输入用户名')).not.toBeInTheDocument()
  })

  it('手机找回：手机号格式错误时发送按钮不可用', async () => {
    const user = userEvent.setup()
    let phoneRequested = false
    server.use(
      http.post('/api/auth/password-reset/request-phone', () => {
        phoneRequested = true
        return HttpResponse.json({ message: '验证码已发送' })
      }),
    )

    render(<PasswordResetPage />)
    await user.click(screen.getByRole('tab', { name: '手机找回' }))

    await user.type(screen.getByPlaceholderText('请输入注册时使用的手机号'), '123456')
    expect(screen.getByRole('button', { name: '发送验证码' })).toBeDisabled()
    expect(phoneRequested).toBe(false)
  })

  it('手机找回：合法手机号发送后进入重置步骤', async () => {
    const user = userEvent.setup()
    render(<PasswordResetPage />)
    await user.click(screen.getByRole('tab', { name: '手机找回' }))

    await user.type(screen.getByPlaceholderText('请输入注册时使用的手机号'), '13800001234')
    await user.click(screen.getByRole('button', { name: '发送验证码' }))

    await waitFor(() => {
      expect(screen.getByText('验证码已发送至')).toBeInTheDocument()
    })
    expect(screen.getByText('13800001234')).toBeInTheDocument()
  })
})


describe('PasswordResetPage - 引导式邮箱找回', () => {
  it('用户名失焦自动查询并显示掩码邮箱', async () => {
    const user = userEvent.setup()
    render(<PasswordResetPage />)

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'tester')
    await user.tab() // 触发失焦自动查询

    await waitFor(() => {
      expect(screen.getByText(/您的安全邮箱为/)).toBeInTheDocument()
    })
    expect(screen.getByText('te***@test.com')).toBeInTheDocument()
  })

  it('用户不存在时提示检查用户名是否正确', async () => {
    server.use(
      http.post('/api/auth/password-reset/email-hint', () => {
        return HttpResponse.json({ masked_email: null })
      }),
    )
    const user = userEvent.setup()
    render(<PasswordResetPage />)

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'ghost')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/请检查用户名是否正确/)).toBeInTheDocument()
    })
  })

  it('邮箱域名与掩码不一致时阻止发送并提示', async () => {
    let codeRequested = false
    server.use(
      http.post('/api/auth/password-reset/request', () => {
        codeRequested = true
        return HttpResponse.json({ message: '验证码已发送' })
      }),
    )
    const user = userEvent.setup()
    render(<PasswordResetPage />)

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'tester')
    await user.tab()
    await waitFor(() => {
      expect(screen.getByText(/您的安全邮箱为/)).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText(/请输入 te\*\*\*@test\.com 的完整邮箱地址/), 'someone@163.com')
    await user.click(screen.getByRole('button', { name: '发送验证码' }))

    expect(await screen.findByText(/域名与绑定的安全邮箱/)).toBeInTheDocument()
    expect(codeRequested).toBe(false)
  })

  it('域名一致时正常发送并进入重置步骤', async () => {
    const user = userEvent.setup()
    render(<PasswordResetPage />)

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'tester')
    await user.tab()
    await waitFor(() => {
      expect(screen.getByText(/您的安全邮箱为/)).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText(/完整邮箱地址/), 'someone@test.com')
    await user.click(screen.getByRole('button', { name: '发送验证码' }))

    await waitFor(() => {
      expect(screen.getByText('验证码已发送至')).toBeInTheDocument()
    })
  })
})
