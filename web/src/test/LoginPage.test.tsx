import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
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

    expect(screen.getByPlaceholderText('用于注册和找回账号')).toBeInTheDocument()
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
    expect(screen.queryByPlaceholderText('用于注册和找回账号')).not.toBeInTheDocument()
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

    await user.type(screen.getByPlaceholderText('请输入用户名或手机号'), 'testuser')
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

    await user.type(screen.getByPlaceholderText('请输入用户名或手机号'), 'wronguser')
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

    await user.type(screen.getByPlaceholderText('请输入用户名或手机号'), 'test')
    await user.type(screen.getByPlaceholderText('请输入密码'), 'test')
    await user.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() => {
      expect(screen.getByText('token expired')).toBeInTheDocument()
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
      expect(screen.getByPlaceholderText('用于注册和找回账号')).toBeInTheDocument()
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
      expect(screen.queryByPlaceholderText('用于注册和找回账号')).not.toBeInTheDocument()
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
    await user.type(screen.getByPlaceholderText('用于注册和找回账号'), '13800001234')

    const form = document.querySelector('form')!
    fireEvent.submit(form)

    expect(await screen.findByText('两次输入的密码不一致')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('注册时手机号格式错误显示错误', async () => {
    const user = userEvent.setup()

    render(<LoginPage />)

    await user.click(screen.getByText('没有账户？立即注册'))

    await waitFor(() => {
      expect(screen.getByText('创建新账户')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'newuser')
    await user.type(screen.getAllByPlaceholderText('请输入密码')[0], 'password123')
    await user.type(screen.getByPlaceholderText('请再次输入密码'), 'password123')
    await user.type(screen.getByPlaceholderText('用于注册和找回账号'), '123456')
    await user.type(screen.getByPlaceholderText('短信验证码'), '123456')
    await user.click(screen.getByRole('checkbox'))

    fireEvent.submit(document.querySelector('form')!)

    expect(await screen.findByText('请输入正确的 11 位手机号')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('成功注册第一个用户（super_admin）', async () => {
    const user = userEvent.setup()

    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: true, user_count: 0 })
      }),
      http.post('/api/auth/send-sms-code', () => {
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
    await user.type(screen.getByPlaceholderText('用于注册和找回账号'), '13800001234')
    await user.type(screen.getByPlaceholderText('短信验证码'), '123456')
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
      http.post('/api/auth/send-sms-code', () => {
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
    await user.type(screen.getByPlaceholderText('用于注册和找回账号'), '13800001234')
    await user.type(screen.getByPlaceholderText('短信验证码'), '123456')
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
      http.post('/api/auth/send-sms-code', () => {
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
    await user.type(screen.getByPlaceholderText('用于注册和找回账号'), '13800001234')
    await user.type(screen.getByPlaceholderText('短信验证码'), '123456')
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
      http.post('/api/auth/send-sms-code', () => {
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
    await user.type(screen.getByPlaceholderText('用于注册和找回账号'), '13800001234')
    await user.type(screen.getByPlaceholderText('短信验证码'), '123456')
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

    const usernameInput = screen.getByPlaceholderText('请输入用户名或手机号')
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
    const phoneInput = screen.getByPlaceholderText('用于注册和找回账号')
    const smsCodeInput = screen.getByPlaceholderText('短信验证码')
    const emailInput = screen.getByPlaceholderText('用于找回密码，可稍后在设置中绑定')

    expect(usernameInput).not.toBeRequired()
    expect(passwordInputs[0]).toBeRequired()
    expect(confirmPasswordInput).toBeRequired()
    expect(phoneInput).toBeRequired()
    expect(smsCodeInput).toBeRequired()
    expect(emailInput).not.toBeRequired()
  })

  it('安全邮箱为选填', async () => {
    const user = userEvent.setup()

    render(<LoginPage />)

    await user.click(screen.getByText('没有账户？立即注册'))

    await waitFor(() => {
      const optionalEmailInput = screen.getByPlaceholderText('用于找回密码，可稍后在设置中绑定')
      expect(optionalEmailInput).not.toBeRequired()
    })
  })

  it('安全邮箱输入类型为 email', async () => {
    const user = userEvent.setup()

    render(<LoginPage />)

    await user.click(screen.getByText('没有账户？立即注册'))

    await waitFor(() => {
      const emailInput = screen.getByPlaceholderText('用于找回密码，可稍后在设置中绑定')
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

    await user.type(screen.getByPlaceholderText('请输入用户名或手机号'), 'test')
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

    expect(screen.getByText('🧧 礼尚云')).toBeInTheDocument()
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

describe('LoginPage - 内联错误提示', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: false, user_count: 1 })
      })
    )
  })

  it('登录失败时错误显示在密码输入框下方并标记红色边框', async () => {
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

    await user.type(screen.getByPlaceholderText('请输入用户名或手机号'), 'wronguser')
    await user.type(screen.getByPlaceholderText('请输入密码'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() => {
      expect(screen.getByText('用户名或密码错误')).toBeInTheDocument()
    })

    // 提示位于密码输入框下方，且密码框带错误边框
    const passwordInput = screen.getByPlaceholderText('请输入密码')
    expect(passwordInput.nextElementSibling?.textContent).toBe('用户名或密码错误')
    expect(passwordInput.className).toContain('border-danger')
    // 不再是顶部横幅形式
    expect(document.querySelector('.bg-danger\\/10')).toBeNull()
  })

  it('修改密码输入内容后错误提示消失', async () => {
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

    await user.type(screen.getByPlaceholderText('请输入用户名或手机号'), 'wronguser')
    const passwordInput = screen.getByPlaceholderText('请输入密码')
    await user.type(passwordInput, 'wrongpass')
    await user.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() => {
      expect(screen.getByText('用户名或密码错误')).toBeInTheDocument()
    })

    await user.type(passwordInput, 'x')

    expect(screen.queryByText('用户名或密码错误')).not.toBeInTheDocument()
    expect(passwordInput.className).not.toContain('border-danger')
  })
})

describe('LoginPage - 密码可见性', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: false, user_count: 1 })
      })
    )
  })

  it('密码输入框不再有自定义眼睛按钮，保持原生 password 类型', () => {
    render(<LoginPage />)

    const passwordInput = screen.getByPlaceholderText('请输入密码')
    expect(passwordInput).toHaveAttribute('type', 'password')
    // 密码框容器内没有自定义可见性切换按钮
    expect(passwordInput.parentElement?.querySelector('button')).toBeNull()
  })
})

