import { describe, it, expect, beforeEach } from 'vitest'
import { useSyncStore } from '../store/syncStore'
import type { SyncConflict } from '../store/syncStore'

describe('syncStore', () => {
  beforeEach(() => {
    useSyncStore.getState().reset()
  })

  it('初始状态正确', () => {
    const state = useSyncStore.getState()
    expect(state.status).toBe('idle')
    expect(state.lastSyncedAt).toBeNull()
    expect(state.lastError).toBeNull()
    expect(state.pendingCount).toBe(0)
    expect(state.conflictCount).toBe(0)
    expect(state.conflicts).toEqual([])
  })

  it('setStatus 更新状态', () => {
    useSyncStore.getState().setStatus('syncing')
    expect(useSyncStore.getState().status).toBe('syncing')
  })

  it('setLastSyncedAt 更新时间并设为 synced', () => {
    const now = Date.now()
    useSyncStore.getState().setLastSyncedAt(now)
    const state = useSyncStore.getState()
    expect(state.lastSyncedAt).toBe(now)
    expect(state.status).toBe('synced')
  })

  it('setLastError 设置错误并设为 error', () => {
    useSyncStore.getState().setLastError('网络错误')
    const state = useSyncStore.getState()
    expect(state.lastError).toBe('网络错误')
    expect(state.status).toBe('error')
  })

  it('setPendingCount 更新待同步数', () => {
    useSyncStore.getState().setPendingCount(5)
    expect(useSyncStore.getState().pendingCount).toBe(5)
  })

  it('setConflicts 设置冲突列表并更新状态', () => {
    const conflicts: SyncConflict[] = [
      {
        id: 'test-1',
        table: 'gb_records',
        local: { id: 1, amount: 50000 },
        remote: { id: 1, amount: 60000 },
        conflict_type: 'update_update',
        detected_at: Date.now(),
      },
    ]
    useSyncStore.getState().setConflicts(conflicts)
    const state = useSyncStore.getState()
    expect(state.conflicts).toHaveLength(1)
    expect(state.conflictCount).toBe(1)
    expect(state.status).toBe('conflict')
  })

  it('setConflicts 空列表时状态为 synced', () => {
    useSyncStore.getState().setConflicts([])
    const state = useSyncStore.getState()
    expect(state.conflictCount).toBe(0)
    expect(state.status).toBe('synced')
  })

  it('removeConflict 移除单个冲突', () => {
    const conflicts: SyncConflict[] = [
      { id: 'c-1', table: 'gb_records', local: {}, remote: {}, conflict_type: 'update_update', detected_at: Date.now() },
      { id: 'c-2', table: 'persons', local: {}, remote: {}, conflict_type: 'update_update', detected_at: Date.now() },
    ]
    useSyncStore.getState().setConflicts(conflicts)
    useSyncStore.getState().removeConflict('c-1')
    const state = useSyncStore.getState()
    expect(state.conflicts).toHaveLength(1)
    expect(state.conflicts[0].id).toBe('c-2')
    expect(state.conflictCount).toBe(1)
    expect(state.status).toBe('conflict')
  })

  it('removeConflict 移除最后一个冲突后状态为 synced', () => {
    const conflicts: SyncConflict[] = [
      { id: 'c-1', table: 'gb_records', local: {}, remote: {}, conflict_type: 'update_update', detected_at: Date.now() },
    ]
    useSyncStore.getState().setConflicts(conflicts)
    useSyncStore.getState().removeConflict('c-1')
    const state = useSyncStore.getState()
    expect(state.conflicts).toHaveLength(0)
    expect(state.status).toBe('synced')
  })

  it('clearConflicts 清空所有冲突', () => {
    const conflicts: SyncConflict[] = [
      { id: 'c-1', table: 'gb_records', local: {}, remote: {}, conflict_type: 'update_update', detected_at: Date.now() },
      { id: 'c-2', table: 'persons', local: {}, remote: {}, conflict_type: 'update_update', detected_at: Date.now() },
    ]
    useSyncStore.getState().setConflicts(conflicts)
    useSyncStore.getState().clearConflicts()
    const state = useSyncStore.getState()
    expect(state.conflicts).toHaveLength(0)
    expect(state.conflictCount).toBe(0)
    expect(state.status).toBe('synced')
  })

  it('reset 恢复初始状态', () => {
    useSyncStore.getState().setStatus('error')
    useSyncStore.getState().setLastError('错误')
    useSyncStore.getState().setPendingCount(10)
    useSyncStore.getState().reset()
    const state = useSyncStore.getState()
    expect(state.status).toBe('idle')
    expect(state.lastError).toBeNull()
    expect(state.pendingCount).toBe(0)
  })
})
