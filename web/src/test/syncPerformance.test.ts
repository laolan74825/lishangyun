import { describe, it, expect, beforeEach } from 'vitest'
import { db, clearAllLocalData, getPendingSyncRecords, getCachedGbRecords, saveLocalRecord } from '../lib/dexie'
import type { GbRecord } from '../types'
import type { SyncableGbRecord } from '../lib/dexie'

function generateMockRecords(count: number, guestbookId: number = 1): SyncableGbRecord[] {
  const records: SyncableGbRecord[] = []
  const names = ['张三', '李四', '王五', '赵六', '钱七', '孙八', '周九', '吴十']
  const methods: Array<'cash' | 'wechat' | 'other'> = ['cash', 'wechat', 'other']

  for (let i = 0; i < count; i++) {
    records.push({
      uuid: crypto.randomUUID(),
      guestbook_id: guestbookId,
      guest_name: names[i % names.length] + (i >= names.length ? `_${Math.floor(i / names.length)}` : ''),
      amount: Math.floor(Math.random() * 990000) + 10000,
      payment_method: methods[i % methods.length],
      check_status: 'unchecked',
      record_time: new Date(Date.now() - i * 60000).toISOString(),
      created_at: new Date().toISOString(),
      _pendingSync: true,
      _syncedAt: 0,
      _updatedAt: Date.now(),
      _deleted: false,
    })
  }
  return records
}

describe('sync performance', () => {
  beforeEach(async () => {
    await clearAllLocalData()
  })

  it('批量写入 3000 条记录 < 3s', async () => {
    const records = generateMockRecords(3000)
    const start = performance.now()

    await db.transaction('rw', db.gbRecords, async () => {
      await db.gbRecords.bulkAdd(records)
    })

    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(3000)
    const count = await db.gbRecords.count()
    expect(count).toBe(3000)
  })

  it('查询待同步记录 3000 条 < 2s', async () => {
    const records = generateMockRecords(3000)
    await db.gbRecords.bulkAdd(records)

    const start = performance.now()
    const pending = await getPendingSyncRecords('gbRecords')
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(2000)
    expect(pending).toHaveLength(3000)
  })

  it('按 guestbook_id 查询 3000 条记录 < 1s', async () => {
    await db.gbRecords.bulkAdd(generateMockRecords(1500, 1))
    await db.gbRecords.bulkAdd(generateMockRecords(1500, 2))

    const start = performance.now()
    const records = await getCachedGbRecords(1)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(1000)
    expect(records).toHaveLength(1500)
  })

  it('批量标记已同步 1000 条 < 10s', async () => {
    const records = generateMockRecords(1000)
    await db.gbRecords.bulkAdd(records)
    const allRecords = await db.gbRecords.toArray()

    const start = performance.now()
    await db.transaction('rw', db.gbRecords, async () => {
      for (const r of allRecords) {
        await db.gbRecords.update(r.id!, { _pendingSync: false, _syncedAt: Date.now() })
      }
    })
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(10000)
    const pending = await getPendingSyncRecords('gbRecords')
    expect(pending).toHaveLength(0)
  }, 15000)

  it('saveLocalRecord 单条写入 < 200ms', async () => {
    const record: GbRecord = {
      uuid: crypto.randomUUID(),
      guestbook_id: 1,
      guest_name: '测试',
      amount: 50000,
      payment_method: 'cash',
      check_status: 'unchecked',
      record_time: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }

    const start = performance.now()
    await saveLocalRecord(record)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(200)
  })
})
