import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { clearToken } from '../lib/auth'
import type { ReactNode } from 'react'

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: (props: { to: string; children: ReactNode; className?: string }) => {
    const { to, children, ...rest } = props
    return <a href={to} {...rest}>{children}</a>
  },
}))

import LoginPage from '../pages/LoginPage'

const server = setupServer()

beforeEach(() => {
  clearToken()
  localStorage.clear()
  mockNavigate.mockClear()
})

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

describe('LoginPage - 首次运行检测', () => {
  it('当系统无用户时，自动显示注册表单并提示创建管理员', async () => {
    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: true, user_count: 0 })
      })
    )

    render(<LoginPage />)

    await waitFor(() => {
      expect(screen.getByText('首次运行，请创建系统管理员')).toBeInTheDocument()
    })

    expect(screen.getByPlaceholderText('用于找回密码的主邮箱')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('请再次输入密码')).toBeInTheDocument()
    expect(screen.queryByText('没有账户？立即注册')).not.toBeInTheDocument()
    expect(screen.queryByText('已有账户？返回登录')).not.toBeInTheDocument()
  })

  it('当系统已有用户时，显示登录表单', async () => {
    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: false, user_count: 1 })
      })
    )

    render(<LoginPage />)

    await waitFor(() => {
      expect(screen.getByText('登录以继续')).toBeInTheDocument()
    })

    expect(screen.getByText('没有账户？立即注册')).toBeInTheDocument()
    expect(screen.queryByText('已有账户？返回登录')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('用于找回密码的主邮箱')).not.toBeInTheDocument()
  })
})

describe('LoginPage - 登录流程', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: false, user_count: 1 })
      })
    )
  })

  it('成功登录后跳转到首页', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('/api/auth/login', () => {
        return HttpResponse.json({
          access_token: 'test-token',
          user: { id: 1, username: 'testuser', role: 'user' },
        })
      })
    )

    render(<LoginPage />)

    await waitFor(() => {
      expect(screen.getByText('登录以继续')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'testuser')
    await user.type(screen.getByPlaceholderText('请输入密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/', replace: true })
    })

    expect(localStorage.getItem('gr.access_token')).toBe('test-token')
  })

  it('登录失败时显示错误信息', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('/api/auth/login', () => {
        return HttpResponse.json({ detail: '用户名或密码错误' }, { status: 400 })
      })
    )

    render(<LoginPage />)

    await waitFor(() => {
      expect(screen.getByText('登录以继续')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'wronguser')
    await user.type(screen.getByPlaceholderText('请输入密码'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() => {
      expect(screen.getByText('用户名或密码错误')).toBeInTheDocument()
    })
  })

  it('401 未授权时显示未授权错误', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('/api/auth/login', () => {
        return HttpResponse.json({ detail: 'token expired' }, { status: 401 })
      })
    )

    render(<LoginPage />)

    await waitFor(() => {
      expect(screen.getByText('登录以继续')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'test')
    await user.type(screen.getByPlaceholderText('请输入密码'), 'test')
    await user.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() => {
      expect(screen.getByText('未授权')).toBeInTheDocument()
    })
  })

  it('切换到注册表单', async () => {
    const user = userEvent.setup()

    render(<LoginPage />)

    await waitFor(() => {
      expect(screen.getByText('登录以继续')).toBeInTheDocument()
    })

    await user.click(screen.getByText('没有账户？立即注册'))

    await waitFor(() => {
      expect(screen.getByText('创建新账户')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('用于找回密码的主邮箱')).toBeInTheDocument()
      expect(screen.getByText('已有账户？返回登录')).toBeInTheDocument()
    })
  })

  it('从注册表单返回登录表单', async () => {
    const user = userEvent.setup()

    render(<LoginPage />)

    await user.click(screen.getByText('没有账户？立即注册'))

    await waitFor(() => {
      expect(screen.getByText('创建新账户')).toBeInTheDocument()
    })

    await user.click(screen.getByText('已有账户？返回登录'))

    await waitFor(() => {
      expect(screen.getByText('登录以继续')).toBeInTheDocument()
      expect(screen.queryByPlaceholderText('用于找回密码的主邮箱')).not.toBeInTheDocument()
    })
  })
})

