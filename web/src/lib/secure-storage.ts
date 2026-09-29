import Dexie, { type Table } from 'dexie'

interface StoredKey {
  id: string
  encryptedKey: string
  createdAt: number
}

class SecureStorageDB extends Dexie {
  keys!: Table<StoredKey, string>

  constructor() {
    super('GiftRegistrySecureStorage')
    this.version(1).stores({
      keys: 'id, createdAt',
    })
  }
}

const secureDb = new SecureStorageDB()

const ENCRYPTION_KEY_ID = 'user_encryption_key'

export async function storeEncryptionKey(encryptedKeyBase64: string): Promise<void> {
  await secureDb.keys.put({
    id: ENCRYPTION_KEY_ID,
    encryptedKey: encryptedKeyBase64,
    createdAt: Date.now(),
  })
}

export async function getStoredEncryptionKey(): Promise<string | undefined> {
  const record = await secureDb.keys.get(ENCRYPTION_KEY_ID)
  return record?.encryptedKey
}

export async function clearStoredEncryptionKey(): Promise<void> {
  await secureDb.keys.delete(ENCRYPTION_KEY_ID)
}

export async function hasStoredKey(): Promise<boolean> {
  const record = await secureDb.keys.get(ENCRYPTION_KEY_ID)
  return record !== undefined
}

export async function clearAllSecureStorage(): Promise<void> {
  await secureDb.keys.clear()
}
