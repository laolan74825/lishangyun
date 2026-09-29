const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  )
}

export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return arrayBufferToBase64(raw)
}

export async function importKeyFromBase64(base64: string): Promise<CryptoKey> {
  const raw = base64ToArrayBuffer(base64)
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  )
}

export async function encryptData(
  data: string,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder()
  const plaintext = encoder.encode(data)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    plaintext
  )

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer),
  }
}

export async function decryptData(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const encryptedData = base64ToArrayBuffer(ciphertext)
  const ivBuffer = base64ToArrayBuffer(iv)

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: ivBuffer },
    key,
    encryptedData
  )

  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

export async function hashMnemonic(mnemonic: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(mnemonic.trim().toLowerCase())
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return arrayBufferToBase64(hashBuffer)
}

export async function verifyMnemonicHash(mnemonic: string, hash: string): Promise<boolean> {
  const computed = await hashMnemonic(mnemonic)
  return computed === hash
}

const PBKDF2_ITERATIONS = 600_000
const KEK_SALT = new TextEncoder().encode('GiftRegistry-EnhancedSecurity-KEK-Salt-v1')

export async function deriveKEK(password: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: KEK_SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  )
}

export async function wrapDEK(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const wrapped = await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv })
  const combined = new Uint8Array(IV_LENGTH + wrapped.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(wrapped), IV_LENGTH)
  return arrayBufferToBase64(combined.buffer)
}

export async function unwrapDEK(wrappedBase64: string, kek: CryptoKey): Promise<CryptoKey> {
  const combined = new Uint8Array(base64ToArrayBuffer(wrappedBase64))
  const iv = combined.slice(0, IV_LENGTH)
  const data = combined.slice(IV_LENGTH)
  return crypto.subtle.unwrapKey(
    'raw', data, kek,
    { name: 'AES-GCM', iv },
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  )
}
