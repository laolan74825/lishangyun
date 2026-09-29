import { describe, it, expect } from 'vitest'
import {
  generateEncryptionKey,
  exportKeyToBase64,
  importKeyFromBase64,
  encryptData,
  decryptData,
  hashMnemonic,
  verifyMnemonicHash,
  deriveKEK,
  wrapDEK,
  unwrapDEK,
} from '../lib/crypto'

describe('crypto', () => {
  it('generates and exports encryption key', async () => {
    const key = await generateEncryptionKey()
    expect(key).toBeDefined()
    expect(key.type).toBe('secret')

    const base64 = await exportKeyToBase64(key)
    expect(base64).toBeTruthy()
    expect(typeof base64).toBe('string')
  })

  it('imports key from base64', async () => {
    const key = await generateEncryptionKey()
    const base64 = await exportKeyToBase64(key)
    const imported = await importKeyFromBase64(base64)
    expect(imported).toBeDefined()
    expect(imported.type).toBe('secret')
  })

  it('encrypts and decrypts data', async () => {
    const key = await generateEncryptionKey()
    const plaintext = 'Hello, World! 测试中文'

    const { ciphertext, iv } = await encryptData(plaintext, key)
    expect(ciphertext).toBeTruthy()
    expect(iv).toBeTruthy()
    expect(ciphertext).not.toBe(plaintext)

    const decrypted = await decryptData(ciphertext, iv, key)
    expect(decrypted).toBe(plaintext)
  })

  it('produces different ciphertexts for same plaintext', async () => {
    const key = await generateEncryptionKey()
    const plaintext = 'same data'

    const result1 = await encryptData(plaintext, key)
    const result2 = await encryptData(plaintext, key)

    expect(result1.ciphertext).not.toBe(result2.ciphertext)
    expect(result1.iv).not.toBe(result2.iv)
  })

  it('fails to decrypt with wrong key', async () => {
    const key1 = await generateEncryptionKey()
    const key2 = await generateEncryptionKey()
    const plaintext = 'secret data'

    const { ciphertext, iv } = await encryptData(plaintext, key1)

    await expect(decryptData(ciphertext, iv, key2)).rejects.toThrow()
  })

  it('hashes mnemonic consistently', async () => {
    const mnemonic = 'abandon ability able about above absent absorb abstract absurd abuse access accident'

    const hash1 = await hashMnemonic(mnemonic)
    const hash2 = await hashMnemonic(mnemonic)

    expect(hash1).toBe(hash2)
    expect(hash1).toBeTruthy()
  })

  it('hashes mnemonic case-insensitively', async () => {
    const mnemonic1 = 'abandon ability able'
    const mnemonic2 = 'ABANDON ABILITY ABLE'

    const hash1 = await hashMnemonic(mnemonic1)
    const hash2 = await hashMnemonic(mnemonic2)

    expect(hash1).toBe(hash2)
  })

  it('verifies mnemonic hash', async () => {
    const mnemonic = 'abandon ability able about above absent absorb abstract absurd abuse access accident'
    const hash = await hashMnemonic(mnemonic)

    expect(await verifyMnemonicHash(mnemonic, hash)).toBe(true)
    expect(await verifyMnemonicHash('wrong mnemonic', hash)).toBe(false)
  })

  it('derives KEK from password consistently', async () => {
    const dek = await generateEncryptionKey()
    const kek1 = await deriveKEK('test-password')
    const kek2 = await deriveKEK('test-password')

    const wrapped1 = await wrapDEK(dek, kek1)
    const unwrapped2 = await unwrapDEK(wrapped1, kek2)

    const dekRaw = await exportKeyToBase64(dek)
    const unwrappedRaw = await exportKeyToBase64(unwrapped2)
    expect(unwrappedRaw).toBe(dekRaw)
  })

  it('wraps and unwraps DEK with password', async () => {
    const dek = await generateEncryptionKey()
    const password = 'my-secure-password'
    const kek = await deriveKEK(password)

    const wrapped = await wrapDEK(dek, kek)
    expect(wrapped).toBeTruthy()
    expect(typeof wrapped).toBe('string')

    const kek2 = await deriveKEK(password)
    const unwrapped = await unwrapDEK(wrapped, kek2)
    expect(unwrapped).toBeDefined()

    const dekRaw = await exportKeyToBase64(dek)
    const unwrappedRaw = await exportKeyToBase64(unwrapped)
    expect(unwrappedRaw).toBe(dekRaw)
  })

  it('wrapped DEK can encrypt/decrypt data after unwrap', async () => {
    const dek = await generateEncryptionKey()
    const kek = await deriveKEK('password123')
    const wrapped = await wrapDEK(dek, kek)

    const kek2 = await deriveKEK('password123')
    const unwrapped = await unwrapDEK(wrapped, kek2)

    const plaintext = 'sensitive data'
    const { ciphertext, iv } = await encryptData(plaintext, unwrapped)
    const decrypted = await decryptData(ciphertext, iv, unwrapped)
    expect(decrypted).toBe(plaintext)
  })

  it('fails to unwrap DEK with wrong password', async () => {
    const dek = await generateEncryptionKey()
    const kek = await deriveKEK('correct-password')
    const wrapped = await wrapDEK(dek, kek)

    const wrongKek = await deriveKEK('wrong-password')
    await expect(unwrapDEK(wrapped, wrongKek)).rejects.toThrow()
  })
})
