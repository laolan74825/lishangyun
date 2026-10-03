/**
 * TanStack Query 数据查询 Hooks 集合
 *
 * 本文件为项目中所有后端 API 数据查询提供统一的 React Query hooks 封装。
 * 每个 hook 对应一个 API 调用，自动处理缓存、失效、重试等逻辑。
 *
 * 使用 TanStack Query 的优势：
 * - 自动缓存和失效管理
 * - 后台自动重新获取
 * - 乐观更新支持
 * - 分页和无限加载
 * - 错误重试机制
 */

// TanStack Query 核心 hooks：用于数据查询和变更操作
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
// useQuery 的配置类型定义，用于自定义查询选项
import type { UseQueryOptions } from '@tanstack/react-query'

// API 客户端模块：封装所有后端 API 调用的函数集合
// 包含所有 REST API 的请求函数，如 getGuestbooks、createGbRecord 等
import * as api from '../lib/api-client'

// Query Keys 工厂函数：生成标准化的查询键
// 用于标识和分组不同的查询缓存，支持按资源类型、ID、筛选条件等维度失效缓存
import { queryKeys } from './queryKeys'

// 类型定义：从 types 模块导入所有业务数据类型
// 这些类型与后端 Pydantic Schema 一一对应，确保前后端数据结构一致
import type {
  Guestbook,              // 礼簿类型：收礼活动的主体（如"张三婚礼"）
  GbRecord,               // 收礼记录类型：单次收礼的详细信息（宾客、金额、支付方式等）
  DailyRecord,            // 日常记录类型：非礼簿场景的随礼记录（送出去/收进来）
  Person,                 // 人员类型：宾客/联系人档案（姓名、电话、关系等）
  PaymentAccount,         // 收款账户类型：现金收银员或微信收款账户
  TerminalSettings,       // 终端设置类型：每个礼簿的默认账户配置
  PaginatedResponse,      // 分页响应类型：统一的列表分页数据结构
  MonthlyTrendItem,       // 月度趋势统计项：用于统计页面的月度收支数据
  EventDistributionItem,  // 事由分布统计项：按事由类型分组的统计数据
  GuestbookStatsItem,     // 礼簿统计项：单个礼簿的汇总统计
  AdminUser,              // 管理员用户类型：后台管理系统的用户信息
  SystemSettings,         // 系统设置类型：全局配置参数
  OperationLog,           // 操作日志类型：审计日志记录
  ProfileResponse,        // 个人资料响应类型：当前用户的基本信息
  SecurityEmailItem,      // 安全邮箱类型：用于密码重置的备用邮箱
} from '../types'

/* ========================= 礼簿（Guestbooks）查询 Hooks =========================
 *
 * 礼簿是收礼活动的主体，如"张三婚礼"、"李四满月酒"等。
 * 每个礼簿包含多条收礼记录（GbRecord），关联一个或多个收款账户。
 * 礼簿有三态生命周期：收礼中(active) → 收尾中(closing) → 已归档(archived)
 */

/** 获取所有礼簿列表（不分页，适用于礼簿数量较少的场景） */
export function useGuestbooks(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: queryKeys.guestbooks.list(filters),
    queryFn: () => api.getAllGuestbooks(),
  })
}

/** 获取分页礼簿列表（适用于礼簿数量较多的场景，如管理后台） */
export function useGuestbooksPaginated(
  page: number,
  pageSize: number = 20,
  options?: Partial<UseQueryOptions<PaginatedResponse<Guestbook>>>
) {
  return useQuery<PaginatedResponse<Guestbook>>({
    queryKey: queryKeys.guestbooks.list({ page, pageSize }),
    queryFn: () => api.getGuestbooksPaginated(page, pageSize),
    ...options,
  })
}

/** 获取单个礼簿详情（通过 ID 查询） */
export function useGuestbook(id: number) {
  return useQuery({
    queryKey: queryKeys.guestbooks.detail(id),
    queryFn: () => api.getGuestbookById(id),
    enabled: id > 0,  // 只有 ID 有效时才发起请求
  })
}

/** 创建新礼簿的 mutation hook */
export function useCreateGuestbook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: api.CreateGuestbookInput) => api.createGuestbook(data),
    onSuccess: () => {
      // 创建成功后失效所有礼簿查询缓存，触发重新获取
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.all })
    },
  })
}