describe('LoginPage - 注册表单内联错误提示', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/auth/status', () => {
        return HttpResponse.json({ needs_init: false, user_count: 1 })
      })
    )
  })

  async function openRegisterForm(user: ReturnType<typeof userEvent.setup>) {
    render(<LoginPage />)
    await waitFor(() => {
      expect(screen.getByText('登录以继续')).toBeInTheDocument()
    })
    await user.click(screen.getByText('没有账户？立即注册'))
    await waitFor(() => {
      expect(screen.getByText('创建新账户')).toBeInTheDocument()
    })
  }

  it('两次密码不一致时错误显示在确认密码框下方', async () => {
    const user = userEvent.setup()
    await openRegisterForm(user)

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'newuser')
    await user.type(screen.getAllByPlaceholderText('请输入密码')[0], 'password123')
    const confirmInput = screen.getByPlaceholderText('请再次输入密码')
    await user.type(confirmInput, 'password456')

    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(screen.getByText('两次输入的密码不一致')).toBeInTheDocument()
    })

    expect(confirmInput.nextElementSibling?.textContent).toBe('两次输入的密码不一致')
    expect(confirmInput.className).toContain('border-danger')
  })

  it('注册接口错误（用户名已存在）显示在用户名的输入框下方', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('/api/auth/send-sms-code', () => {
        return HttpResponse.json({ message: 'ok' })
      }),
      http.post('/api/auth/register', () => {
        return HttpResponse.json({ detail: '用户名已存在' }, { status: 400 })
      })
    )

    await openRegisterForm(user)

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'existinguser')
    await user.type(screen.getAllByPlaceholderText('请输入密码')[0], 'password123')
    await user.type(screen.getByPlaceholderText('请再次输入密码'), 'password123')
    await user.type(screen.getByPlaceholderText('用于注册和找回账号'), '13800001234')
    await user.type(screen.getByPlaceholderText('短信验证码'), '123456')
    await user.click(screen.getByRole('checkbox'))

    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(screen.getByText('用户名已存在')).toBeInTheDocument()
    })

    const usernameInput = screen.getByPlaceholderText('请输入用户名')
    const field = usernameInput.parentElement!
    expect(within(field).getByText('用户名已存在')).toBeInTheDocument()
    expect(usernameInput.className).toContain('border-danger')
  })

  it('未同意用户协议时错误显示在协议勾选下方', async () => {
    const user = userEvent.setup()

    server.use(
      http.post('/api/auth/send-sms-code', () => {
        return HttpResponse.json({ message: 'ok' })
      })
    )

    await openRegisterForm(user)

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'newuser')
    await user.type(screen.getAllByPlaceholderText('请输入密码')[0], 'password123')
    await user.type(screen.getByPlaceholderText('请再次输入密码'), 'password123')
    await user.type(screen.getByPlaceholderText('用于注册和找回账号'), '13800001234')
    await user.type(screen.getByPlaceholderText('短信验证码'), '123456')

    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(screen.getByText('请先阅读并同意用户协议')).toBeInTheDocument()
    })
  })

  it('修改字段内容后对应的错误提示消失', async () => {
    const user = userEvent.setup()
    await openRegisterForm(user)

    await user.type(screen.getByPlaceholderText('请输入用户名'), 'newuser')
    await user.type(screen.getAllByPlaceholderText('请输入密码')[0], 'password123')
    const confirmInput = screen.getByPlaceholderText('请再次输入密码')
    await user.type(confirmInput, 'password456')

    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(screen.getByText('两次输入的密码不一致')).toBeInTheDocument()
    })

    await user.type(confirmInput, 'x')

    expect(screen.queryByText('两次输入的密码不一致')).not.toBeInTheDocument()
    expect(confirmInput.className).not.toContain('border-danger')
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

    expect(screen.queryByPlaceholderText('用于注册和找回账号')).not.toBeInTheDocument()
  })
})


describe('LoginPage - 用户名为选填', () => {
  it('注册时留空用户名，请求体不包含 username 字段', async () => {
    let requestBody: Record<string, unknown> | null = null
    server.use(
      http.post('/api/auth/register', async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          access_token: 'fake-token',
          user: { id: 9, username: '用户_20260009', role: 'user' },
        })
      }),
    )

    const user = userEvent.setup()
    render(<LoginPage />)

    await user.click(screen.getByText('没有账户？立即注册'))
    await waitFor(() => {
      expect(screen.getByText('创建新账户')).toBeInTheDocument()
    })

    await user.type(screen.getAllByPlaceholderText('请输入密码')[0], 'password123')
    await user.type(screen.getByPlaceholderText('请再次输入密码'), 'password123')
    await user.type(screen.getByPlaceholderText('用于注册和找回账号'), '13800001234')
    await user.type(screen.getByPlaceholderText('短信验证码'), '123456')
    await user.click(screen.getByRole('checkbox'))

    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => {
      expect(requestBody).not.toBeNull()
    })
    expect(requestBody).not.toHaveProperty('username')
  })
})
