import { describe, it, expect, beforeEach } from 'vitest'
import {
  db,
  saveLocalRecord,
  saveLocalDailyRecord,
  saveLocalPerson,
  getPendingSyncRecords,
  markAsSynced,
  softDeleteLocalRecord,
  cacheGuestbook,
  cacheGuestbooks,
  getCachedGuestbook,
  getActiveGuestbooks,
  getCachedGbRecords,
  clearAllLocalData,
} from '../lib/dexie'
import type { GbRecord, DailyRecord, Person, Guestbook } from '../types'

const mockGbRecord = (overrides?: Partial<GbRecord>): GbRecord => ({
  uuid: crypto.randomUUID(),
  guestbook_id: 1,
  guest_name: '张三',
  amount: 50000,
  payment_method: 'cash',
  check_status: 'unchecked',
  record_time: new Date().toISOString(),
  created_at: new Date().toISOString(),
  ...overrides,
})

const mockDailyRecord = (overrides?: Partial<DailyRecord>): DailyRecord => ({
  uuid: crypto.randomUUID(),
  type: 'in',
  person_name: '李四',
  amount: 20000,
  event_type: '其他',
  event_date: '2026-01-01',
  source: 'daily',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

const mockPerson = (overrides?: Partial<Person>): Person => ({
  name: '王五',
  aliases: [],
  relation_tag: '朋友',
  created_at: new Date().toISOString(),
  ...overrides,
})

const mockGuestbook = (overrides?: Partial<Guestbook>): Guestbook => ({
  id: 1,
  name: '婚礼',
  event_type: '婚礼',
  event_date: '2026-06-01',
  status: 'active',
  created_at: new Date().toISOString(),
  ...overrides,
})

describe('dexie', () => {
  beforeEach(async () => {
    await clearAllLocalData()
  })

  describe('saveLocalRecord', () => {
    it('保存收礼记录到 IndexedDB', async () => {
      const record = mockGbRecord()
      await saveLocalRecord(record)
      const saved = await db.gbRecords.toArray()
      expect(saved).toHaveLength(1)
      expect(saved[0].guest_name).toBe('张三')
      expect(saved[0]._pendingSync).toBe(true)
      expect(saved[0]._syncedAt).toBe(0)
    })
  })

  describe('saveLocalDailyRecord', () => {
    it('保存日常记录到 IndexedDB', async () => {
      const record = mockDailyRecord()
      await saveLocalDailyRecord(record)
      const saved = await db.dailyRecords.toArray()
      expect(saved).toHaveLength(1)
      expect(saved[0].person_name).toBe('李四')
      expect(saved[0]._pendingSync).toBe(true)
    })
  })

  describe('saveLocalPerson', () => {
    it('保存人员到 IndexedDB', async () => {
      const person = mockPerson()
      await saveLocalPerson(person)
      const saved = await db.persons.toArray()
      expect(saved).toHaveLength(1)
      expect(saved[0].name).toBe('王五')
    })
  })

  describe('getPendingSyncRecords', () => {
    it('返回待同步记录', async () => {
      await saveLocalRecord(mockGbRecord())
      await saveLocalRecord(mockGbRecord())
      const pending = await getPendingSyncRecords('gbRecords')
      expect(pending).toHaveLength(2)
    })

    it('markAsSynced 后不再返回', async () => {
      await saveLocalRecord(mockGbRecord())
      const records = await db.gbRecords.toArray()
      const record = records[0]
      expect(record).toBeDefined()
      await markAsSynced('gbRecords', record!.id!)
      const pending = await getPendingSyncRecords('gbRecords')
      expect(pending).toHaveLength(0)
    })
  })

  describe('softDeleteLocalRecord', () => {
    it('标记记录为已删除', async () => {
      await saveLocalRecord(mockGbRecord())
      const records = await db.gbRecords.toArray()
      const record = records[0]
      await softDeleteLocalRecord('gbRecords', record!.id!)
      const deleted = await db.gbRecords.get(record!.id!)
      expect(deleted?._deleted).toBe(true)
      expect(deleted?._pendingSync).toBe(true)
    })
  })

  describe('guestbook caching', () => {
    it('cacheGuestbook 缓存单个礼簿', async () => {
      const gb = mockGuestbook()
      await cacheGuestbook(gb)
      const cached = await getCachedGuestbook(1)
      expect(cached).toBeDefined()
      expect(cached!.name).toBe('婚礼')
      expect(cached!._cachedAt).toBeGreaterThan(0)
    })

    it('cacheGuestbooks 批量缓存', async () => {
      const gbs = [
        mockGuestbook({ id: 1, name: '婚礼', status: 'active' }),
        mockGuestbook({ id: 2, name: '生日', status: 'active' }),
        mockGuestbook({ id: 3, name: '葬礼', status: 'archived' }),
      ]
      await cacheGuestbooks(gbs)
      const active = await getActiveGuestbooks()
      expect(active).toHaveLength(2)
    })

    it('getActiveGuestbooks 只返回收礼中的礼簿', async () => {
      await cacheGuestbooks([
        mockGuestbook({ id: 1, status: 'active' }),
        mockGuestbook({ id: 2, status: 'archived' }),
      ])
      const active = await getActiveGuestbooks()
      expect(active).toHaveLength(1)
      expect(active[0].status).toBe('active')
    })
  })

  describe('getCachedGbRecords', () => {
    it('按 guestbook_id 查询本地记录', async () => {
      await saveLocalRecord(mockGbRecord({ guestbook_id: 1 }))
      await saveLocalRecord(mockGbRecord({ guestbook_id: 1 }))
      await saveLocalRecord(mockGbRecord({ guestbook_id: 2 }))
      const records = await getCachedGbRecords(1)
      expect(records).toHaveLength(2)
    })
  })

  describe('clearAllLocalData', () => {
    it('清空所有表', async () => {
      await saveLocalRecord(mockGbRecord())
      await saveLocalDailyRecord(mockDailyRecord())
      await saveLocalPerson(mockPerson())
      await cacheGuestbook(mockGuestbook())
      await clearAllLocalData()
      expect(await db.gbRecords.count()).toBe(0)
      expect(await db.dailyRecords.count()).toBe(0)
      expect(await db.persons.count()).toBe(0)
      expect(await db.guestbooks.count()).toBe(0)
    })
  })
})
