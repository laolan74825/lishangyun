import { create } from 'zustand'
import { getClientId } from '../lib/client'
import type { Guestbook, GbRecord, TerminalSettings, PaymentAccount, Notification } from '../types'
import { limitLevel } from '../types'

export type SyncStatus = 'synced' | 'syncing' | 'offline'

export interface WechatLimitItem {
  account: PaymentAccount
  remainingFen: number
  level: 'normal' | 'warning' | 'exhausted'
}

export interface LockState {
  isLocked: boolean
  lockTimeout: number
  lastActivity: number
}

// 最后活跃时间持久化：浏览器重开/标签被回收后仍按真实离开时长判定是否锁屏
const LAST_ACTIVITY_KEY = 'gr_last_activity'

function loadLastActivity(): number {
  const saved = Number(localStorage.getItem(LAST_ACTIVITY_KEY))
  return Number.isFinite(saved) && saved > 0 ? saved : Date.now()
}

interface AppState {
  clientId: string
  syncStatus: SyncStatus
  setSyncStatus: (status: SyncStatus) => void

  currentGuestbook: Guestbook | null
  setCurrentGuestbook: (gb: Guestbook | null) => void

  gbRecords: GbRecord[]
  setGbRecords: (records: GbRecord[]) => void
  appendGbRecord: (record: GbRecord) => void
  prependGbRecord: (record: GbRecord) => void
  updateGbRecord: (record: GbRecord) => void
  removeGbRecord: (id: number) => void

  lastRecords: GbRecord[]
  setLastRecords: (records: GbRecord[]) => void

  operatorName: string
  setOperatorName: (name: string) => void

  terminalSettings: TerminalSettings | null
  setTerminalSettings: (settings: TerminalSettings | null) => void

  defaultCashAccountId: number | undefined
  setDefaultCashAccountId: (id: number | undefined) => void

  defaultWechatAccountId: number | undefined
  setDefaultWechatAccountId: (id: number | undefined) => void

  wechatLimitCache: Map<number, WechatLimitItem>
  setWechatLimitCache: (cache: Map<number, WechatLimitItem>) => void
  updateWechatLimitItem: (accountId: number, item: WechatLimitItem) => void

  toastMessage: string | null
  setToastMessage: (msg: string | null) => void

  notifications: Notification[]
  setNotifications: (notifications: Notification[]) => void
  addNotification: (notification: Notification) => void
  markNotificationRead: (id: number) => void
  markAllNotificationsRead: () => void
  unreadNotificationCount: () => number

  lockState: LockState
  setLocked: (locked: boolean) => void
  setLockTimeout: (minutes: number) => void
  updateLastActivity: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  clientId: getClientId(),
  syncStatus: 'synced',
  setSyncStatus: (syncStatus) => set({ syncStatus }),

  currentGuestbook: null,
  setCurrentGuestbook: (currentGuestbook) => set({ currentGuestbook }),

  gbRecords: [],
  setGbRecords: (gbRecords) => set({ gbRecords }),
  appendGbRecord: (record) =>
    set((state) => ({ gbRecords: [...state.gbRecords, record] })),
  prependGbRecord: (record) =>
    set((state) => ({ gbRecords: [record, ...state.gbRecords] })),
  updateGbRecord: (record) =>
    set((state) => ({
      gbRecords: state.gbRecords.map((r) => (r.id === record.id ? record : r)),
    })),
  removeGbRecord: (id) =>
    set((state) => ({ gbRecords: state.gbRecords.filter((r) => r.id !== id) })),

  lastRecords: [],
  setLastRecords: (lastRecords) => set({ lastRecords }),

  operatorName: '',
  setOperatorName: (operatorName) => set({ operatorName }),

  terminalSettings: null,
  setTerminalSettings: (terminalSettings) => set({ terminalSettings }),

  defaultCashAccountId: undefined,
  setDefaultCashAccountId: (defaultCashAccountId) => set({ defaultCashAccountId }),

  defaultWechatAccountId: undefined,
  setDefaultWechatAccountId: (defaultWechatAccountId) => set({ defaultWechatAccountId }),

  wechatLimitCache: new Map(),
  setWechatLimitCache: (wechatLimitCache) => set({ wechatLimitCache }),
  updateWechatLimitItem: (accountId, item) =>
    set((state) => {
      const next = new Map(state.wechatLimitCache)
      next.set(accountId, item)
      return { wechatLimitCache: next }
    }),

  toastMessage: null,
  setToastMessage: (toastMessage) => set({ toastMessage }),

  notifications: [],
  setNotifications: (notifications) => set({ notifications }),
  addNotification: (notification) =>
    set((state) => ({ notifications: [notification, ...state.notifications] })),
  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      ),
    })),
  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
    })),
  unreadNotificationCount: () => {
    return get().notifications.filter((n) => !n.is_read).length
  },

  lockState: {
    isLocked: false,
    lockTimeout: 30,
    lastActivity: loadLastActivity(),
  },
  setLocked: (isLocked) =>
    set((state) => ({ lockState: { ...state.lockState, isLocked } })),
  setLockTimeout: (lockTimeout) =>
    set((state) => ({ lockState: { ...state.lockState, lockTimeout } })),
  updateLastActivity: () => {
    const now = Date.now()
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now))
    set((state) => ({ lockState: { ...state.lockState, lastActivity: now } }))
  },
}))

export async function refreshWechatLimitCache(
  accounts: PaymentAccount[],
  dateStr: string,
  receivedFn: (accountId: number, date: string) => Promise<number>
): Promise<Map<number, WechatLimitItem>> {
  const cache = new Map<number, WechatLimitItem>()
  for (const ac of accounts) {
    if (ac.type !== 'wechat' || !ac.is_active) continue
    const received = await receivedFn(ac.id!, dateStr)
    const remainingFen = ac.daily_limit - received
    cache.set(ac.id!, {
      account: ac,
      remainingFen,
      level: limitLevel(remainingFen),
    })
  }
  useAppStore.getState().setWechatLimitCache(cache)
  return cache
}
