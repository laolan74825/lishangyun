/**
 * 随礼记账本 — 领域类型定义
 * 与 database-schema.sql 保持一致；金额统一为「分」(INTEGER)
 */

/** 收款方式 */
export type PaymentMethod = 'cash' | 'wechat' | 'other'

/** 账户类型 */
export type AccountType = 'cash' | 'wechat'

/** 礼簿状态 */
export type GuestbookStatus = '收礼中' | '已完成'

/** 对账状态 */
export type CheckStatus = 'unchecked' | 'checked'

/** 日常记录类型：送出去 / 收进来 */
export type RecordType = 'out' | 'in'

/** 关系标签 */
export type RelationTag = '亲戚' | '朋友' | '同事' | '同学' | '邻居' | '其他'

/** 人员档案 */
export interface Person {
  id?: number
  name: string
  nickname?: string
  phone?: string
  /** 历史别名数组（JSON） */
  aliases: string[]
  relation_tag: RelationTag
  note?: string
  created_at: string
}

/** 收款账户（现金收银人 / 微信收款账户） */
export interface PaymentAccount {
  id?: number
  name: string
  type: AccountType
  /** 微信号标识（仅微信类型） */
  identifier?: string
  /** 每日限额（单位：分，仅微信类型有效，默认 200000万 = 2,000,000,000 分） */
  daily_limit: number
  /** 微信收款二维码（Base64 或 URL，仅微信类型） */
  qr_code?: string
  is_active: boolean
  created_at: string
}

/** 礼簿 */
export interface Guestbook {
  id?: number
  name: string
  event_type: string
  event_date: string
  status: GuestbookStatus
  created_at: string
  completed_at?: string
  operator_note?: string
}

/** 礼簿收礼记录（核心数据表） */
export interface GbRecord {
  id?: number
  /** 全局唯一 ID，多客户端同步幂等键，防重复写入 */
  uuid: string
  guestbook_id: number
  /** 合并后关联的日常人员（可为空） */
  person_id?: number
  guest_name: string
  phone?: string
  /** 金额（单位：分） */
  amount: number
  payment_method: PaymentMethod
  account_id?: number
  note?: string
  /** 经办人/代理人姓名（代理送礼时） */
  agent_name?: string
  check_status: CheckStatus
  /** 记账时间（漏记补记可手动设置，精确到秒） */
  record_time: string
  /** 客户端标识 */
  client_id?: string
  /** 终端记账员姓名 */
  operator_name?: string
  created_at: string
}

/** 日常礼金记录 */
export interface DailyRecord {
  id?: number
  uuid: string
  type: RecordType
  person_id?: number
  /** 对方姓名快照（人员删除后仍可展示） */
  person_name: string
  phone?: string
  amount: number
  event_type: string
  payment_method?: PaymentMethod
  account_id?: number
  event_date: string
  note?: string
  /** 来源：daily=日常录入 / guestbook=礼簿合并 */
  source: 'daily' | 'guestbook'
  /** 来源礼簿 ID（source=guestbook 时） */
  source_id?: number
  created_by?: string
  created_at: string
  updated_at: string
}

/** 操作日志（只读，不可篡改） */
export interface OperationLog {
  id?: number
  guestbook_id: number
  gb_record_id?: number
  action_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'MERGE'
  operator_name?: string
  client_id?: string
  before_data?: string
  after_data?: string
  created_at: string
}

/** 终端设置（每个终端在每个礼簿中唯一一条） */
export interface TerminalSettings {
  id?: number
  guestbook_id: number
  client_id: string
  operator_name: string
  default_cash_account?: number
  default_wechat_account?: number
  updated_at: string
}

/** 微信限额预警等级（ui-design-spec 4.3 状态标签） */
export type LimitLevel = 'normal' | 'warning' | 'exhausted'

/**
 * 微信限额预警规则（需求 F-2.17）：
 * 剩余额度 < 2000 元 → warning（标红/标黄提示）
 * 剩余额度 ≤ 200 元 → exhausted（置灰禁用，不可选择）
 */
export function limitLevel(remainingFen: number): LimitLevel {
  if (remainingFen <= 200 * 100) return 'exhausted'
  if (remainingFen < 2000 * 100) return 'warning'
  return 'normal'
}