/** 更新礼簿信息的 mutation hook（如修改名称、日期、状态等） */
export function useUpdateGuestbook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<Guestbook> }) =>
      api.updateGuestbook(id, changes),
    onSuccess: (_, { id }) => {
      // 更新后失效该礼簿的详情缓存和列表缓存
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.all })
    },
  })
}

/** 删除礼簿的 mutation hook（软删除，标记 is_deleted=true） */
export function useDeleteGuestbook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteGuestbook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.all })
    },
  })
}

/** 结束收礼（active → closing），可附收礼总结说明；成功后失效礼簿缓存，状态即时刷新 */
export function useCloseGuestbook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, summary }: { id: number; summary?: string }) =>
      api.closeGuestbook(id, summary),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.all })
      // 结束收礼会撤销协作邀请，协作相关缓存一并失效
      queryClient.invalidateQueries({ queryKey: queryKeys.collaboration.all })
    },
  })
}

/** 返回收礼中（closing → active），成功后失效礼簿缓存，状态即时刷新 */
export function useReopenGuestbook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.reopenGuestbook(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.all })
    },
  })
}

/** 归档礼簿（→ archived），成功后失效礼簿缓存，状态即时刷新 */
export function useArchiveGuestbook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.archiveGuestbook(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.all })
    },
  })
}

/** 已归档礼簿恢复为收尾中（archived → closing），成功后失效礼簿缓存，状态即时刷新 */
export function useUnarchiveGuestbook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.unarchiveGuestbook(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.all })
    },
  })
}

/** 礼簿合并到人员库（建立 person_id 关联），成功后失效礼簿与记录缓存 */
export function useMergeGuestbookPersons() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.mergeGuestbookPersons(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.summaries() })
      queryClient.invalidateQueries({ queryKey: queryKeys.gbRecords.lists() })
    },
  })
}

/** 合并向导「新建人员」：勾选无法匹配的记录后，按礼簿数据新建人员并关联 */
export function useMergeCreatePersons() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, recordIds }: { id: number; recordIds: number[] }) =>
      api.mergeCreatePersons(id, recordIds),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.guestbooks.summaries() })
      queryClient.invalidateQueries({ queryKey: queryKeys.gbRecords.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.all })
    },
  })
}

/* ========================= 收礼记录（GbRecords）查询 Hooks =========================
 *
 * 收礼记录是礼簿中的核心数据，记录每位宾客的随礼信息。
 * 每条记录包含：宾客姓名、金额、支付方式、收款账户、操作员等。
 * 金额以"分"为单位存储（整数），前端显示时除以 100 转换为"元"。
 */

/** 获取指定礼簿的所有收礼记录（不分页） */
export function useGbRecords(
  guestbookId: number,
  filters: Record<string, unknown> = {}
) {
  return useQuery({
    queryKey: queryKeys.gbRecords.list(guestbookId, filters),
    queryFn: () => api.getGbRecordsByGuestbook(guestbookId),
    enabled: guestbookId > 0,  // 礼簿 ID 有效时才请求
  })
}

/** 获取指定礼簿的分页收礼记录（适用于记录较多的礼簿） */
export function useGbRecordsPaginated(
  guestbookId: number,
  page: number,
  pageSize: number = 20,
  filters: Record<string, unknown> = {}
) {
  return useQuery<PaginatedResponse<GbRecord>>({
    queryKey: queryKeys.gbRecords.list(guestbookId, { page, pageSize, ...filters }),
    queryFn: () => api.getGbRecordsPaginated(guestbookId, page, pageSize, filters),
    enabled: guestbookId > 0,
  })
}

/** 获取指定礼簿的最近 N 条收礼记录（用于收礼页面的快速展示） */
export function useRecentGbRecords(guestbookId: number, limit: number = 10) {
  return useQuery({
    queryKey: queryKeys.gbRecords.recent(guestbookId),
    queryFn: () => api.getRecentRecords(guestbookId, limit),
    enabled: guestbookId > 0,
  })
}

/** 创建单条收礼记录的 mutation hook */
export function useCreateGbRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: api.CreateGbRecordInput) => api.createGbRecord(input),
    onSuccess: (_, input) => {
      // 创建后失效该礼簿的记录列表和最近记录缓存
      queryClient.invalidateQueries({ queryKey: queryKeys.gbRecords.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.gbRecords.recent(input.guestbook_id) })
    },
  })
}

