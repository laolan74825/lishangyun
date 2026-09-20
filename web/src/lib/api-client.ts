import type {
  AccountType,
  DailyRecord,
  GbRecord,
  Guestbook,
  OperationLog,
  PaymentAccount,
  Person,
  TerminalSettings,
} from '../types'
import { api } from './api'


/* ========================= 礼簿 CRUD ========================= */

export async function createGuestbook(gb: Omit<Guestbook, 'id' | 'created_at'>): Promise<number> {
  const res = await api.post<{ id: number }>('/guestbooks/', gb)
  return res.id
}

export async function updateGuestbook(id: number, changes: Partial<Guestbook>): Promise<number> {
  await api.put(`/guestbooks/${id}`, changes)
  return id
}

export async function getAllGuestbooks(): Promise<Guestbook[]> {
  return api.get<Guestbook[]>('/guestbooks/')
}

export async function getGuestbookById(id: number): Promise<Guestbook | undefined> {
  try {
    return await api.get<Guestbook>(`/guestbooks/${id}`)
  } catch {
    return undefined
  }
}

export async function completeGuestbook(id: number): Promise<void> {
  await api.post(`/guestbooks/${id}/complete`)
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
  changes: Partial<Pick<GbRecord, 'guest_name' | 'phone' | 'amount' | 'payment_method' | 'account_id' | 'note' | 'agent_name' | 'check_status' | 'record_time'>>,
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
  checked: boolean,
  operatorName?: string,
  clientId?: string,
): Promise<void> {
  await api.patch(`/gb-records/${recordId}/check`, {
    check_status: checked ? 'checked' : 'unchecked',
    operator_name: operatorName,
    client_id: clientId,
  })
}

export async function uncheckRecord(
  recordId: number,
  operatorName?: string,
  clientId?: string,
): Promise<void> {
  await updateCheckStatus(recordId, false, operatorName, clientId)
}

export async function batchUpdateCheckStatus(
  recordIds: number[],
  checked: boolean,
  operatorName?: string,
  clientId?: string,
): Promise<void> {
  await api.post('/gb-records/batch-check', {
    record_ids: recordIds,
    check_status: checked ? 'checked' : 'unchecked',
    operator_name: operatorName,
    client_id: clientId,
  })
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
  return api.get<DailyRecord[]>(`/daily-records/${qs ? `?${qs}` : ''}`)
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
  return api.get<GbRecord[]>(`/guestbooks/${guestbookId}/records${qs ? `?${qs}` : ''}`)
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
  const records = await api.get<GbRecord[]>(
    `/guestbooks/${guestbookId}/records/duplicate?name=${encodeURIComponent(name)}`,
  )
  return records.length > 0
}

export async function findDuplicatesByName(
  guestbookId: number,
  name: string,
): Promise<GbRecord[]> {
  return api.get<GbRecord[]>(
    `/guestbooks/${guestbookId}/records/duplicate?name=${encodeURIComponent(name)}`,
  )
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
  return api.get<Person[]>('/persons/')
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

/* ========================= 账户管理 ========================= */

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
  return api.get<PaymentAccount[]>(`/payment-accounts/${qs ? `?${qs}` : ''}`)
}

export async function getPaymentAccounts(type?: AccountType): Promise<PaymentAccount[]> {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  params.set('active_only', 'true')
  const qs = params.toString()
  return api.get<PaymentAccount[]>(`/payment-accounts/${qs ? `?${qs}` : ''}`)
}

export async function getPaymentAccountById(id: number): Promise<PaymentAccount | undefined> {
  try {
    return await api.get<PaymentAccount>(`/payment-accounts/${id}`)
  } catch {
    return undefined
  }
}

/* ========================= 操作日志 ========================= */

export interface AddLogInput {
  guestbook_id: number
  gb_record_id?: number
  action_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'MERGE'
  operator_name?: string
  client_id?: string
  before_data?: string
  after_data?: string
}

export async function addOperationLog(_input: AddLogInput): Promise<number> {
  return 0
}

export async function getOperationLogs(guestbookId: number, limit = 100): Promise<OperationLog[]> {
  return api.get<OperationLog[]>(`/guestbooks/${guestbookId}/operation-logs?limit=${limit}`)
}

/* ========================= 终端设置 ========================= */

export async function getTerminalSettings(
  guestbookId: number,
  clientId: string,
): Promise<TerminalSettings | undefined> {
  try {
    const list = await api.get<TerminalSettings[]>(
      `/terminal-settings/?guestbook_id=${guestbookId}&client_id=${encodeURIComponent(clientId)}`,
    )
    return list[0]
  } catch {
    return undefined
  }
}

export async function saveTerminalSettings(
  settings: Omit<TerminalSettings, 'id' | 'updated_at'>,
): Promise<number> {
  const res = await api.put<{ id: number }>('/terminal-settings/', settings)
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
  return api.get<number>(`/payment-accounts/${accountId}/received-today?date=${date}`)
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
