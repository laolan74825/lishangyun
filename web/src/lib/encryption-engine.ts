import { encryptData, decryptData, importKeyFromBase64, exportKeyToBase64, deriveKEK, wrapDEK, unwrapDEK } from './crypto'
import { getStoredEncryptionKey, storeEncryptionKey } from './secure-storage'
import { api } from './api'

interface EncryptedPayload {
  ciphertext: string
  iv: string
}

let cachedKey: CryptoKey | null = null

export async function loadKeyFromStorage(): Promise<CryptoKey | null> {
  if (cachedKey) return cachedKey
  const stored = await getStoredEncryptionKey()
  if (!stored) return null
  cachedKey = await importKeyFromBase64(stored)
  return cachedKey
}

export async function initEncryptionKey(rawKeyBase64: string): Promise<CryptoKey> {
  cachedKey = await importKeyFromBase64(rawKeyBase64)
  await storeEncryptionKey(rawKeyBase64)
  return cachedKey
}

export function clearCachedKey(): void {
  cachedKey = null
}

export async function encryptPayload(data: unknown): Promise<EncryptedPayload> {
  const key = await loadKeyFromStorage()
  if (!key) throw new Error('加密密钥未初始化')
  const json = JSON.stringify(data)
  return encryptData(json, key)
}

export async function decryptPayload(payload: EncryptedPayload): Promise<unknown> {
  const key = await loadKeyFromStorage()
  if (!key) throw new Error('加密密钥未初始化')
  const json = await decryptData(payload.ciphertext, payload.iv, key)
  return JSON.parse(json)
}

export async function encryptApiPayload(data: unknown): Promise<{ encrypted_data: string; encrypted_iv: string }> {
  const result = await encryptPayload(data)
  return { encrypted_data: result.ciphertext, encrypted_iv: result.iv }
}

export async function decryptApiResponse(
  response: { encrypted_data: string; encrypted_iv: string }
): Promise<unknown> {
  return decryptPayload({ ciphertext: response.encrypted_data, iv: response.encrypted_iv })
}

export async function encryptAndUpload(
  method: 'POST' | 'PUT',
  url: string,
  data: unknown,
): Promise<unknown> {
  const encrypted = await encryptApiPayload(data)
  if (method === 'POST') {
    return api.post(url, encrypted)
  }
  return api.put(url, encrypted)
}

export async function downloadAndDecrypt(url: string): Promise<unknown> {
  const response = await api.get<{ encrypted_data: string; encrypted_iv: string }>(url)
  return decryptApiResponse(response)
}

export async function exportKeyForBackup(): Promise<string> {
  const key = await loadKeyFromStorage()
  if (!key) throw new Error('加密密钥未初始化')
  return exportKeyToBase64(key)
}

export function isEncryptionReady(): boolean {
  return cachedKey !== null
}

export async function wrapKeyForServer(dek: CryptoKey, password: string): Promise<string> {
  const kek = await deriveKEK(password)
  return wrapDEK(dek, kek)
}

export async function loadUnwrappedKey(wrappedBase64: string, password: string): Promise<CryptoKey> {
  const kek = await deriveKEK(password)
  const dek = await unwrapDEK(wrappedBase64, kek)
  cachedKey = dek
  await storeEncryptionKey(await exportKeyToBase64(dek))
  return dek
}
