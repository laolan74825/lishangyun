import { clearToken, getToken } from './auth'

const API_BASE = '/api'

export class ApiError extends Error {
  /** status === 0 表示网络层失败（服务器不可达），而非 HTTP 错误 */
  constructor(public status: number, public detail: string) {
    super(detail)
    this.name = 'ApiError'
  }
}

export const NETWORK_ERROR_MESSAGE = '无法连接到服务器，请确认后端服务和数据库已启动'

function isNetworkFailure(err: unknown): boolean {
  // fetch 在网络失败时抛出 TypeError（如 Failed to fetch / 网络错误）
  return err instanceof TypeError
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
    })
  } catch (err) {
    if (isNetworkFailure(err)) {
      throw new ApiError(0, NETWORK_ERROR_MESSAGE)
    }
    throw err
  }

  if (res.status === 401) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || body.message || detail
    } catch { /* ignore */ }
    if (!path.includes('/auth/login')) {
      clearToken()
      redirectToLogin()
    }
    throw new ApiError(401, detail)
  }

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || body.message || detail
    } catch { /* ignore */ }
    throw new ApiError(res.status, detail)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

// 无需登录即可访问的公开页：已在这些页面时 401 不再跳转，否则会造成
// 整页反复刷新（登录页挂载的公共组件请求 401 → 跳登录 → 再 401 的死循环）
const PUBLIC_PAGES = ['/login', '/password-reset']

function redirectToLogin() {
  if (!PUBLIC_PAGES.includes(window.location.pathname)) {
    window.location.href = '/login'
  }
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path)
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'POST', body: body != null ? JSON.stringify(body) : undefined })
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'PUT', body: body != null ? JSON.stringify(body) : undefined })
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'PATCH', body: body != null ? JSON.stringify(body) : undefined })
  },
  delete<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'DELETE', body: body != null ? JSON.stringify(body) : undefined })
  },
  async getBlob(path: string): Promise<Blob> {
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    let res: Response
    try {
      res = await fetch(`${API_BASE}${path}`, { headers })
    } catch (err) {
      if (isNetworkFailure(err)) {
        throw new ApiError(0, NETWORK_ERROR_MESSAGE)
      }
      throw err
    }
    if (res.status === 401) {
      clearToken()
      redirectToLogin()
      throw new ApiError(401, '未授权')
    }
    if (!res.ok) {
      let detail = res.statusText
      try {
        const body = await res.json()
        detail = body.detail || body.message || detail
      } catch { /* ignore */ }
      throw new ApiError(res.status, detail)
    }
    return res.blob()
  },
}
