/**
 * 客户端标识与 UUID 工具
 * 需求 F-4.5/2.3.2：每笔记录携带全局唯一 ID（UUID）防止重复写入；
 * 每个终端拥有稳定的 client_id，用于操作日志与终端设置。
 */

const CLIENT_ID_KEY = 'gr.client_id'

export function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(CLIENT_ID_KEY, id)
  }
  return id
}

export function newRecordUuid(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}