/** 批量创建收礼记录的 mutation hook（用于批量录入宾客） */
export function useCreateGbRecordBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (inputs: api.CreateGbRecordInput[]) => api.createGbRecordBatch(inputs),
    onSuccess: (ids, inputs) => {
      if (inputs.length > 0) {
        queryClient.invalidateQueries({ queryKey: queryKeys.gbRecords.lists() })
        queryClient.invalidateQueries({ queryKey: queryKeys.gbRecords.recent(inputs[0].guestbook_id) })
      }
      return ids
    },
  })
}

/** 更新收礼记录的 mutation hook（修改宾客信息、金额、支付方式等） */
export function useUpdateGbRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      changes,
      operatorName,
      clientId,
      remark,
    }: {
      id: number
      // 允许修改的字段列表
      changes: Partial<Pick<GbRecord, 'guest_name' | 'phone' | 'amount' | 'payment_method' | 'account_id' | 'note' | 'agent_name' | 'check_status' | 'record_time' | 'is_private'>>
      operatorName?: string  // 操作员姓名（用于审计日志）
      clientId?: string      // 终端标识（用于审计日志）
      remark?: string        // 修改备注（写入操作日志）
    }) => api.updateGbRecord(id, changes, operatorName, clientId, remark),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gbRecords.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs.all })
    },
  })
}

/** 删除收礼记录的 mutation hook（软删除） */
export function useDeleteGbRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      operatorName,
      clientId,
      remark,
    }: {
      id: number
      operatorName?: string  // 操作员姓名（用于审计日志）
      clientId?: string      // 终端标识（用于审计日志）
      remark?: string        // 删除备注（写入操作日志）
    }) => api.deleteGbRecord(id, operatorName, clientId, remark),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gbRecords.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs.all })
    },
  })
}

/** 获取本礼簿已删除的收礼记录（「删除记录」选项卡） */
export function useDeletedRecords(guestbookId: number) {
  return useQuery({
    queryKey: [...queryKeys.gbRecords.lists(), 'deleted', guestbookId] as const,
    queryFn: () => api.getDeletedRecords(guestbookId),
    enabled: guestbookId > 0,
  })
}

/** 恢复已删除收礼记录的 mutation hook，成功后刷新记录列表、汇总与操作日志 */
export function useRestoreGbRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, remark, operatorName }: { id: number; remark?: string; operatorName?: string }) =>
      api.restoreGbRecord(id, remark, operatorName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gbRecords.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.operationLogs.all })
    },
  })
}

/* ========================= 日常记录（DailyRecords）查询 Hooks =========================
 *
 * 日常记录用于记录非礼簿场景的随礼往来，分为两类：
 * - "送出去"：本人参加他人宴请而随礼（如参加朋友婚礼）
 * - "收进来"：他人参加本人宴请而随礼（不走礼簿，直接记录）
 *
 * 日常记录关联人员（Person），用于统计人情往来总额。
 */

/** 获取所有日常记录列表（不分页） */
export function useDailyRecords(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: queryKeys.dailyRecords.list(filters),
    queryFn: () => api.getDailyRecords(filters),
  })
}

/** 获取分页日常记录列表 */
export function useDailyRecordsPaginated(
  page: number,
  pageSize: number = 20,
  filters: Record<string, unknown> = {},
  options?: Partial<UseQueryOptions<PaginatedResponse<DailyRecord>>>
) {
  return useQuery<PaginatedResponse<DailyRecord>>({
    queryKey: queryKeys.dailyRecords.list({ page, pageSize, ...filters }),
    queryFn: () => api.getDailyRecordsPaginated(page, pageSize, filters),
    ...options,
  })
}

/** 获取日常记录的汇总统计（总收入/总支出/笔数等） */
export function useDailyRecordsSummary(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: queryKeys.dailyRecords.summary(filters),
    queryFn: () => api.dailyRecordsSummary(filters),
  })
}

/** 首页总览汇总（日常随礼 + 礼簿收礼），filters 需含 startDate/endDate */
export function useStatsOverview(filters: Record<string, unknown>) {
  return useQuery({
    queryKey: ['stats', 'overview', filters],
    queryFn: () =>
      api.getStatsOverview(
        String(filters.startDate ?? ''),
        String(filters.endDate ?? ''),
      ),
  })
}

/** 创建日常记录的 mutation hook */
export function useCreateDailyRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: api.CreateDailyRecordInput) => api.createDailyRecord(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyRecords.all })
    },
  })
}

