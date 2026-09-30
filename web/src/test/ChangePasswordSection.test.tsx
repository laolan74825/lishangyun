import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { ChangePasswordSection } from '../pages/SettingsPage'
import { render, userEvent } from './utils'

const server = setupServer()

beforeEach(() => {
  localStorage.clear()
})

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

function renderSection(showToast = vi.fn()) {
  render(<ChangePasswordSection showToast={showToast} />)
  return showToast
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('输入当前密码'), 'old-pass')
  await user.type(screen.getByPlaceholderText('至少 6 位'), 'new-pass-1')
  await user.type(screen.getByPlaceholderText('再次输入新密码'), 'new-pass-1')
  await user.click(screen.getByRole('button', { name: '修改密码' }))
}

describe('ChangePasswordSection - 当前密码错误提示', () => {
  it('当前密码错误时，在输入框下方显示红色提示而非 Toast', async () => {
    const user = userEvent.setup()
    const showToast = renderSection()

    server.use(
      http.put('/api/auth/password', () => {
        return HttpResponse.json({ detail: '原密码错误' }, { status: 400 })
      })
    )

    await fillAndSubmit(user)

    await waitFor(() => {
      expect(screen.getByText('原密码错误')).toBeInTheDocument()
    })

    // 提示显示在当前密码输入框下方
    const input = screen.getByPlaceholderText('输入当前密码')
    expect(input.nextElementSibling?.textContent).toBe('原密码错误')
    // 输入框边框标记为错误态
    expect(input.className).toContain('border-danger')
    // 不弹 Toast
    expect(showToast).not.toHaveBeenCalled()
  })

  it('修改当前密码输入内容后，错误提示自动消失', async () => {
    const user = userEvent.setup()
    renderSection()

    server.use(
      http.put('/api/auth/password', () => {
        return HttpResponse.json({ detail: '原密码错误' }, { status: 400 })
      })
    )

    await fillAndSubmit(user)

    await waitFor(() => {
      expect(screen.getByText('原密码错误')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('输入当前密码')
    await user.type(input, 'x')

    expect(screen.queryByText('原密码错误')).not.toBeInTheDocument()
    expect(input.className).not.toContain('border-danger')
  })

  it('修改成功后清空表单并提示，不残留错误信息', async () => {
    const user = userEvent.setup()
    const showToast = renderSection()

    server.use(
      http.put('/api/auth/password', () => {
        return HttpResponse.json({ message: 'ok' })
      })
    )

    await fillAndSubmit(user)

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('密码已修改')
    })

    expect(screen.getByPlaceholderText('输入当前密码')).toHaveValue('')
    expect(screen.queryByText('原密码错误')).not.toBeInTheDocument()
  })

  it('其他类型错误仍走 Toast 提示', async () => {
    const user = userEvent.setup()
    const showToast = renderSection()

    server.use(
      http.put('/api/auth/password', () => {
        return HttpResponse.json({ detail: '服务器繁忙' }, { status: 500 })
      })
    )

    await fillAndSubmit(user)

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('服务器繁忙')
    })

    // 输入框下方不显示内联错误
    expect(screen.queryByText('服务器繁忙')).not.toBeInTheDocument()
  })
})