describe('LoginPage - 注册流程', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: false, user_count: 1 })
      })
    )
  })

  it('注册时两次密码不一致显示错误', async () => {
    const user = userEvent.setup()

    render(<LoginPage />)

    await user.click(screen.getByText('没有账户？立即注册'))

    await waitFor(() => {
      expect(screen.getByText('创建新账户')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'newuser')
    await user.type(screen.getAllByPlaceholderText('请输入密码')[0], 'password123')
    await user.type(screen.getByPlaceholderText('请再次输入密码'), 'password456')
    await user.type(screen.getByPlaceholderText('用于找回密码的主邮箱'), 'test@example.com')

    const form = document.querySelector('form')!
    fireEvent.submit(form)

    expect(await screen.findByText('两次输入的密码不一致')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('成功注册第一个用户（super_admin）', async () => {
    const user = userEvent.setup()

    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: true, user_count: 0 })
      }),
      http.post('/api/auth/send-verification-code', () => {
        return HttpResponse.json({ message: 'ok' })
      }),
      http.post('/api/auth/register', () => {
        return HttpResponse.json({
          access_token: 'admin-token',
          user: { id: 1, username: 'admin', role: 'super_admin' },
        })
      })
    )

    render(<LoginPage />)

    await waitFor(() => {
      expect(screen.getByText('首次运行，请创建系统管理员')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'admin')
    await user.type(screen.getAllByPlaceholderText('请输入密码')[0], 'admin123')
    await user.type(screen.getByPlaceholderText('请再次输入密码'), 'admin123')
    await user.type(screen.getByPlaceholderText('用于找回密码的主邮箱'), 'admin@example.com')
    await user.type(screen.getByPlaceholderText('验证码'), '123456')
    await user.click(screen.getByRole('checkbox'))

    const form = document.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/admin', replace: true })
    })

    expect(localStorage.getItem('gr.access_token')).toBe('admin-token')
  })

  it('成功注册后续用户（普通 user）', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('/api/auth/send-verification-code', () => {
        return HttpResponse.json({ message: 'ok' })
      }),
      http.post('/api/auth/register', () => {
        return HttpResponse.json({
          access_token: 'user-token',
          user: { id: 2, username: 'user2', role: 'user' },
        })
      })
    )

    render(<LoginPage />)

    await user.click(screen.getByText('没有账户？立即注册'))

    await waitFor(() => {
      expect(screen.getByText('创建新账户')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'user2')
    await user.type(screen.getAllByPlaceholderText('请输入密码')[0], 'user123')
    await user.type(screen.getByPlaceholderText('请再次输入密码'), 'user123')
    await user.type(screen.getByPlaceholderText('用于找回密码的主邮箱'), 'user2@example.com')
    await user.type(screen.getByPlaceholderText('验证码'), '123456')
    await user.click(screen.getByRole('checkbox'))

    const form = document.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/', replace: true })
    })

    expect(localStorage.getItem('gr.access_token')).toBe('user-token')
  })

  it('注册时系统设置关闭返回错误', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('/api/auth/send-verification-code', () => {
        return HttpResponse.json({ message: 'ok' })
      }),
      http.post('/api/auth/register', () => {
        return HttpResponse.json({ detail: '系统注册功能已关闭，请联系管理员' }, { status: 400 })
      })
    )

    render(<LoginPage />)

    await user.click(screen.getByText('没有账户？立即注册'))

    await waitFor(() => {
      expect(screen.getByText('创建新账户')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'newuser')
    await user.type(screen.getAllByPlaceholderText('请输入密码')[0], 'password123')
    await user.type(screen.getByPlaceholderText('请再次输入密码'), 'password123')
    await user.type(screen.getByPlaceholderText('用于找回密码的主邮箱'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('验证码'), '123456')
    await user.click(screen.getByRole('checkbox'))

    const form = document.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('系统注册功能已关闭，请联系管理员')).toBeInTheDocument()
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('注册时用户名已存在返回错误', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('/api/auth/send-verification-code', () => {
        return HttpResponse.json({ message: 'ok' })
      }),
      http.post('/api/auth/register', () => {
        return HttpResponse.json({ detail: '用户名已存在' }, { status: 400 })
      })
    )

    render(<LoginPage />)

    await user.click(screen.getByText('没有账户？立即注册'))

    await waitFor(() => {
      expect(screen.getByText('创建新账户')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'existinguser')
    await user.type(screen.getAllByPlaceholderText('请输入密码')[0], 'password123')
    await user.type(screen.getByPlaceholderText('请再次输入密码'), 'password123')
    await user.type(screen.getByPlaceholderText('用于找回密码的主邮箱'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('验证码'), '123456')
    await user.click(screen.getByRole('checkbox'))

    const form = document.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('用户名已存在')).toBeInTheDocument()
    })
  })
})