/** 更新日常记录的 mutation hook */
export function useUpdateDailyRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<Omit<DailyRecord, 'id' | 'uuid' | 'created_at'>> }) =>
      api.updateDailyRecord(id, changes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyRecords.all })
    },
  })
}

/** 删除日常记录的 mutation hook（软删除） */
export function useDeleteDailyRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteDailyRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyRecords.all })
    },
  })
}

/* ========================= 人员（Persons）查询 Hooks =========================
 *
 * 人员是系统的核心实体之一，代表宾客/联系人。
 * 每个人员包含：姓名、电话、关系标签（亲戚/朋友/同事等）。
 * 人员与收礼记录（GbRecord）和日常记录（DailyRecord）关联，
 * 用于统计人情往来（送了多少、收了多少、差额）。
 */

/** 获取所有人员列表（不分页） */
export function usePersons(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: queryKeys.persons.list(filters),
    queryFn: () => api.getAllPersons(),
  })
}

/** 获取分页人员列表 */
export function usePersonsPaginated(
  page: number,
  pageSize: number = 20,
  filters: Record<string, unknown> = {},
  options?: Partial<UseQueryOptions<PaginatedResponse<Person>>>
) {
  return useQuery<PaginatedResponse<Person>>({
    queryKey: queryKeys.persons.list({ page, pageSize, ...filters }),
    queryFn: () => api.getPersonsPaginated(page, pageSize, filters),
    ...options,
  })
}

/** 获取单个人员详情（通过 ID 查询） */
export function usePerson(id: number) {
  return useQuery({
    queryKey: queryKeys.persons.detail(id),
    queryFn: () => api.getPersonById(id),
    enabled: id > 0,
  })
}

/** 按关键词搜索人员（用于姓名自动补全） */
export function useSearchPersons(keyword: string) {
  return useQuery({
    queryKey: queryKeys.persons.search(keyword),
    queryFn: () => api.searchPersons(keyword),
    enabled: keyword.length > 0,  // 有输入时才发起请求
  })
}

/** 创建新人员的 mutation hook */
export function useCreatePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Person, 'id' | 'created_at'>) => api.createPerson(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.all })
    },
  })
}

/** 更新人员信息的 mutation hook */
export function useUpdatePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<Person> }) =>
      api.updatePerson(id, changes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.all })
    },
  })
}

/** 删除人员的 mutation hook（软删除） */
export function useDeletePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deletePerson(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.all })
    },
  })
}

/* ========================= 收款账户（PaymentAccounts）查询 Hooks =========================
 *
 * 收款账户分为两种类型：
 * - cash（现金/收银员）：代表收银人员，现金收款时使用
 * - wechat（微信账户）：代表微信收款账户，有每日限额和收款二维码
 *
 * 每个账户有 is_active 标记，同一类型只能有一个激活账户作为"系统默认"。
 * 礼簿可单独设置默认账户（通过 TerminalSettings），否则使用系统默认。
 */

/** 获取所有收款账户列表（可按类型过滤） */
export function usePaymentAccounts(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: queryKeys.paymentAccounts.list(filters),
    queryFn: () => api.getAllPaymentAccounts(filters.type as 'cash' | 'wechat' | undefined),
  })
}

/** 获取激活状态的收款账户（用于选择默认账户） */
export function useActivePaymentAccounts(type?: 'cash' | 'wechat') {
  return useQuery({
    queryKey: queryKeys.paymentAccounts.list({ active: true, type }),
    queryFn: () => api.getPaymentAccounts(type),
  })
}

/** 获取单个收款账户详情 */
export function usePaymentAccount(id: number) {
  return useQuery({
    queryKey: queryKeys.paymentAccounts.detail(id),
    queryFn: () => api.getPaymentAccountById(id),
    enabled: id > 0,
  })
}

/** 创建新收款账户的 mutation hook */
export function useCreatePaymentAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<PaymentAccount, 'id' | 'created_at'>) =>
      api.createPaymentAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.paymentAccounts.all })
    },
  })
}

/** 更新收款账户的 mutation hook（修改名称、限额、激活状态等） */
export function useUpdatePaymentAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: Partial<PaymentAccount> }) =>
      api.updatePaymentAccount(id, changes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.paymentAccounts.all })
    },
  })
}

/** 删除收款账户的 mutation hook（软删除） */
export function useDeletePaymentAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deletePaymentAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.paymentAccounts.all })
    },
  })
}

