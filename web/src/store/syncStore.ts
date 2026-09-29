import { create } from 'zustand'

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict'

export interface SyncConflict {
  id: string
  table: string
  local: Record<string, unknown>
  remote: Record<string, unknown>
  conflict_type: 'update_update' | 'update_delete' | 'create_create'
  detected_at: number
}

interface SyncState {
  status: SyncStatus
  lastSyncedAt: number | null
  lastError: string | null
  pendingCount: number
  conflictCount: number
  conflicts: SyncConflict[]

  setStatus: (status: SyncStatus) => void
  setLastSyncedAt: (timestamp: number) => void
  setLastError: (error: string | null) => void
  setPendingCount: (count: number) => void
  setConflicts: (conflicts: SyncConflict[]) => void
  removeConflict: (id: string) => void
  clearConflicts: () => void
  reset: () => void
}

const initialState = {
  status: 'idle' as SyncStatus,
  lastSyncedAt: null as number | null,
  lastError: null as string | null,
  pendingCount: 0,
  conflictCount: 0,
  conflicts: [] as SyncConflict[],
}

export const useSyncStore = create<SyncState>((set) => ({
  ...initialState,

  setStatus: (status) => set({ status }),
  setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp, status: 'synced' }),
  setLastError: (error) => set({ lastError: error, status: 'error' }),
  setPendingCount: (count) => set({ pendingCount: count }),
  setConflicts: (conflicts) => set({
    conflicts,
    conflictCount: conflicts.length,
    status: conflicts.length > 0 ? 'conflict' : 'synced',
  }),
  removeConflict: (id) => set((state) => {
    const conflicts = state.conflicts.filter((c) => c.id !== id)
    return {
      conflicts,
      conflictCount: conflicts.length,
      status: conflicts.length > 0 ? 'conflict' : 'synced',
    }
  }),
  clearConflicts: () => set({ conflicts: [], conflictCount: 0, status: 'synced' }),
  reset: () => set(initialState),
}))
