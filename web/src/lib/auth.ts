const TOKEN_KEY = 'gr.access_token'
const USER_KEY = 'gr.current_user'

export interface AuthUser {
  id: number
  username: string
  role: 'admin' | 'editor' | 'viewer'
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
    // Handle double-serialized data
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