/* ========================= 终端设置（TerminalSettings）查询 Hooks =========================
 *
 * 终端设置用于配置每个礼簿的默认收款账户。
 * 通过 guestbook_id + client_id 复合键标识一组设置。
 * client_id 通常为 "default"，代表该礼簿的默认终端配置。
 *
 * 当礼簿未单独设置时，使用系统级默认账户（is_active=true 的账户）。
 */

/** 获取指定礼簿和终端的收款账户设置 */
export function useTerminalSettings(guestbookId: number, clientId: string) {
  return useQuery({
    queryKey: queryKeys.terminalSettings.detail(guestbookId, clientId),
    queryFn: () => api.getTerminalSettings(guestbookId, clientId),
    enabled: guestbookId > 0 && !!clientId,  // 两个参数都有效时才请求
  })
}

/** 各账户在收礼中礼簿的收款汇总（账户统计 Tab，含今日已收用于微信限额） */
export function useAccountsReceivedSummary(guestbookStatus: string = 'active') {
  return useQuery({
    queryKey: [...queryKeys.paymentAccounts.all, 'receivedSummary', guestbookStatus] as const,
    queryFn: () => api.getAccountsReceivedSummary(guestbookStatus),
  })
}

/** 保存终端设置的 mutation hook（设置默认现金/微信账户） */
export function useSaveTerminalSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: Omit<TerminalSettings, 'id' | 'updated_at'>) =>
      api.saveTerminalSettings(settings),
    onSuccess: (_, settings) => {
      // 保存后失效该礼簿+终端的设置缓存
      queryClient.invalidateQueries({
        queryKey: queryKeys.terminalSettings.detail(settings.guestbook_id, settings.client_id),
      })
    },
  })
}

/* ========================= 操作日志（OperationLogs）查询 Hooks =========================
 *
 * 操作日志用于审计追踪，记录所有业务数据的增删改操作。
 * 每条日志包含：操作类型、目标表、目标ID、操作前后数据快照、操作员等。
 * 日志不可变（不允许修改或删除），只用于查询展示。
 */

/** 获取指定礼簿的操作日志列表（用于礼簿详情页的"日志"标签页） */
export function useOperationLogs(guestbookId: number, limit: number = 100) {
  return useQuery({
    queryKey: queryKeys.operationLogs.list(guestbookId),
    queryFn: () => api.getOperationLogs(guestbookId, limit),
    enabled: guestbookId > 0,
  })
}

/* ========================= 统计（Stats）查询 Hooks =========================
 *
 * 统计接口提供各类数据聚合查询，用于首页仪表盘和统计页面。
 * 包括：礼簿汇总、账户统计、人员排行、月度趋势、事由分布等。
 * 所有金额以"分"为单位返回，前端显示时需转换为"元"。
 */

/** 获取单个礼簿的汇总统计（总金额、总笔数、各账户金额等） */
export function useGuestbookSummary(guestbookId: number) {
  return useQuery({
    queryKey: queryKeys.stats.guestbookSummary(guestbookId),
    queryFn: () => api.guestbookSummary(guestbookId),
    enabled: guestbookId > 0,
  })
}

/** 获取礼簿的账户维度统计（每个收款账户的收入汇总） */
export function useAccountSummary(guestbookId: number) {
  return useQuery({
    queryKey: queryKeys.stats.accountSummary(guestbookId),
    queryFn: () => api.accountSummary(guestbookId),
    enabled: guestbookId > 0,
  })
}

/** 获取人员往来排行（按总金额排序的 Top N） */
export function usePersonRanking(limit: number = 10) {
  return useQuery({
    queryKey: queryKeys.stats.personRanking(limit),
    queryFn: () => api.getPersonRanking(limit),
  })
}

/** 获取所有礼簿的汇总摘要列表（用于首页仪表盘） */
export function useAllGuestbookSummaries() {
  return useQuery({
    queryKey: queryKeys.guestbooks.summaries(),
    queryFn: () => api.getAllGuestbookSummaries(),
  })
}

/* ========================= 人员详情（Person Detail）查询 Hooks =========================
 *
 * 人员详情页需要展示该人员的完整信息：
 * - 交易汇总：收进来总额、送出去总额、差额
 * - 日常记录：该人员关联的所有日常记录
 * - 收礼记录：该人员在各礼簿中的收礼记录
 */

