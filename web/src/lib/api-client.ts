import type {
  AccountType,
  AdminUser,
  AdminUserCreate,
  AdminUserUpdate,
  BalanceAdjustment,
  CollaborationActionLog,
  CollaborationInvite,
  CollaborationInviteAccepted,
  CollaborationInvitePending,
  DailyRecord,
  EventDistributionItem,
  FamilyGroup,
  FamilyMember,
  GbRecord,
  Guestbook,
  GuestbookStatsItem,
  MonthlyTrendItem,
  Notification,
  OperationLog,
  PaginatedResponse,
  PaymentAccount,
  PendingApproval,
  Person,
  PersonMergeResult,
  ProfileResponse,
  SecurityEmailItem,
  SystemSettings,
  TerminalSettings,
} from '../types'
import { api } from './api'
import { getToken } from './auth'


/* ========================= 礼簿 CRUD ========================= */

export interface CreateGuestbookInput {
  name: string
  event_type: string
  event_date: string
  host_person_id?: number
  operator_note?: string
}

export async function createGuestbook(gb: CreateGuestbookInput): Promise<number> {
  const res = await api.post<{ id: number }>('/guestbooks/', gb)
  return res.id
}

export async function updateGuestbook(id: number, changes: Partial<Guestbook>): Promise<number> {
  await api.put(`/guestbooks/${id}`, changes)
  return id
}

export async function getAllGuestbooks(): Promise<Guestbook[]> {
  const res = await api.get<PaginatedResponse<Guestbook>>('/guestbooks/')
  return res.items
}

