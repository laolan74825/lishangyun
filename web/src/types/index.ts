/**
 * 随礼记账本 — 领域类型定义
 * 与需求文档 v3.0 对齐；金额统一为「分」(INTEGER)
 */

/** 收款方式 */
export type PaymentMethod = 'cash' | 'wechat' | 'other'

/** 账户类型 */
export type AccountType = 'cash' | 'wechat'

/** 礼簿三态生命周期 */
export type GuestbookStatus = 'active' | 'closing' | 'archived'

/** 对账状态（含待核实） */
export type CheckStatus = 'unchecked' | 'checked' | 'disputed'

/** 日常记录类型：送出去 / 收进来 */
export type RecordType = 'out' | 'in'

/** 关系标签 */
export type RelationTag = '亲戚' | '朋友' | '同事' | '同学' | '邻居' | '其他'

/** 微信限额预警等级 */
export type LimitLevel = 'normal' | 'warning' | 'exhausted'

/** 用户角色（3 级体系：一般用户 / 系统管理员 / 超级管理员） */
export type UserRole = 'super_admin' | 'admin' | 'user'

/** 操作日志动作类型 */
export type ActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'MERGE'
  | 'ARCHIVE'
  | 'APPROVE'
  | 'REJECT'
  | 'SECURITY_SWITCH'
  | 'PRIVACY_MARK'

/** 操作日志目标表 */
export type TargetTable =
  | 'gb_record'
  | 'daily_record'
  | 'guestbook'
  | 'person'
  | 'payment_account'
  | 'family_group'
  | 'family_member'
  | 'pending_approval'
  | 'user_key_config'
  | 'notification'

/** 通知类型 */
export type NotificationType =
  | 'approval_submitted'
  | 'approval_approved'
  | 'approval_rejected'
  | 'approval_expired'
  | 'family_member_joined'
  | 'merge_suggested'

/** 人员档案 */
export interface Person {
  id?: number
  name: string
  nickname?: string
  phone?: string
  aliases: string[]
  relation_tag: RelationTag
  note?: string
  is_private?: boolean
  sync_version?: number
  is_deleted?: boolean
  deleted_at?: string
  created_at: string
}

/** 收款账户 */
export interface PaymentAccount {
  id?: number
  name: string
  type: AccountType
  identifier?: string
  daily_limit: number
  qr_code?: string
  is_active: boolean
  is_deleted?: boolean
  deleted_at?: string
  created_at: string
}

/** 礼簿 */
export interface Guestbook {
  id?: number
  name: string
  event_type: string
  event_date: string
  status: GuestbookStatus
  host_person_id?: number
  operator_note?: string
  is_deleted?: boolean
  deleted_at?: string
  created_at: string
  closing_at?: string
  archived_at?: string
}

/** 礼簿收礼记录 */
export interface GbRecord {
  id?: number
  uuid: string
  guestbook_id: number
  person_id?: number
  guest_name: string
  phone?: string
  amount: number
  payment_method: PaymentMethod
  account_id?: number
  note?: string
  agent_name?: string
  check_status: CheckStatus
  record_time: string
  client_id?: string
  operator_name?: string
  is_private?: boolean
  is_deleted?: boolean
  deleted_at?: string
  created_at: string
}

/** 日常礼金记录 */
export interface DailyRecord {
  id?: number
  uuid: string
  type: RecordType
  person_id?: number
  person_name: string
  phone?: string
  amount: number
  event_type: string
  payment_method?: PaymentMethod
  account_id?: number
  event_date: string
  note?: string
  source: 'daily' | 'guestbook'
  source_id?: number
  is_private?: boolean
  sync_version?: number
  is_deleted?: boolean
  deleted_at?: string
  created_by?: string
  created_at: string
  updated_at: string
}

/** 操作日志（通用 target_table + target_id 模式） */
export interface OperationLog {
  id?: number
  owner_id: number
  guestbook_id?: number
  target_table: TargetTable
  target_id: number
  action_type: ActionType
  before_data?: string
  after_data?: string
  operator_name?: string
  client_id?: string
  note?: string
  created_at: string
}

/** 终端设置 */
export interface TerminalSettings {
  id?: number
  guestbook_id: number
  client_id: string
  operator_name: string
  default_cash_account?: number
  default_wechat_account?: number
  updated_at: string
}

/** 分页响应信封 */
export interface PaginatedResponse<T> {
  items: T[]
  pagination: {
    page: number
    page_size: number
    total_count: number
    total_pages: number
  }
}

/** 通知 */
export interface Notification {
  id?: number
  user_id: number
  type: NotificationType
  title: string
  content?: string
  is_read: boolean
  is_archived: boolean
  related_type?: string
  related_id?: number
  created_at: string
}