/** 获取人员的交易汇总统计（收进来/送出去/差额） */
export function usePersonTransactionSummary(personId: number) {
  return useQuery({
    queryKey: queryKeys.persons.transactionSummary(personId),
    queryFn: () => api.getPersonTransactionSummary(personId),
    enabled: personId > 0,
  })
}

/** 获取人员关联的所有日常记录（用于人员详情页的"日常往来"标签） */
export function usePersonDailyRecords(personId: number) {
  return useQuery({
    queryKey: [...queryKeys.persons.detail(personId), 'dailyRecords'],
    queryFn: () => api.getPersonDailyRecords(personId),
    enabled: personId > 0,
  })
}

/** 获取人员在各礼簿中的收礼记录（用于人员详情页的"收礼记录"标签） */
export function usePersonGbRecords(personId: number) {
  return useQuery({
    queryKey: [...queryKeys.persons.detail(personId), 'gbRecords'],
    queryFn: () => api.getPersonGbRecords(personId),
    enabled: personId > 0,
  })
}

/* ========================= 差额调整（Balance Adjustments）查询 Hooks =========================
 *
 * 差额调整用于手动修正人员的往来差额。
 * 当实际金额与系统记录不一致时，管理员可添加调整记录。
 * 每条调整记录包含：调整金额（可正可负）、调整原因。
 */

/** 获取指定人员的差额调整记录列表 */
export function useBalanceAdjustments(personId?: number) {
  return useQuery({
    queryKey: ['balanceAdjustments', personId],
    queryFn: () => api.getBalanceAdjustments(personId),
    enabled: !!personId,  // 人员 ID 有效时才请求
  })
}

/** 创建差额调整记录的 mutation hook */
export function useCreateBalanceAdjustment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { person_id: number; amount: number; reason: string }) =>
      api.createBalanceAdjustment(data),
    onSuccess: (_, variables) => {
      // 创建后失效该人员的调整记录和交易汇总缓存
      queryClient.invalidateQueries({ queryKey: ['balanceAdjustments', variables.person_id] })
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.transactionSummary(variables.person_id) })
    },
  })
}

/* ========================= 增强统计（Enhanced Stats）查询 Hooks =========================
 *
 * 增强统计接口提供更详细的数据分析，用于统计页面的图表展示。
 * 包括：月度收支趋势、事由分布、礼簿专项统计。
 */

/** 获取月度收支趋势数据（用于折线图展示） */
export function useMonthlyTrend(months: number = 12) {
  return useQuery({
    queryKey: queryKeys.stats.monthlyTrend(months),
    queryFn: () => api.getMonthlyTrend(months),
  })
}

/** 获取事由分布数据（用于饼图/条形图展示：婚礼/生日/满月酒等各占多少） */
export function useEventDistribution() {
  return useQuery({
    queryKey: queryKeys.stats.eventDistribution(),
    queryFn: () => api.getEventDistribution(),
  })
}

/** 获取礼簿专项统计数据（每个礼簿的详细汇总） */
export function useGuestbookStats() {
  return useQuery({
    queryKey: queryKeys.stats.guestbookStats(),
    queryFn: () => api.getGuestbookStats(),
  })
}

// 重新导出统计类型，供页面组件使用
export type { MonthlyTrendItem, EventDistributionItem, GuestbookStatsItem }

/* ========================= 管理后台（Admin）查询 Hooks =========================
 *
 * 管理后台接口仅对 super_admin 和 admin 角色开放。
 * 包括：用户管理、系统设置、审计日志查询。
 */

/** 获取用户列表（分页，用于管理后台用户管理页面） */
export function useAdminUsers(page: number = 1, pageSize: number = 20) {
  return useQuery({
    queryKey: queryKeys.admin.users(page, pageSize),
    queryFn: () => api.getAdminUsers(page, pageSize),
  })
}

/** 获取系统设置（全局配置参数） */
export function useSystemSettings() {
  return useQuery({
    queryKey: queryKeys.admin.settings(),
    queryFn: () => api.getSystemSettings(),
  })
}

/** 获取审计日志列表（分页+筛选，用于管理后台审计页面） */
export function useAdminAuditLogs(
  page: number = 1,
  pageSize: number = 20,
  filters?: {
    target_table?: string   // 按目标表过滤：gb_record/person/guestbook 等
    action_type?: string    // 按操作类型过滤：CREATE/UPDATE/DELETE 等
    start_date?: string     // 开始日期（YYYY-MM-DD）
    end_date?: string       // 结束日期（YYYY-MM-DD）
  },
) {
  return useQuery({
    queryKey: queryKeys.admin.auditLogs(page, pageSize, filters as Record<string, unknown>),
    queryFn: () => api.getOperationLogsPaginated(page, pageSize, filters),
  })
}

