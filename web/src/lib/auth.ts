const TOKEN_KEY = 'gr.access_token'
const USER_KEY = 'gr.current_user'

// 角色体系：一般用户(user) / 系统管理员(admin) / 超级管理员(super_admin)
export type UserRole = 'super_admin' | 'admin' | 'user'

export interface AuthUser {
  id: number
  username: string
  role: UserRole
  email?: string
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

export function getCurrentUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'string') {
      return JSON.parse(parsed)
    }
    return parsed
  } catch {
    return null
  }
}

export function setCurrentUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function isAdmin(): boolean {
  const user = getCurrentUser()
  return user?.role === 'super_admin' || user?.role === 'admin'
}

export function hasRole(...roles: UserRole[]): boolean {
  const user = getCurrentUser()
  return user ? roles.includes(user.role) : false
}
