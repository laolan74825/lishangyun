import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../store/appStore'
import type { GbRecord, Notification } from '../types'

beforeEach(() => {
  useAppStore.setState({
    syncStatus: 'synced',
    currentGuestbook: null,
    gbRecords: [],
    lastRecords: [],
    operatorName: '',
    terminalSettings: null,
    defaultCashAccountId: undefined,
    defaultWechatAccountId: undefined,
    wechatLimitCache: new Map(),
    toastMessage: null,
    notifications: [],
    lockState: { isLocked: false, lockTimeout: 30, lastActivity: 0 },
  })
})

describe('syncStatus', () => {
  it('defaults to synced', () => {
    expect(useAppStore.getState().syncStatus).toBe('synced')
  })

  it('can be updated', () => {
    useAppStore.getState().setSyncStatus('offline')
    expect(useAppStore.getState().syncStatus).toBe('offline')
  })
})

describe('gbRecords', () => {
  const mockRecord: GbRecord = {
    id: 1,
    uuid: 'test-uuid',
    guestbook_id: 1,
    guest_name: '张三',
    amount: 50000,
    payment_method: 'cash',
    check_status: 'unchecked',
    record_time: '2026-09-24T10:00:00Z',
    created_at: '2026-09-24T10:00:00Z',
  }

  it('setGbRecords replaces all records', () => {
    useAppStore.getState().setGbRecords([mockRecord])
    expect(useAppStore.getState().gbRecords).toEqual([mockRecord])
  })

  it('appendGbRecord adds to end', () => {
    useAppStore.getState().setGbRecords([mockRecord])
    const record2 = { ...mockRecord, id: 2, uuid: 'uuid-2' }
    useAppStore.getState().appendGbRecord(record2)
    const records = useAppStore.getState().gbRecords
    expect(records).toHaveLength(2)
    expect(records[1]).toEqual(record2)
  })

  it('prependGbRecord adds to beginning', () => {
    useAppStore.getState().setGbRecords([mockRecord])
    const record2 = { ...mockRecord, id: 2, uuid: 'uuid-2' }
    useAppStore.getState().prependGbRecord(record2)
    const records = useAppStore.getState().gbRecords
    expect(records).toHaveLength(2)
    expect(records[0]).toEqual(record2)
  })
})

describe('notifications', () => {
  const mockNotification: Notification = {
    id: 1,
    user_id: 1,
    type: 'approval_approved',
    title: '审批通过',
    is_read: false,
    is_archived: false,
    created_at: '2026-09-24T10:00:00Z',
  }

  it('addNotification prepends', () => {
    useAppStore.getState().addNotification(mockNotification)
    expect(useAppStore.getState().notifications).toHaveLength(1)
    expect(useAppStore.getState().notifications[0]).toEqual(mockNotification)
  })

  it('markNotificationRead updates is_read', () => {
    useAppStore.getState().addNotification(mockNotification)
    useAppStore.getState().markNotificationRead(1)
    expect(useAppStore.getState().notifications[0].is_read).toBe(true)
  })

  it('markAllNotificationsRead marks all', () => {
    useAppStore.getState().addNotification(mockNotification)
    useAppStore.getState().addNotification({ ...mockNotification, id: 2 })
    useAppStore.getState().markAllNotificationsRead()
    const notifications = useAppStore.getState().notifications
    expect(notifications.every((n) => n.is_read)).toBe(true)
  })

  it('unreadNotificationCount counts correctly', () => {
    useAppStore.getState().addNotification(mockNotification)
    useAppStore.getState().addNotification({ ...mockNotification, id: 2, is_read: true })
    expect(useAppStore.getState().unreadNotificationCount()).toBe(1)
  })
})

describe('lockState', () => {
  it('setLocked updates isLocked', () => {
    useAppStore.getState().setLocked(true)
    expect(useAppStore.getState().lockState.isLocked).toBe(true)
  })

  it('setLockTimeout updates timeout', () => {
    useAppStore.getState().setLockTimeout(60)
    expect(useAppStore.getState().lockState.lockTimeout).toBe(60)
  })

  it('updateLastActivity updates timestamp', () => {
    const before = useAppStore.getState().lockState.lastActivity
    useAppStore.getState().updateLastActivity()
    expect(useAppStore.getState().lockState.lastActivity).toBeGreaterThanOrEqual(before)
  })
})

describe('wechatLimitCache', () => {
  it('updateWechatLimitItem adds/updates entry', () => {
    const item = {
      account: {
        id: 1,
        name: '微信',
        type: 'wechat' as const,
        daily_limit: 200000000,
        is_active: true,
        is_disabled: false,
        created_at: '2026-01-01',
      },
      remainingFen: 150000000,
      level: 'normal' as const,
    }
    useAppStore.getState().updateWechatLimitItem(1, item)
    expect(useAppStore.getState().wechatLimitCache.get(1)).toEqual(item)
  })
})