// 重新导出管理后台类型，供页面组件使用
export type { AdminUser, SystemSettings, OperationLog }

/* ========================= 个人账户（Account）查询 Hooks =========================
 *
 * 个人账户接口用于当前登录用户的个人设置。
 * 包括：个人资料查看/修改、安全邮箱管理、账户注销。
 */

/** 获取当前用户的个人资料（昵称、自动锁定时间等） */
export function useProfile() {
  return useQuery({
    queryKey: queryKeys.account.profile(),
    queryFn: () => api.getProfile(),
  })
}

/** 获取当前用户的安全邮箱列表（用于密码重置） */
export function useSecurityEmails() {
  return useQuery({
    queryKey: queryKeys.account.securityEmails(),
    queryFn: () => api.getSecurityEmails(),
  })
}

/** 更新个人资料的 mutation hook（修改昵称、自动锁定时间） */
export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { nickname?: string; auto_lock_minutes?: number }) =>
      api.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.account.profile() })
    },
  })
}

/** 添加安全邮箱的 mutation hook（需要邮箱验证码） */
export function useAddSecurityEmail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) =>
      api.addSecurityEmail(email, code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.account.securityEmails() })
    },
  })
}

/** 删除安全邮箱的 mutation hook */
export function useDeleteSecurityEmail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (emailId: number) => api.deleteSecurityEmail(emailId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.account.securityEmails() })
    },
  })
}

/** 注销账户的 mutation hook（需要输入密码确认，操作不可逆） */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: (password: string) => api.deleteAccount(password),
  })
}

// 重新导出账户相关类型，供页面组件使用
export type { ProfileResponse, SecurityEmailItem }

/* ========================= 协作邀请（Collaboration）查询 Hooks ========================= */

/** 通过邮箱或用户名精确查找用户（协作邀请选人） */
export function useSearchUser(keyword: string) {
  return useQuery({
    queryKey: ['collaboration', 'search', keyword],
    queryFn: () => api.searchUser(keyword),
    enabled: keyword.trim().length >= 3,
    staleTime: 30_000,
    retry: false,
  })
}

/** 查询我发出的协作邀请列表 */
export function useCollaborationInvites(guestbookId?: number) {
  return useQuery({
    queryKey: queryKeys.collaboration.invites(guestbookId),
    queryFn: () => api.listCollaborationInvites(guestbookId ? { guestbook_id: guestbookId } : undefined),
  })
}

/** 发送协作邀请 */
export function useCreateCollaborationInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: api.CreateCollaborationInviteInput) => api.createCollaborationInvite(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collaboration.all })
    },
  })
}

/** 查询首页待处理邀请（30s 轮询） */
export function usePendingInvites() {
  return useQuery({
    queryKey: queryKeys.collaboration.pending(),
    queryFn: () => api.getPendingInvites(),
    refetchInterval: 30_000,
  })
}

/** 接受协作邀请 */
export function useAcceptCollaborationInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ inviteId, inviteCode }: { inviteId: number; inviteCode: string }) =>
      api.acceptCollaborationInvite(inviteId, inviteCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collaboration.all })
    },
  })
}

/** 拒绝协作邀请 */
export function useRejectCollaborationInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (inviteId: number) => api.rejectCollaborationInvite(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collaboration.all })
    },
  })
}

/** 查询我接受的协作列表（5min 轮询） */
export function useAcceptedCollaborations() {
  return useQuery({
    queryKey: queryKeys.collaboration.accepted(),
    queryFn: () => api.listAcceptedCollaborations(),
    refetchInterval: 300_000,
  })
}

/** 撤销协作邀请 / 授权 */
export function useRevokeCollaborationInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (inviteId: number) => api.revokeCollaborationInvite(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collaboration.all })
    },
  })
}

/** 查询协作邀请操作日志 */
export function useCollaborationInviteLogs(inviteId: number | null) {
  return useQuery({
    queryKey: queryKeys.collaboration.logs(inviteId ?? 0),
    queryFn: () => api.getCollaborationInviteLogs(inviteId as number),
    enabled: inviteId !== null,
  })
}
