export const queryKeys = {
  guestbooks: {
    all: ['guestbooks'] as const,
    lists: () => [...queryKeys.guestbooks.all, 'list'] as const,
    list: (filters: Record<string, unknown> = {}) =>
      [...queryKeys.guestbooks.lists(), filters] as const,
    details: () => [...queryKeys.guestbooks.all, 'detail'] as const,
    detail: (id: number) => [...queryKeys.guestbooks.details(), id] as const,
    summaries: () => [...queryKeys.guestbooks.all, 'summaries'] as const,
  },
  gbRecords: {
    all: ['gbRecords'] as const,
    lists: () => [...queryKeys.gbRecords.all, 'list'] as const,
    list: (guestbookId: number, filters: Record<string, unknown> = {}) =>
      [...queryKeys.gbRecords.lists(), guestbookId, filters] as const,
    recent: (guestbookId: number) =>
      [...queryKeys.gbRecords.all, 'recent', guestbookId] as const,
    byName: (guestbookId: number, name: string) =>
      [...queryKeys.gbRecords.all, 'search', guestbookId, name] as const,
  },
  dailyRecords: {
    all: ['dailyRecords'] as const,
    lists: () => [...queryKeys.dailyRecords.all, 'list'] as const,
    list: (filters: Record<string, unknown> = {}) =>
      [...queryKeys.dailyRecords.lists(), filters] as const,
    summary: (filters: Record<string, unknown> = {}) =>
      [...queryKeys.dailyRecords.all, 'summary', filters] as const,
  },
  persons: {
    all: ['persons'] as const,
    lists: () => [...queryKeys.persons.all, 'list'] as const,
    list: (filters: Record<string, unknown> = {}) =>
      [...queryKeys.persons.lists(), filters] as const,
    details: () => [...queryKeys.persons.all, 'detail'] as const,
    detail: (id: number) => [...queryKeys.persons.details(), id] as const,
    search: (keyword: string) => [...queryKeys.persons.all, 'search', keyword] as const,
    transactionSummary: (id: number) =>
      [...queryKeys.persons.all, 'transaction', id] as const,
  },
  paymentAccounts: {
    all: ['paymentAccounts'] as const,
    lists: () => [...queryKeys.paymentAccounts.all, 'list'] as const,
    list: (filters: Record<string, unknown> = {}) =>
      [...queryKeys.paymentAccounts.lists(), filters] as const,
    details: () => [...queryKeys.paymentAccounts.all, 'detail'] as const,
    detail: (id: number) => [...queryKeys.paymentAccounts.details(), id] as const,
    receivedToday: (id: number, date: string) =>
      [...queryKeys.paymentAccounts.all, 'received', id, date] as const,
  },
  operationLogs: {
    all: ['operationLogs'] as const,
    lists: () => [...queryKeys.operationLogs.all, 'list'] as const,
    list: (guestbookId: number) => [...queryKeys.operationLogs.lists(), guestbookId] as const,
  },
  terminalSettings: {
    all: ['terminalSettings'] as const,
    detail: (guestbookId: number, clientId: string) =>
      [...queryKeys.terminalSettings.all, guestbookId, clientId] as const,
  },
  stats: {
    all: ['stats'] as const,
    guestbookSummary: (id: number) => [...queryKeys.stats.all, 'guestbook', id] as const,
    accountSummary: (id: number) => [...queryKeys.stats.all, 'account', id] as const,
    personRanking: (limit: number) => [...queryKeys.stats.all, 'ranking', limit] as const,
    monthlyTrend: (months: number) => [...queryKeys.stats.all, 'monthlyTrend', months] as const,
    eventDistribution: () => [...queryKeys.stats.all, 'eventDistribution'] as const,
    guestbookStats: () => [...queryKeys.stats.all, 'guestbookStats'] as const,
  },
  admin: {
    all: ['admin'] as const,
    users: (page: number, pageSize: number) =>
      [...queryKeys.admin.all, 'users', page, pageSize] as const,
    settings: () => [...queryKeys.admin.all, 'settings'] as const,
    auditLogs: (page: number, pageSize: number, filters: Record<string, unknown> = {}) =>
      [...queryKeys.admin.all, 'auditLogs', page, pageSize, filters] as const,
  },
  account: {
    all: ['account'] as const,
    profile: () => [...queryKeys.account.all, 'profile'] as const,
    securityEmails: () => [...queryKeys.account.all, 'securityEmails'] as const,
  },
  collaboration: {
    all: ['collaboration'] as const,
    invites: (guestbookId?: number) =>
      [...queryKeys.collaboration.all, 'invites', guestbookId ?? 'all'] as const,
    pending: () => [...queryKeys.collaboration.all, 'pending'] as const,
    accepted: () => [...queryKeys.collaboration.all, 'accepted'] as const,
    logs: (inviteId: number) => [...queryKeys.collaboration.all, 'logs', inviteId] as const,
  },
}