export async function getGuestbooksPaginated(
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedResponse<Guestbook>> {
  return api.get<PaginatedResponse<Guestbook>>(
    `/guestbooks/?page=${page}&page_size=${pageSize}`
  )
}

export async function getGuestbookById(id: number): Promise<Guestbook | undefined> {
  try {
    return await api.get<Guestbook>(`/guestbooks/${id}`)
  } catch {
    return undefined
  }
}

export async function closeGuestbook(id: number): Promise<void> {
  await api.post(`/guestbooks/${id}/close`)
}

export async function archiveGuestbook(id: number): Promise<void> {
  await api.post(`/guestbooks/${id}/archive`)
}

export async function deleteGuestbook(id: number): Promise<void> {
  await api.delete(`/guestbooks/${id}`)
}

/* ========================= 收礼记录 CRUD ========================= */

export interface CreateGbRecordInput {
  guestbook_id: number
  guest_name: string
  phone?: string
  amount: number
  payment_method: 'cash' | 'wechat' | 'other'
  account_id?: number
  note?: string
  agent_name?: string
  record_time?: string
  client_id?: string
  operator_name?: string
}

export async function createGbRecord(input: CreateGbRecordInput): Promise<number> {
  const res = await api.post<{ id: number }>(`/guestbooks/${input.guestbook_id}/records`, input)
  return res.id
}

export async function createGbRecordBatch(inputs: CreateGbRecordInput[]): Promise<number[]> {
  if (inputs.length === 0) return []
  const guestbook_id = inputs[0].guestbook_id
  const res = await api.post<{ ids: number[] }>(`/guestbooks/${guestbook_id}/records/batch`, { records: inputs })
  return res.ids
}

export async function updateGbRecord(
  id: number,
  changes: Partial<Pick<GbRecord, 'guest_name' | 'phone' | 'amount' | 'payment_method' | 'account_id' | 'note' | 'agent_name' | 'check_status' | 'record_time' | 'is_private'>>,
  operatorName?: string,
  clientId?: string,
): Promise<void> {
  await api.put(`/gb-records/${id}`, { ...changes, operator_name: operatorName, client_id: clientId })
}

export async function deleteGbRecord(
  id: number,
  operatorName?: string,
  clientId?: string,
): Promise<void> {
  await api.delete(`/gb-records/${id}?operator_name=${encodeURIComponent(operatorName ?? '')}&client_id=${encodeURIComponent(clientId ?? '')}`)
}

export async function updateCheckStatus(
  recordId: number,
  status: 'unchecked' | 'checked' | 'disputed',
  operatorName?: string,
  clientId?: string,
): Promise<void> {
  await api.patch(`/gb-records/${recordId}/check`, {
    check_status: status,
    operator_name: operatorName,
    client_id: clientId,
  })
}

export async function uncheckRecord(
  recordId: number,
  operatorName?: string,
  clientId?: string,
): Promise<void> {
  await updateCheckStatus(recordId, 'unchecked', operatorName, clientId)
}

export async function markRecordDisputed(
  recordId: number,
  operatorName?: string,
  clientId?: string,
): Promise<void> {
  await updateCheckStatus(recordId, 'disputed', operatorName, clientId)
}

export async function batchUpdateCheckStatus(
  recordIds: number[],
  status: 'unchecked' | 'checked' | 'disputed',
  operatorName?: string,
  clientId?: string,
): Promise<void> {
  await api.post('/gb-records/batch-check', {
    record_ids: recordIds,
    check_status: status,
    operator_name: operatorName,
    client_id: clientId,
  })
}

/* ========================= 代理送礼 ========================= */

export interface CreateProxyRecordInput {
  guest_name: string
  phone?: string
  amount: number
  payment_method: 'cash' | 'wechat' | 'other'
  account_id?: number
  note?: string
  agent_name?: string
  record_time?: string
  person_id?: number
}

export async function createProxyRecords(
  guestbookId: number,
  records: CreateProxyRecordInput[],
): Promise<number[]> {
  return api.post<number[]>(`/guestbooks/${guestbookId}/proxy-records`, { records })
}

/* ========================= 日常记录 CRUD ========================= */

export interface CreateDailyRecordInput {
  type: 'out' | 'in'
  person_id?: number
  person_name: string
  phone?: string
  amount: number
  event_type: string
  payment_method?: 'cash' | 'wechat' | 'other'
  account_id?: number
  event_date: string
  note?: string
  is_private?: boolean
  created_by?: string
}

export async function createDailyRecord(input: CreateDailyRecordInput): Promise<number> {
  const res = await api.post<{ id: number }>('/daily-records/', input)
  return res.id
}

export async function updateDailyRecord(
  id: number,
  changes: Partial<Omit<DailyRecord, 'id' | 'uuid' | 'created_at'>>,
): Promise<void> {
  await api.put(`/daily-records/${id}`, changes)
}

export async function deleteDailyRecord(id: number): Promise<void> {
  await api.delete(`/daily-records/${id}`)
}

export async function getDailyRecords(opts?: {
  type?: 'out' | 'in'
  keyword?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}): Promise<DailyRecord[]> {
  const params = new URLSearchParams()
  if (opts?.type) params.set('type', opts.type)
  if (opts?.keyword) params.set('keyword', opts.keyword)
  if (opts?.startDate) params.set('start_date', opts.startDate)
  if (opts?.endDate) params.set('end_date', opts.endDate)
  if (opts?.limit !== undefined) params.set('limit', String(opts.limit))
  if (opts?.offset !== undefined) params.set('offset', String(opts.offset))
  const qs = params.toString()
  const res = await api.get<PaginatedResponse<DailyRecord>>(`/daily-records/${qs ? `?${qs}` : ''}`)
  return res.items
}

export async function getDailyRecordsPaginated(
  page: number = 1,
  pageSize: number = 20,
  filters?: {
    type?: 'out' | 'in'
    keyword?: string
    start_date?: string
    end_date?: string
  }
): Promise<PaginatedResponse<DailyRecord>> {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  if (filters?.type) params.set('type', filters.type)
  if (filters?.keyword) params.set('keyword', filters.keyword)
  if (filters?.start_date) params.set('start_date', filters.start_date)
  if (filters?.end_date) params.set('end_date', filters.end_date)
  return api.get<PaginatedResponse<DailyRecord>>(`/daily-records?${params.toString()}`)
}

export async function dailyRecordsSummary(opts?: {
  type?: 'out' | 'in'
  startDate?: string
  endDate?: string
  keyword?: string
}) {
  const params = new URLSearchParams()
  if (opts?.type) params.set('type', opts.type)
  if (opts?.keyword) params.set('keyword', opts.keyword)
  if (opts?.startDate) params.set('start_date', opts.startDate)
  if (opts?.endDate) params.set('end_date', opts.endDate)
  const qs = params.toString()
  return api.get<{ total_records: number; total_out: number; total_in: number; net: number }>(
    `/daily-records/summary${qs ? `?${qs}` : ''}`,
  )
}

/* ========================= 查询辅助 ========================= */

export async function getGbRecordsByGuestbook(
  guestbookId: number,
  opts?: { limit?: number; offset?: number },
): Promise<GbRecord[]> {
  const params = new URLSearchParams()
  if (opts?.limit !== undefined) params.set('limit', String(opts.limit))
  if (opts?.offset !== undefined) params.set('offset', String(opts.offset))
  const qs = params.toString()
  const res = await api.get<PaginatedResponse<GbRecord>>(`/guestbooks/${guestbookId}/records${qs ? `?${qs}` : ''}`)
  return res.items
}

export async function getGbRecordsPaginated(
  guestbookId: number,
  page: number = 1,
  pageSize: number = 20,
  filters?: {
    check_status?: string
    payment_method?: string
    keyword?: string
  }
): Promise<PaginatedResponse<GbRecord>> {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  if (filters?.check_status) params.set('check_status', filters.check_status)
  if (filters?.payment_method) params.set('payment_method', filters.payment_method)
  if (filters?.keyword) params.set('keyword', filters.keyword)
  return api.get<PaginatedResponse<GbRecord>>(
    `/guestbooks/${guestbookId}/records?${params.toString()}`
  )
}

export async function getRecentRecords(guestbookId: number, limit = 5): Promise<GbRecord[]> {
  return api.get<GbRecord[]>(`/guestbooks/${guestbookId}/records/recent?limit=${limit}`)
}

export async function searchGbRecordsByName(
  guestbookId: number,
  keyword: string,
): Promise<GbRecord[]> {
  return api.get<GbRecord[]>(`/guestbooks/${guestbookId}/records/search?q=${encodeURIComponent(keyword)}`)
}

export async function checkDuplicateName(
  guestbookId: number,
  name: string,
): Promise<boolean> {
  const res = await api.get<{ has_duplicate: boolean; records: GbRecord[] }>(
    `/guestbooks/${guestbookId}/records/duplicate?name=${encodeURIComponent(name)}`,
  )
  return res.has_duplicate
}

export async function findDuplicatesByName(
  guestbookId: number,
  name: string,
): Promise<GbRecord[]> {
  const res = await api.get<{ has_duplicate: boolean; records: GbRecord[] }>(
    `/guestbooks/${guestbookId}/records/duplicate?name=${encodeURIComponent(name)}`,
  )
  return res.records
}

export async function findRecordByPhone(
  guestbookId: number,
  phone: string,
): Promise<GbRecord | undefined> {
  const records = await api.get<GbRecord[]>(
    `/guestbooks/${guestbookId}/records/phone?phone=${encodeURIComponent(phone)}`,
  )
  return records[0]
}

/* ========================= 人员管理 CRUD ========================= */

export async function createPerson(
  data: Omit<Person, 'id' | 'created_at'>,
): Promise<number> {
  const res = await api.post<{ id: number }>('/persons/', data)
  return res.id
}

export async function updatePerson(id: number, changes: Partial<Person>): Promise<void> {
  await api.put(`/persons/${id}`, changes)
}

export async function deletePerson(id: number): Promise<void> {
  await api.delete(`/persons/${id}`)
}

export async function getAllPersons(): Promise<Person[]> {
  const res = await api.get<PaginatedResponse<Person>>('/persons/')
  return res.items
}

export async function getPersonsPaginated(
  page: number = 1,
  pageSize: number = 20,
  filters?: {
    keyword?: string
    relation_tag?: string
  }
): Promise<PaginatedResponse<Person>> {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  if (filters?.keyword) params.set('keyword', filters.keyword)
  if (filters?.relation_tag) params.set('relation_tag', filters.relation_tag)
  return api.get<PaginatedResponse<Person>>(`/persons?${params.toString()}`)
}

export async function getPersonById(id: number): Promise<Person | undefined> {
  try {
    return await api.get<Person>(`/persons/${id}`)
  } catch {
    return undefined
  }
}

export async function searchPersons(keyword: string): Promise<Person[]> {
  return api.get<Person[]>(`/persons/search?q=${encodeURIComponent(keyword)}`)
}

export async function mergePersons(
  sourcePersonId: number,
  targetPersonId: number,
): Promise<PersonMergeResult> {
  return api.post<PersonMergeResult>('/persons/merge', {
    source_person_id: sourcePersonId,
    target_person_id: targetPersonId,
  })
}

/* ========================= 收款账户管理 ========================= */

export async function createPaymentAccount(
  data: Omit<PaymentAccount, 'id' | 'created_at'>,
): Promise<number> {
  const res = await api.post<{ id: number }>('/payment-accounts/', data)
  return res.id
}

export async function updatePaymentAccount(id: number, changes: Partial<PaymentAccount>): Promise<void> {
  await api.put(`/payment-accounts/${id}`, changes)
}

export async function deletePaymentAccount(id: number): Promise<void> {
  await api.delete(`/payment-accounts/${id}`)
}

export async function getAllPaymentAccounts(type?: AccountType): Promise<PaymentAccount[]> {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  params.set('active_only', 'false')
  const qs = params.toString()
  const res = await api.get<PaginatedResponse<PaymentAccount>>(`/payment-accounts/${qs ? `?${qs}` : ''}`)
  return res.items
}

export async function getPaymentAccounts(type?: AccountType): Promise<PaymentAccount[]> {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  params.set('active_only', 'true')
  const qs = params.toString()
  const res = await api.get<PaginatedResponse<PaymentAccount>>(`/payment-accounts/${qs ? `?${qs}` : ''}`)
  return res.items
}

export async function getPaymentAccountById(id: number): Promise<PaymentAccount | undefined> {
  try {
    return await api.get<PaymentAccount>(`/payment-accounts/${id}`)
  } catch {
    return undefined
  }
}

/* ========================= 操作日志 ========================= */

export async function getOperationLogs(guestbookId: number, limit = 100): Promise<OperationLog[]> {
  const res = await api.get<PaginatedResponse<OperationLog>>(`/operation-logs?guestbook_id=${guestbookId}&page_size=${limit}`)
  return res.items
}

export async function getOperationLogsPaginated(
  page: number = 1,
  pageSize: number = 20,
  filters?: {
    target_table?: string
    action_type?: string
    start_date?: string
    end_date?: string
  }
): Promise<PaginatedResponse<OperationLog>> {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  if (filters?.target_table) params.set('target_table', filters.target_table)
  if (filters?.action_type) params.set('action_type', filters.action_type)
  if (filters?.start_date) params.set('start_date', filters.start_date)
  if (filters?.end_date) params.set('end_date', filters.end_date)
  return api.get<PaginatedResponse<OperationLog>>(`/operation-logs?${params.toString()}`)
}

/* ========================= 终端设置 ========================= */

export async function getTerminalSettings(
  guestbookId: number,
  clientId: string,
): Promise<TerminalSettings | undefined> {
  try {
    return await api.get<TerminalSettings>(
      `/terminal-settings/?guestbook_id=${guestbookId}&client_id=${encodeURIComponent(clientId)}`,
    )
  } catch {
    return undefined
  }
}

export async function saveTerminalSettings(
  settings: Omit<TerminalSettings, 'id' | 'updated_at'>,
): Promise<number> {
  const { guestbook_id, ...body } = settings
  const res = await api.put<{ id: number }>(`/terminal-settings/?guestbook_id=${guestbook_id}`, body)
  return res.id
}

/* ========================= 统计视图 ========================= */

export async function guestbookSummary(guestbookId: number) {
  return api.get<{
    total_records: number
    total_amount: number
    checked_count: number
    unchecked_count: number
  }>(`/guestbooks/${guestbookId}/summary`)
}

export async function accountSummary(guestbookId: number) {
  const items = await api.get<
    { account_id: number; account_name: string; account_type: string; record_count: number; total_amount: number }[]
  >(`/guestbooks/${guestbookId}/account-summary`)
  const map = new Map<number, { record_count: number; total_amount: number }>()
  for (const item of items) {
    map.set(item.account_id, { record_count: item.record_count, total_amount: item.total_amount })
  }
  return map
}

export async function wechatReceivedToday(accountId: number, date: string, _guestbookId?: number) {
  const res = await api.get<{ received: number }>(`/payment-accounts/${accountId}/received-today?date=${date}`)
  return res.received
}

export async function wechatRemainingLimit(account: PaymentAccount, date: string): Promise<number> {
  if (account.type !== 'wechat') return Infinity
  const received = await wechatReceivedToday(account.id!, date)
  return account.daily_limit - received
}

/* ========================= 人员往来查询 ========================= */

export async function getPersonDailyRecords(personId: number): Promise<DailyRecord[]> {
  const summary = await api.get<{ daily_records: DailyRecord[] }>(`/persons/${personId}/summary`)
  return summary.daily_records || []
}

export async function getPersonGbRecords(personId: number): Promise<GbRecord[]> {
  const summary = await api.get<{ gb_records: GbRecord[] }>(`/persons/${personId}/summary`)
  return summary.gb_records || []
}

export async function getPersonTransactionSummary(personId: number) {
  return api.get<{ total_out: number; total_in: number; net: number }>(`/persons/${personId}/summary`)
}

export async function getAllGuestbookSummaries() {
  return api.get<
    (Guestbook & {
      total_records: number
      total_amount: number
      checked_count: number
      unchecked_count: number
      checked_amount: number
      unchecked_amount: number
    })[]
  >('/guestbooks/summaries')
}

export async function getPersonRanking(limit = 10) {
  return api.get<
    { name: string; total_out: number; total_in: number; net: number; absNet: number }[]
  >(`/stats/person-ranking?limit=${limit}`)
}

export async function getDailyRecordsByName(name: string): Promise<DailyRecord[]> {
  const res = await api.get<{ daily_records: DailyRecord[] }>(
    `/stats/transaction-by-name?name=${encodeURIComponent(name)}`,
  )
  return res.daily_records || []
}

export async function getGbRecordsByName(name: string): Promise<GbRecord[]> {
  const res = await api.get<{ gb_records: GbRecord[] }>(
    `/stats/transaction-by-name?name=${encodeURIComponent(name)}`,
  )
  return res.gb_records || []
}

export async function getTransactionSummaryByName(name: string) {
  return api.get<{
    total_out: number
    total_in: number
    net: number
    daily_count: number
    gb_count: number
  }>(`/stats/transaction-by-name?name=${encodeURIComponent(name)}`)
}

/* ========================= 差额调整 ========================= */

export async function getBalanceAdjustments(
  personId?: number,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResponse<BalanceAdjustment>> {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  if (personId) params.set('person_id', String(personId))
  return api.get<PaginatedResponse<BalanceAdjustment>>(`/balance-adjustments/?${params.toString()}`)
}

export async function createBalanceAdjustment(data: {
  person_id: number
  amount: number
  reason: string
}): Promise<number> {
  const res = await api.post<{ id: number }>('/balance-adjustments/', data)
  return res.id
}

/* ========================= 增强统计 ========================= */

export async function getMonthlyTrend(months: number = 12): Promise<MonthlyTrendItem[]> {
  return api.get<MonthlyTrendItem[]>(`/stats/monthly-trend?months=${months}`)
}

export async function getEventDistribution(): Promise<EventDistributionItem[]> {
  return api.get<EventDistributionItem[]>('/stats/event-distribution')
}

export async function getGuestbookStats(): Promise<GuestbookStatsItem[]> {
  return api.get<GuestbookStatsItem[]>('/stats/guestbook-summary')
}

/* ========================= 数据导出 ========================= */

export async function exportDailyRecords(
  format: 'xlsx' | 'csv' = 'xlsx',
  filters?: {
    type?: 'in' | 'out'
    start_date?: string
    end_date?: string
    include_private?: boolean
  },
): Promise<Blob> {
  const params = new URLSearchParams()
  params.set('format', format)
  if (filters?.type) params.set('type', filters.type)
  if (filters?.start_date) params.set('start_date', filters.start_date)
  if (filters?.end_date) params.set('end_date', filters.end_date)
  if (filters?.include_private !== undefined) params.set('include_private', String(filters.include_private))
  return api.getBlob(`/export/daily-records?${params.toString()}`)
}

export async function exportGuestbook(guestbookId: number): Promise<Blob> {
  return api.getBlob(`/export/guestbooks/${guestbookId}`)
}

/* ========================= 数据导入 ========================= */

export interface ImportPreviewRow {
  row_number: number
  data: Record<string, string>
  is_valid: boolean
  errors: string[]
  is_duplicate: boolean
  duplicate_summary: string | null
}

export interface ImportPreviewResult {
  import_type: 'daily_record' | 'gb_record'
  total_rows: number
  valid_rows: number
  invalid_rows: number
  duplicate_rows: number
  rows: ImportPreviewRow[]
  file_name: string
}

export async function downloadImportTemplate(templateType: 'daily_record' | 'gb_record'): Promise<Blob> {
  return api.getBlob(`/import/templates/${templateType}`)
}

export async function previewImport(
  file: File,
  importType: 'daily_record' | 'gb_record',
  guestbookId?: number,
): Promise<ImportPreviewResult> {
  const formData = new FormData()
  formData.append('file', file)
  const params = new URLSearchParams()
  params.set('import_type', importType)
  if (guestbookId) params.set('guestbook_id', String(guestbookId))

  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`/api/import/preview?${params.toString()}`, {
    method: 'POST',
    headers,
    body: formData,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || body.message || detail
    } catch { /* ignore */ }
    throw new Error(detail)
  }
  return res.json()
}

export async function commitImport(
  fileName: string,
  importType: 'daily_record' | 'gb_record',
  validRowIndices: number[],
  duplicateStrategy: 'skip' | 'overwrite' | 'import_all' = 'skip',
  guestbookId?: number,
): Promise<{ imported_count: number; skipped_count: number; overwritten_count: number; errors: object[] }> {
  return api.post('/import/commit', {
    import_type: importType,
    file_name: fileName,
    valid_row_indices: validRowIndices,
    duplicate_strategy: duplicateStrategy,
    guestbook_id: guestbookId,
  })
}

/* ========================= 家庭组管理 ========================= */

export async function createFamilyGroup(data: {
  name: string
  description?: string
  invite_expires_hours?: number
}): Promise<{ id: number; invite_code: string }> {
  return api.post('/family/groups', data)
}

export async function listMyFamilyGroups(): Promise<FamilyGroup[]> {
  return api.get<FamilyGroup[]>('/family/groups')
}

export async function getFamilyGroup(groupId: number): Promise<FamilyGroup> {
  return api.get<FamilyGroup>(`/family/groups/${groupId}`)
}

export async function updateFamilyGroup(groupId: number, data: {
  name?: string
  description?: string
}): Promise<void> {
  await api.put(`/family/groups/${groupId}`, data)
}

export async function dissolveFamilyGroup(groupId: number): Promise<void> {
  await api.delete(`/family/groups/${groupId}`)
}

export async function refreshInviteCode(groupId: number): Promise<{
  invite_code: string
  invite_expires_at: string | null
}> {
  return api.post(`/family/groups/${groupId}/refresh-invite`)
}

export async function joinFamilyGroup(inviteCode: string): Promise<{
  message: string
  group_id: number
}> {
  return api.post('/family/join', { invite_code: inviteCode })
}

export async function leaveFamilyGroup(groupId: number): Promise<void> {
  await api.post(`/family/groups/${groupId}/leave`)
}

export async function listFamilyMembers(groupId: number): Promise<FamilyMember[]> {
  return api.get<FamilyMember[]>(`/family/groups/${groupId}/members`)
}

export async function updateMemberRole(groupId: number, memberId: number, role: string): Promise<void> {
  await api.put(`/family/groups/${groupId}/members/${memberId}/role`, { role })
}

export async function toggleMemberActive(groupId: number, memberId: number, isActive: boolean): Promise<void> {
  await api.put(`/family/groups/${groupId}/members/${memberId}/active`, { is_active: isActive })
}

export async function removeMember(groupId: number, memberId: number): Promise<void> {
  await api.delete(`/family/groups/${groupId}/members/${memberId}`)
}

export async function getSharedPersons(groupId: number, page = 1, pageSize = 20): Promise<PaginatedResponse<Person>> {
  return api.get<PaginatedResponse<Person>>(
    `/family/groups/${groupId}/shared/persons?page=${page}&page_size=${pageSize}`
  )
}

export async function getSharedDailyRecords(groupId: number, page = 1, pageSize = 20): Promise<PaginatedResponse<DailyRecord>> {
  return api.get<PaginatedResponse<DailyRecord>>(
    `/family/groups/${groupId}/shared/daily-records?page=${page}&page_size=${pageSize}`
  )
}

export async function getSharedStats(groupId: number): Promise<{
  person_count: number
  total_received: number
  total_sent: number
  member_count: number
}> {
  return api.get(`/family/groups/${groupId}/shared/stats`)
}

/* ========================= 协作邀请 ========================= */

export interface UserSearchResult {
  id: number
  username: string
  email: string | null
}

export async function searchUser(keyword: string): Promise<UserSearchResult> {
  return api.get<UserSearchResult>(
    `/collaboration/search?keyword=${encodeURIComponent(keyword)}`
  )
}

export interface CreateCollaborationInviteInput {
  invitee_keyword: string
  guestbook_id: number
  permissions: 'record' | 'reconcile' | 'both'
  collaboration_start_at: string
  collaboration_end_at: string
}

export interface CreateCollaborationInviteResult {
  id: number
  invite_code: string
  invitee_email: string | null
  signal_expires_at: string
  collaboration_start_at: string
  collaboration_end_at: string
}

export async function createCollaborationInvite(
  data: CreateCollaborationInviteInput
): Promise<CreateCollaborationInviteResult> {
  return api.post('/collaboration/invites', data)
}

export async function getPendingInvites(): Promise<CollaborationInvitePending[]> {
  return api.get<CollaborationInvitePending[]>('/collaboration/invites/pending')
}

export async function acceptCollaborationInvite(
  inviteId: number,
  inviteCode: string
): Promise<{
  message: string
  guestbook_id: number
  permissions: string
  collaboration_start_at: string
  collaboration_end_at: string
}> {
  return api.post('/collaboration/invites/accept', {
    invite_id: inviteId,
    invite_code: inviteCode,
  })
}

export async function rejectCollaborationInvite(inviteId: number): Promise<{ message: string }> {
  return api.post(`/collaboration/invites/${inviteId}/reject`)
}

export async function listCollaborationInvites(filters?: {
  guestbook_id?: number
  status?: string
}): Promise<CollaborationInvite[]> {
  const params = new URLSearchParams()
  if (filters?.guestbook_id) params.set('guestbook_id', String(filters.guestbook_id))
  if (filters?.status) params.set('status', filters.status)
  const qs = params.toString()
  return api.get<CollaborationInvite[]>(`/collaboration/invites${qs ? `?${qs}` : ''}`)
}

export async function listAcceptedCollaborations(): Promise<CollaborationInviteAccepted[]> {
  return api.get<CollaborationInviteAccepted[]>('/collaboration/invites/accepted')
}

export async function revokeCollaborationInvite(inviteId: number): Promise<{ message: string }> {
  return api.post(`/collaboration/invites/${inviteId}/revoke`)
}

export async function getCollaborationInviteLogs(inviteId: number): Promise<CollaborationActionLog[]> {
  return api.get<CollaborationActionLog[]>(`/collaboration/invites/${inviteId}/logs`)
}

/* ========================= 审批管理 ========================= */

export async function submitApproval(data: {
  family_group_id: number
  action_type: 'CREATE' | 'UPDATE' | 'DELETE'
  target_table: string
  target_id?: number
  data_snapshot?: Record<string, unknown>
}): Promise<{ id: number; message: string }> {
  return api.post('/approvals/', data)
}

export async function listApprovals(filters?: {
  group_id?: number
  status?: string
  submitter_id?: number
  page?: number
  page_size?: number
}): Promise<PendingApproval[]> {
  const params = new URLSearchParams()
  if (filters?.group_id) params.set('group_id', String(filters.group_id))
  if (filters?.status) params.set('status', filters.status)
  if (filters?.submitter_id) params.set('submitter_id', String(filters.submitter_id))
  if (filters?.page) params.set('page', String(filters.page))
  if (filters?.page_size) params.set('page_size', String(filters.page_size))
  const qs = params.toString()
  return api.get<PendingApproval[]>(`/approvals/${qs ? `?${qs}` : ''}`)
}

export async function getApproval(approvalId: number): Promise<PendingApproval> {
  return api.get<PendingApproval>(`/approvals/${approvalId}`)
}

export async function reviewApproval(
  approvalId: number,
  approved: boolean,
  note?: string,
): Promise<{ message: string }> {
  return api.put(`/approvals/${approvalId}/review`, { approved, note })
}

export async function expireApprovals(): Promise<{ expired_count: number }> {
  return api.post('/approvals/expire')
}

/* ========================= 通知管理 ========================= */

export async function listNotifications(filters?: {
  is_read?: boolean
  type?: string
  page?: number
  page_size?: number
}): Promise<Notification[]> {
  const params = new URLSearchParams()
  if (filters?.is_read !== undefined) params.set('is_read', String(filters.is_read))
  if (filters?.type) params.set('type', filters.type)
  if (filters?.page) params.set('page', String(filters.page))
  if (filters?.page_size) params.set('page_size', String(filters.page_size))
  const qs = params.toString()
  return api.get<Notification[]>(`/notifications/${qs ? `?${qs}` : ''}`)
}

export async function getUnreadNotificationCount(): Promise<{ unread_count: number }> {
  return api.get('/notifications/unread-count')
}

export async function markNotificationRead(notificationId: number): Promise<void> {
  await api.put(`/notifications/${notificationId}/read`)
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.put('/notifications/read-all')
}

export async function deleteNotification(notificationId: number): Promise<void> {
  await api.delete(`/notifications/${notificationId}`)
}

/* ========================= 安全模式管理 ========================= */

export async function getSecurityConfig(): Promise<import('../types').SecurityConfig> {
  return api.get<import('../types').SecurityConfig>('/security/config')
}

export async function getSecurityConfigDetail(): Promise<import('../types').SecurityConfigDetail> {
  return api.get<import('../types').SecurityConfigDetail>('/security/config/detail')
}

export async function enableEnhancedMode(data: {
  encrypted_key: string
  mnemonic_hash: string
}): Promise<{ message: string }> {
  return api.post('/security/enable-enhanced', data)
}

export async function verifyMnemonic(data: {
  mnemonic_hash: string
}): Promise<{ verified: boolean; message: string }> {
  return api.post('/security/verify-mnemonic', data)
}

export async function disableEnhancedMode(data: {
  mnemonic_hash: string
}): Promise<{ message: string }> {
  return api.post('/security/disable-enhanced', data)
}

export async function uploadFamilyKey(data: {
  encrypted_family_key: string
}): Promise<{ message: string }> {
  return api.post('/security/upload-family-key', data)
}

/* ========================= 修改密码 ========================= */

export async function changePassword(data: {
  old_password: string
  new_password: string
}): Promise<void> {
  await api.put('/auth/password', data)
}

/* ========================= 密码重置 ========================= */

export async function requestPasswordReset(email: string): Promise<void> {
  await api.post('/auth/password-reset/request', { email })
}

export async function confirmPasswordReset(data: {
  email: string
  code: string
  new_password: string
}): Promise<void> {
  await api.post('/auth/password-reset/confirm', data)
}

/* ========================= 个人账户管理 ========================= */

export async function getProfile(): Promise<ProfileResponse> {
  return api.get<ProfileResponse>('/account/profile')
}

export async function updateProfile(data: {
  nickname?: string
  auto_lock_minutes?: number
}): Promise<void> {
  await api.put('/account/profile', data)
}

export async function getSecurityEmails(): Promise<SecurityEmailItem[]> {
  return api.get<SecurityEmailItem[]>('/account/security-emails')
}

export async function sendSecurityEmailCode(email: string): Promise<void> {
  await api.post('/account/security-emails/send-code', { email })
}

export async function addSecurityEmail(email: string, code: string): Promise<void> {
  await api.post('/account/security-emails', { email, code })
}

export async function deleteSecurityEmail(emailId: number): Promise<void> {
  await api.delete(`/account/security-emails/${emailId}`)
}

export async function deleteAccount(password: string): Promise<void> {
  await api.post('/account/delete', { password })
}

/* ========================= 管理后台 ========================= */

export async function getAdminUsers(
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResponse<AdminUser>> {
  return api.get<PaginatedResponse<AdminUser>>(
    `/admin/users?page=${page}&page_size=${pageSize}`
  )
}

export async function createAdminUser(data: AdminUserCreate): Promise<AdminUser> {
  return api.post<AdminUser>('/admin/users', data)
}

export async function updateAdminUser(userId: number, data: AdminUserUpdate): Promise<void> {
  await api.put(`/admin/users/${userId}`, data)
}

export async function deleteAdminUser(userId: number): Promise<void> {
  await api.delete(`/admin/users/${userId}`)
}

export async function getSystemSettings(): Promise<SystemSettings> {
  return api.get<SystemSettings>('/admin/settings')
}

export async function updateSystemSettings(data: {
  smtp_host?: string
  smtp_port?: number
  smtp_user?: string
  smtp_password?: string
}): Promise<void> {
  await api.put('/admin/settings', data)
}
