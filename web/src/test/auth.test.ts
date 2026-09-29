import { describe, it, expect, beforeEach } from 'vitest'
import {
  getToken,
  setToken,
  clearToken,
  isAuthenticated,
  getCurrentUser,
  setCurrentUser,
  isAdmin,
  hasRole,
  type AuthUser,
} from '../lib/auth'

describe('auth - Token 管理', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('getToken 返回 null 当无 token', () => {
    expect(getToken()).toBeNull()
  })

  it('setToken 保存 token 到 localStorage', () => {
    setToken('test-token-123')
    expect(localStorage.getItem('gr.access_token')).toBe('test-token-123')
    expect(getToken()).toBe('test-token-123')
  })

  it('clearToken 清除 token 和用户信息', () => {
    setToken('test-token')
    setCurrentUser({ id: 1, username: 'test', role: 'viewer' })

    clearToken()

    expect(getToken()).toBeNull()
    expect(getCurrentUser()).toBeNull()
  })

  it('isAuthenticated 根据 token 存在返回布尔值', () => {
    expect(isAuthenticated()).toBe(false)

    setToken('some-token')
    expect(isAuthenticated()).toBe(true)

    clearToken()
    expect(isAuthenticated()).toBe(false)
  })
})

describe('auth - 用户信息管理', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('getCurrentUser 返回 null 当无用户', () => {
    expect(getCurrentUser()).toBeNull()
  })

  it('setCurrentUser 保存用户信息到 localStorage', () => {
    const user: AuthUser = {
      id: 1,
      username: 'testuser',
      role: 'viewer',
      email: 'test@example.com',
    }

    setCurrentUser(user)

    const retrieved = getCurrentUser()
    expect(retrieved).toEqual(user)
  })

  it('getCurrentUser 处理旧格式（双重 JSON 字符串）', () => {
    const user: AuthUser = {
      id: 1,
      username: 'testuser',
      role: 'admin',
    }

    localStorage.setItem('gr.current_user', JSON.stringify(JSON.stringify(user)))

    const retrieved = getCurrentUser()
    expect(retrieved).toEqual(user)
  })

  it('getCurrentUser 返回 null 当数据格式错误', () => {
    localStorage.setItem('gr.current_user', 'invalid json')
    expect(getCurrentUser()).toBeNull()
  })
})

describe('auth - 角色检查', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('isAdmin 对 super_admin 返回 true', () => {
    setCurrentUser({ id: 1, username: 'admin', role: 'super_admin' })
    expect(isAdmin()).toBe(true)
  })

  it('isAdmin 对 admin 返回 true', () => {
    setCurrentUser({ id: 2, username: 'admin2', role: 'admin' })
    expect(isAdmin()).toBe(true)
  })

  it('isAdmin 对普通 user 返回 false', () => {
    setCurrentUser({ id: 3, username: 'viewer', role: 'viewer' })
    expect(isAdmin()).toBe(false)
  })

  it('isAdmin 对无用户返回 false', () => {
    expect(isAdmin()).toBe(false)
  })

  it('hasRole 检查单个角色', () => {
    setCurrentUser({ id: 1, username: 'editor', role: 'editor' })

    expect(hasRole('editor')).toBe(true)
    expect(hasRole('admin')).toBe(false)
  })

  it('hasRole 检查多个角色', () => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin' })

    expect(hasRole('super_admin', 'admin')).toBe(true)
    expect(hasRole('viewer', 'editor')).toBe(false)
  })

  it('hasRole 对无用户返回 false', () => {
    expect(hasRole('viewer')).toBe(false)
  })
})

describe('auth - 用户角色类型', () => {
  it('支持所有定义的角色类型', () => {
    const roles: AuthUser['role'][] = ['super_admin', 'admin', 'editor', 'viewer', 'auditor']

    roles.forEach(role => {
      const user: AuthUser = { id: 1, username: 'test', role }
      setCurrentUser(user)
      expect(getCurrentUser()?.role).toBe(role)
    })
  })
})