/** 家庭组 */
export interface FamilyGroup {
  id?: number
  owner_id: number
  name: string
  description?: string
  invite_code: string
  invite_expires_at?: string
  member_count: number
  created_at: string
  updated_at: string
}

/** 家庭成员 */
export interface FamilyMember {
  id?: number
  family_group_id: number
  user_id: number
  role: 'owner' | 'admin' | 'member'
  status: 'pending' | 'active' | 'removed'
  display_name?: string
  is_active: boolean
  username?: string
  nickname?: string
  joined_at?: string
  created_at: string
}

/** 待审批队列 */
export interface PendingApproval {
  id?: number
  family_group_id: number
  submitter_id: number
  submitter_name?: string
  reviewer_id?: number
  action_type: string
  target_table: TargetTable
  target_id?: number
  data_snapshot?: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  review_note?: string
  expires_at?: string
  created_at: string
  updated_at: string
}

/** 协作邀请（邀请人视角） */
export interface CollaborationInvite {
  id?: number
  inviter_id: number
  invitee_id: number
  invitee_username: string
  invitee_email: string | null
  guestbook_id: number
  invite_code: string | null
  permissions: 'record' | 'reconcile' | 'both'
  status: 'pending' | 'accepted' | 'rejected' | 'revoked' | 'expired'
  signal_expires_at: string
  collaboration_start_at: string
  collaboration_end_at: string
  accepted_at?: string
  created_at: string
}

/** 首页待处理协作邀请（被邀请人视角） */
export interface CollaborationInvitePending {
  id: number
  inviter_id: number
  inviter_username: string
  guestbook_id: number
  guestbook_name: string
  permissions: 'record' | 'reconcile' | 'both'
  signal_expires_at: string
  created_at: string
}

/** 已接受的协作（被邀请人视角） */
export interface CollaborationInviteAccepted {
  id: number
  inviter_id: number
  inviter_username: string
  guestbook_id: number
  guestbook_name: string
  permissions: 'record' | 'reconcile' | 'both'
  collaboration_start_at: string
  collaboration_end_at: string
  accepted_at: string
}

/** 协作邀请操作日志 */
export interface CollaborationActionLog {
  id: number
  invite_id: number
  action_type: string
  operator_name?: string
  detail?: string
  created_at: string
}

/** 人员合并结果 */
export interface PersonMergeResult {
  target_person_id: number
  migrated_gb_records: number
  migrated_daily_records: number
  merged_aliases: string[]
}

/** 差额调整记录 */
export interface BalanceAdjustment {
  id: number
  owner_id: number
  person_id: number
  amount: number
  reason: string
  created_by?: string
  created_at: string
}

/** 个人账户资料 */
export interface ProfileResponse {
  id: number
  username: string
  role: string
  nickname?: string
  email?: string
  status: string
  security_mode: string
  auto_lock_minutes: number
  is_active: boolean
  created_at: string
}

/** 安全邮箱条目 */
export interface SecurityEmailItem {
  id: number
  email: string
  is_primary: boolean
  is_verified: boolean
  created_at: string
}

/** 月度收支趋势 */
export interface MonthlyTrendItem {
  month: string
  received: number
  sent: number
}

/** 事由分布 */
export interface EventDistributionItem {
  event_type: string
  total_amount: number
  record_count: number
}

/** 礼簿统计项 */
export interface GuestbookStatsItem {
  guestbook_id: number
  guestbook_name: string
  event_type: string
  event_date: string
  total_records: number
  total_amount: number
  checked_count: number
}

/** 管理员用户信息（Admin API 返回） */
export interface AdminUser {
  id: number
  username: string
  role: string
  nickname?: string
  email?: string
  status: string
  security_mode: string
  is_active: boolean
}

/** 管理员创建用户请求 */
export interface AdminUserCreate {
  username: string
  password: string
  role?: string
  nickname?: string
  email?: string
}

/** 管理员更新用户请求 */
export interface AdminUserUpdate {
  role?: string
  is_active?: boolean
  email?: string
  nickname?: string
}

/** 系统设置（SMTP 配置） */
export interface SystemSettings {
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_password_set: boolean
}

/** 安全模式 */
export type SecurityMode = 'normal' | 'enhanced'

/** 安全配置响应 */
export interface SecurityConfig {
  security_mode: SecurityMode
  has_encrypted_key: boolean
  has_mnemonic_hash: boolean
  has_encrypted_family_key: boolean
  is_active: boolean
}

/** 安全配置详情响应 */
export interface SecurityConfigDetail extends SecurityConfig {
  id: number
  user_id: number
  created_at: string
  updated_at: string
}

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

/** 金额格式化：分 → 元 */
export function formatAmount(fen: number): string {
  return (fen / 100).toFixed(2)
}

/** 金额解析：元 → 分 */
export function parseAmount(yuan: string): number {
  return Math.round(parseFloat(yuan) * 100)
}
