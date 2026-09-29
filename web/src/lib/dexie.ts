import Dexie, { type Table } from 'dexie'
import type { GbRecord, DailyRecord, Person, Guestbook } from '../types'

export interface SyncableGbRecord extends GbRecord {
  _syncedAt?: number
  _pendingSync?: boolean
  _updatedAt?: number
  _deleted?: boolean
  sync_version?: number
}

export interface SyncableDailyRecord extends DailyRecord {
  _syncedAt?: number
  _pendingSync?: boolean
  _updatedAt?: number
  _deleted?: boolean
  sync_version?: number
}

export interface SyncablePerson extends Person {
  _syncedAt?: number
  _pendingSync?: boolean
  _updatedAt?: number
  _deleted?: boolean
  sync_version?: number
}

export interface CachedGuestbook extends Guestbook {
  _cachedAt: number
}

export class GiftRegistryDB extends Dexie {
  gbRecords!: Table<SyncableGbRecord, number>
  dailyRecords!: Table<SyncableDailyRecord, number>
  persons!: Table<SyncablePerson, number>
  guestbooks!: Table<CachedGuestbook, number>

  constructor() {
    super('GiftRegistryDB')
    this.version(1).stores({
      gbRecords: '++id, guestbook_id, uuid, guest_name, record_time, _syncedAt, _pendingSync',
      dailyRecords: '++id, uuid, person_id, type, event_date, _syncedAt, _pendingSync',
      persons: '++id, name, phone, relation_tag, _syncedAt, _pendingSync',
    })
    this.version(2).stores({
      gbRecords: '++id, guestbook_id, uuid, guest_name, record_time, _syncedAt, _pendingSync, _updatedAt, _deleted',
      dailyRecords: '++id, uuid, person_id, type, event_date, _syncedAt, _pendingSync, _updatedAt, _deleted',
      persons: '++id, uuid, name, phone, relation_tag, _syncedAt, _pendingSync, _updatedAt, _deleted',
    }).upgrade(tx => {
      return Promise.all([
        tx.table('gbRecords').toCollection().modify(r => {
          if (!r.uuid) r.uuid = crypto.randomUUID()
          r._updatedAt = Date.now()
          r._deleted = false
        }),
        tx.table('dailyRecords').toCollection().modify(r => {
          if (!r.uuid) r.uuid = crypto.randomUUID()
          r._updatedAt = Date.now()
          r._deleted = false
        }),
        tx.table('persons').toCollection().modify(r => {
          if (!r.uuid) r.uuid = crypto.randomUUID()
          r._updatedAt = Date.now()
          r._deleted = false
        }),
      ])
    })
    this.version(3).stores({
      gbRecords: '++id, guestbook_id, uuid, guest_name, record_time, _syncedAt, _pendingSync, _updatedAt, _deleted',
      dailyRecords: '++id, uuid, person_id, type, event_date, _syncedAt, _pendingSync, _updatedAt, _deleted',
      persons: '++id, uuid, name, phone, relation_tag, _syncedAt, _pendingSync, _updatedAt, _deleted',
      guestbooks: 'id, status, _cachedAt',
    })
  }
}

export const db = new GiftRegistryDB()

export async function saveLocalRecord(record: GbRecord): Promise<void> {
  await db.gbRecords.put({ ...record, _syncedAt: 0, _pendingSync: true, _updatedAt: Date.now(), _deleted: false })
}

export async function saveLocalDailyRecord(record: DailyRecord): Promise<void> {
  await db.dailyRecords.put({ ...record, _syncedAt: 0, _pendingSync: true, _updatedAt: Date.now(), _deleted: false })
}

export async function saveLocalPerson(person: Person): Promise<void> {
  await db.persons.put({ ...person, _syncedAt: 0, _pendingSync: true, _updatedAt: Date.now(), _deleted: false })
}

export async function markAsSynced(table: 'gbRecords' | 'dailyRecords' | 'persons', id: number): Promise<void> {
  await db[table].update(id, { _syncedAt: Date.now(), _pendingSync: false })
}

export async function getPendingSyncRecords(table: 'gbRecords' | 'dailyRecords' | 'persons') {
  return db[table].filter((r) => r._pendingSync === true).toArray()
}

export async function softDeleteLocalRecord(
  table: 'gbRecords' | 'dailyRecords' | 'persons',
  id: number
): Promise<void> {
  await db[table].update(id, { _deleted: true, _updatedAt: Date.now(), _pendingSync: true })
}

export async function clearAllLocalData(): Promise<void> {
  await db.gbRecords.clear()
  await db.dailyRecords.clear()
  await db.persons.clear()
  await db.guestbooks.clear()
}

export async function cacheGuestbook(guestbook: Guestbook): Promise<void> {
  await db.guestbooks.put({ ...guestbook, _cachedAt: Date.now() } as CachedGuestbook)
}

export async function cacheGuestbooks(guestbooks: Guestbook[]): Promise<void> {
  const cached = guestbooks.map((g) => ({ ...g, _cachedAt: Date.now() } as CachedGuestbook))
  await db.guestbooks.bulkPut(cached)
}

export async function getCachedGuestbook(id: number): Promise<CachedGuestbook | undefined> {
  return db.guestbooks.get(id)
}

export async function getActiveGuestbooks(): Promise<CachedGuestbook[]> {
  return db.guestbooks.where('status').equals('active').toArray()
}

export async function getCachedGbRecords(guestbookId: number): Promise<SyncableGbRecord[]> {
  return db.gbRecords.where('guestbook_id').equals(guestbookId).toArray()
}
