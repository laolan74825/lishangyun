import { create } from 'zustand'
import { getClientId } from '../lib/client'
import type { Guestbook, GbRecord, TerminalSettings, PaymentAccount } from '../types'
import { limitLevel } from '../types'

/** 同步状态（需求 F-4.7） */
export type SyncStatus = 'synced' | 'syncing' | 'offline'

/** 微信限额缓存项 */
export interface WechatLimitItem {
  account: PaymentAccount
  remainingFen: number
  level: 'normal' | 'warning' | 'exhausted'
}

interface AppState {
  /* ---------- 基础标识 ---------- */
  /** 本终端客户端标识 */
  clientId: string
  syncStatus: SyncStatus
  setSyncStatus: (status: SyncStatus) => void

  /* ---------- 当前会话 ---------- */
  /** 当前激活的礼簿 */
  currentGuestbook: Guestbook | null
  setCurrentGuestbook: (gb: Guestbook | null) => void

  /** 当前礼簿下的收礼记录列表 */
  gbRecords: GbRecord[]
  setGbRecords: (records: GbRecord[]) => void
  appendGbRecord: (record: GbRecord) => void
  prependGbRecord: (record: GbRecord) => void

  /** 最近 N 条收款记录（现场收礼页展示） */
  lastRecords: GbRecord[]
  setLastRecords: (records: GbRecord[]) => void

  /** 终端记账员姓名 */
  operatorName: string
  setOperatorName: (name: string) => void

  /* ---------- 终端设置 ---------- */
  /** 当前终端的默认收款人设置 */
  terminalSettings: TerminalSettings | null
  setTerminalSettings: (settings: TerminalSettings | null) => void

  /** 默认现金收款人 ID */
  defaultCashAccountId: number | undefined
  setDefaultCashAccountId: (id: number | undefined) => void

  /** 默认微信收款人 ID */
  defaultWechatAccountId: number | undefined
  setDefaultWechatAccountId: (id: number | undefined) => void

  /* ---------- 微信限额缓存 ---------- */
  /** 各微信账户剩余额度（用于 UI 标红/置灰） */
  wechatLimitCache: Map<number, WechatLimitItem>
  setWechatLimitCache: (cache: Map<number, WechatLimitItem>) => void
  updateWechatLimitItem: (accountId: number, item: WechatLimitItem) => void

  /* ---------- 全局通知 ---------- */
  /**  toast 消息队列（简单实现） */
  toastMessage: string | null
  setToastMessage: (msg: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  /* 基础 */
  clientId: getClientId(),
  syncStatus: 'synced',
  setSyncStatus: (syncStatus) => set({ syncStatus }),

  /* 当前会话 */
  currentGuestbook: null,
  setCurrentGuestbook: (currentGuestbook) => set({ currentGuestbook }),

  gbRecords: [],
  setGbRecords: (gbRecords) => set({ gbRecords }),
  appendGbRecord: (record) =>
    set((state) => ({ gbRecords: [...state.gbRecords, record] })),
  prependGbRecord: (record) =>
    set((state) => ({ gbRecords: [record, ...state.gbRecords] })),

  lastRecords: [],
  setLastRecords: (lastRecords) => set({ lastRecords }),

  operatorName: '',
  setOperatorName: (operatorName) => set({ operatorName }),

  /* 终端设置 */
  terminalSettings: null,
  setTerminalSettings: (terminalSettings) => set({ terminalSettings }),

  defaultCashAccountId: undefined,
  setDefaultCashAccountId: (defaultCashAccountId) => set({ defaultCashAccountId }),

  defaultWechatAccountId: undefined,
  setDefaultWechatAccountId: (defaultWechatAccountId) => set({ defaultWechatAccountId }),

  /* 微信限额 */
  wechatLimitCache: new Map(),
  setWechatLimitCache: (wechatLimitCache) => set({ wechatLimitCache }),
  updateWechatLimitItem: (accountId, item) =>
    set((state) => {
      const next = new Map(state.wechatLimitCache)
      next.set(accountId, item)
      return { wechatLimitCache: next }
    }),

  /* toast */
  toastMessage: null,
  setToastMessage: (toastMessage) => set({ toastMessage })
}))

/** 根据 store 中的当前礼簿和账户 ID，刷新微信限额缓存 */
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
      level: limitLevel(remainingFen)
    })
  }
  useAppStore.getState().setWechatLimitCache(cache)
  return cache
}