describe('LoginPage - 表单验证', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: false, user_count: 1 })
      })
    )
  })

  it('登录表单必填字段', () => {
    render(<LoginPage />)

    const usernameInput = screen.getByPlaceholderText('请输入用户名')
    const passwordInput = screen.getByPlaceholderText('请输入密码')

    expect(usernameInput).toBeRequired()
    expect(passwordInput).toBeRequired()
  })

  it('注册表单必填字段', async () => {
    const user = userEvent.setup()

    render(<LoginPage />)

    await user.click(screen.getByText('没有账户？立即注册'))

    await waitFor(() => {
      expect(screen.getByText('创建新账户')).toBeInTheDocument()
    })

    const usernameInput = screen.getByPlaceholderText('请输入用户名')
    const passwordInputs = screen.getAllByPlaceholderText('请输入密码')
    const confirmPasswordInput = screen.getByPlaceholderText('请再次输入密码')
    const emailInput = screen.getByPlaceholderText('用于找回密码的主邮箱')

    expect(usernameInput).toBeRequired()
    expect(passwordInputs[0]).toBeRequired()
    expect(confirmPasswordInput).toBeRequired()
    expect(emailInput).toBeRequired()
  })

  it('备用安全邮箱为选填', async () => {
    const user = userEvent.setup()

    render(<LoginPage />)

    await user.click(screen.getByText('没有账户？立即注册'))

    await waitFor(() => {
      const optionalEmailInput = screen.getByPlaceholderText('可选，最多2个安全邮箱')
      expect(optionalEmailInput).not.toBeRequired()
    })
  })

  it('安全邮箱输入类型为 email', async () => {
    const user = userEvent.setup()

    render(<LoginPage />)

    await user.click(screen.getByText('没有账户？立即注册'))

    await waitFor(() => {
      const emailInput = screen.getByPlaceholderText('用于找回密码的主邮箱')
      expect(emailInput).toHaveAttribute('type', 'email')
    })
  })

  it('密码输入类型为 password', () => {
    render(<LoginPage />)

    const passwordInput = screen.getByPlaceholderText('请输入密码')
    expect(passwordInput).toHaveAttribute('type', 'password')
  })
})

describe('LoginPage - UI 状态', () => {
  it('提交时按钮显示加载状态', async () => {
    const user = userEvent.setup()

    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: false, user_count: 1 })
      }),
      http.post('/api/auth/login', async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return HttpResponse.json({
          access_token: 'test-token',
          user: { id: 1, username: 'test', role: 'user' },
        })
      })
    )

    render(<LoginPage />)

    await waitFor(() => {
      expect(screen.getByText('登录以继续')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'test')
    await user.type(screen.getByPlaceholderText('请输入密码'), 'test')
    await user.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() => {
      expect(screen.getByText('请稍候…')).toBeInTheDocument()
    })
  })

  it('首次运行时隐藏返回登录按钮', async () => {
    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: true, user_count: 0 })
      })
    )

    render(<LoginPage />)

    await waitFor(() => {
      expect(screen.getByText('首次运行，请创建系统管理员')).toBeInTheDocument()
    })

    expect(screen.queryByText('已有账户？返回登录')).not.toBeInTheDocument()
  })

  it('登录页显示应用标题', () => {
    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: false, user_count: 1 })
      })
    )

    render(<LoginPage />)

    expect(screen.getByText('🧧 随礼记账本')).toBeInTheDocument()
  })

  it('注册按钮文本在登录模式为"登录"', () => {
    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: false, user_count: 1 })
      })
    )

    render(<LoginPage />)

    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument()
  })

  it('注册按钮文本在注册模式为"注册"', async () => {
    const user = userEvent.setup()

    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: false, user_count: 1 })
      })
    )

    render(<LoginPage />)

    await user.click(screen.getByText('没有账户？立即注册'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '注册' })).toBeInTheDocument()
    })
  })
})

describe('LoginPage - API 状态检查', () => {
  it('状态接口失败时默认显示登录表单', async () => {
    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ detail: 'Server error' }, { status: 500 })
      })
    )

    render(<LoginPage />)

    await waitFor(() => {
      expect(screen.getByText('登录以继续')).toBeInTheDocument()
    })
  })

  it('状态接口返回已有用户时不自动切换到注册', async () => {
    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: false, user_count: 5 })
      })
    )

    render(<LoginPage />)

    await waitFor(() => {
      expect(screen.getByText('登录以继续')).toBeInTheDocument()
    })

    expect(screen.queryByPlaceholderText('用于找回密码的主邮箱')).not.toBeInTheDocument()
  })
})
