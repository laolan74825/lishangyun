import { useState, useEffect, useCallback } from 'react'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import InviteCodeModal from '../components/family/InviteCodeModal'
import ApprovalQueuePanel from '../components/family/ApprovalQueuePanel'
import {
  listMyFamilyGroups,
  createFamilyGroup,
  updateFamilyGroup,
  dissolveFamilyGroup,
  joinFamilyGroup,
  leaveFamilyGroup,
  listFamilyMembers,
  updateMemberRole,
  toggleMemberActive,
  removeMember,
  getSharedStats,
} from '../lib/api-client'
import { getCurrentUser } from '../lib/auth'
import type { FamilyGroup, FamilyMember } from '../types'

type Tab = 'members' | 'approvals' | 'stats' | 'settings'

const ROLE_LABELS: Record<string, string> = {
  owner: '主账户',
  admin: '管理员',
  member: '成员',
}

export default function FamilyPage() {
  const { toast, showToast } = useToast()
  const [groups, setGroups] = useState<FamilyGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState<FamilyGroup | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('members')

  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listMyFamilyGroups()
      setGroups(data)
      if (data.length > 0 && !selectedGroup) {
        setSelectedGroup(data[0])
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadGroups() }, [loadGroups])

  const loadMembers = useCallback(async (groupId: number) => {
    try {
      const data = await listFamilyMembers(groupId)
      setMembers(data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (selectedGroup?.id) loadMembers(selectedGroup.id)
  }, [selectedGroup, loadMembers])

  if (loading) {
    return (
      <PageScaffold title="家庭管理" description="家庭成员协作与数据共享">
        <div className="flex items-center justify-center py-20 text-ink-secondary">加载中…</div>
      </PageScaffold>
    )
  }

  if (groups.length === 0) {
    return (
      <PageScaffold title="家庭管理" description="创建或加入家庭组，共享礼金数据">
        <EmptyState onCreated={loadGroups} showToast={showToast} />
        <Toast message={toast} onClose={() => showToast(null)} />
      </PageScaffold>
    )
  }

  return (
    <PageScaffold title="家庭管理" description="家庭成员协作与数据共享">
      <div className="flex flex-col gap-4">
        {groups.length > 1 && (
          <GroupSwitcher groups={groups} selected={selectedGroup} onSelect={setSelectedGroup} />
        )}

        {selectedGroup && (
          <GroupDetail
            group={selectedGroup}
            members={members}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onMembersChange={() => loadMembers(selectedGroup.id!)}
            onGroupUpdate={(g) => {
              setSelectedGroup(g)
              loadGroups()
            }}
            showToast={showToast}
          />
        )}
      </div>
      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}

function GroupSwitcher({
  groups,
  selected,
  onSelect,
}: {
  groups: FamilyGroup[]
  selected: FamilyGroup | null
  onSelect: (g: FamilyGroup) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {groups.map((g) => (
        <button
          key={g.id}
          onClick={() => onSelect(g)}
          className={`whitespace-nowrap rounded-btn px-4 py-2 text-sm font-medium transition-colors ${
            selected?.id === g.id
              ? 'bg-primary text-white'
              : 'border border-line text-ink-secondary hover:border-primary'
          }`}
        >
          {g.name}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ onCreated, showToast }: { onCreated: () => void; showToast: (msg: string) => void }) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate() {
    if (!name.trim()) { showToast('请填写家庭组名称'); return }
    setSubmitting(true)
    try {
      await createFamilyGroup({ name: name.trim(), description: description.trim() || undefined })
      showToast('家庭组已创建')
      onCreated()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleJoin() {
    if (!inviteCode.trim()) { showToast('请输入邀请码'); return }
    setSubmitting(true)
    try {
      await joinFamilyGroup(inviteCode.trim().toUpperCase())
      showToast('已加入家庭组')
      onCreated()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '加入失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'choose') {
    return (
      <div className="flex flex-col items-center gap-6 rounded-card bg-card p-8 shadow-card">
        <span className="text-5xl">👨‍👩‍👧‍👦</span>
        <h2 className="text-xl font-bold text-ink">还没有家庭组</h2>
        <p className="text-sm text-ink-secondary">创建家庭组邀请成员加入，或输入邀请码加入已有家庭组。</p>
        <div className="flex gap-3">
          <button
            onClick={() => setMode('create')}
            className="rounded-btn bg-primary px-6 py-2.5 text-sm font-semibold text-white"
          >
            创建家庭组
          </button>
          <button
            onClick={() => setMode('join')}
            className="rounded-btn border border-primary px-6 py-2.5 text-sm font-medium text-primary"
          >
            加入家庭组
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-card bg-card p-6 shadow-card">
        <h2 className="text-lg font-bold text-ink">创建家庭组</h2>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">家庭组名称</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：张家"
            className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">描述（可选）</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="家庭组简介"
            className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
          />
        </label>
        <div className="flex gap-3">
          <button
            onClick={() => setMode('choose')}
            className="flex-1 rounded-btn border border-line py-2.5 text-sm font-medium text-ink-secondary"
          >
            返回
          </button>
          <button
            onClick={handleCreate}
            disabled={submitting}
            className="flex-1 rounded-btn bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-card bg-card p-6 shadow-card">
      <h2 className="text-lg font-bold text-ink">加入家庭组</h2>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">邀请码</span>
        <input
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          placeholder="输入 12 位邀请码"
          className="h-11 rounded-btn border border-line px-4 font-mono text-base tracking-wider outline-none focus:border-primary"
        />
      </label>
      <div className="flex gap-3">
        <button
          onClick={() => setMode('choose')}
          className="flex-1 rounded-btn border border-line py-2.5 text-sm font-medium text-ink-secondary"
        >
          返回
        </button>
        <button
          onClick={handleJoin}
          disabled={submitting}
          className="flex-1 rounded-btn bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? '加入中…' : '加入'}
        </button>
      </div>
    </div>
  )
}

function GroupDetail({
  group,
  members,
  activeTab,
  onTabChange,
  onMembersChange,
  onGroupUpdate,
  showToast,
}: {
  group: FamilyGroup
  members: FamilyMember[]
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onMembersChange: () => void
  onGroupUpdate: (g: FamilyGroup) => void
  showToast: (msg: string) => void
}) {
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [currentGroup, setCurrentGroup] = useState(group)

  useEffect(() => { setCurrentGroup(group) }, [group])

  const isOwner = members.find((m) => m.role === 'owner')?.user_id

  const currentUser = getCurrentUser()
  const currentMember = members.find((m) => m.user_id === currentUser?.id)
  const isOwnerOrAdmin = currentMember?.role === 'owner' || currentMember?.role === 'admin'

  const tabs: { key: Tab; label: string }[] = [
    { key: 'members', label: '成员管理' },
    { key: 'approvals', label: '审批队列' },
    { key: 'stats', label: '共享统计' },
    { key: 'settings', label: '设置' },
  ]

  return (
    <>
      <div className="rounded-card bg-card p-5 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ink">{currentGroup.name}</h2>
            {currentGroup.description && (
              <p className="mt-1 text-sm text-ink-secondary">{currentGroup.description}</p>
            )}
            <p className="mt-2 text-xs text-ink-secondary">
              {currentGroup.member_count} 位成员
            </p>
          </div>
          {isOwner !== undefined && (
            <button
              onClick={() => setInviteModalOpen(true)}
              className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white"
            >
              邀请成员
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-line">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-secondary hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'members' && (
        <MembersPanel
          group={currentGroup}
          members={members}
          isOwner={isOwner}
          onChange={onMembersChange}
          showToast={showToast}
        />
      )}
      {activeTab === 'approvals' && (
        <ApprovalQueuePanel
          groupId={currentGroup.id!}
          isOwnerOrAdmin={!!isOwnerOrAdmin}
          showToast={showToast}
        />
      )}
      {activeTab === 'stats' && <SharedStatsPanel groupId={currentGroup.id!} />}
      {activeTab === 'settings' && (
        <SettingsPanel
          group={currentGroup}
          isOwner={!!isOwner}
          onGroupUpdate={onGroupUpdate}
          showToast={showToast}
        />
      )}

      <InviteCodeModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        groupId={currentGroup.id!}
        inviteCode={currentGroup.invite_code}
        expiresAt={currentGroup.invite_expires_at}
        onRefreshed={(code, expiresAt) => {
          setCurrentGroup({ ...currentGroup, invite_code: code, invite_expires_at: expiresAt ?? undefined })
          showToast('邀请码已刷新')
        }}
      />
    </>
  )
}

function MembersPanel({
  group,
  members,
  isOwner,
  onChange,
  showToast,
}: {
  group: FamilyGroup
  members: FamilyMember[]
  isOwner: number | undefined
  onChange: () => void
  showToast: (msg: string) => void
}) {
  const [removing, setRemoving] = useState<FamilyMember | null>(null)

  async function handleRoleChange(memberId: number, role: string) {
    try {
      await updateMemberRole(group.id!, memberId, role)
      showToast('角色已更新')
      onChange()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '操作失败')
    }
  }

  async function handleToggleActive(member: FamilyMember) {
    try {
      await toggleMemberActive(group.id!, member.id!, !member.is_active)
      showToast(member.is_active ? '已禁用' : '已启用')
      onChange()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '操作失败')
    }
  }

  async function handleRemove() {
    if (!removing) return
    try {
      await removeMember(group.id!, removing.id!)
      showToast('成员已移除')
      onChange()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '移除失败')
    }
    setRemoving(null)
  }

  async function handleLeave() {
    try {
      await leaveFamilyGroup(group.id!)
      showToast('已退出家庭组')
      onChange()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '退出失败')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {members.map((m) => {
        const isOwnerMember = m.role === 'owner'
        return (
          <div
            key={m.id}
            className="flex items-center justify-between rounded-lg border border-line px-4 py-3"
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium text-ink">
                {m.display_name || m.nickname || m.username || `用户${m.user_id}`}
                <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                  {ROLE_LABELS[m.role] ?? m.role}
                </span>
                {!m.is_active && m.status === 'active' && (
                  <span className="ml-2 rounded bg-danger/10 px-1.5 py-0.5 text-xs text-danger">
                    已禁用
                  </span>
                )}
              </span>
              <span className="text-xs text-ink-secondary">
                {m.username && `@${m.username}`}
                {m.joined_at && ` · 加入于 ${new Date(m.joined_at).toLocaleDateString('zh-CN')}`}
              </span>
            </div>

            {isOwner !== undefined && !isOwnerMember && (
              <div className="flex items-center gap-2">
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.id!, e.target.value)}
                  className="rounded-btn border border-line px-2 py-1 text-xs outline-none"
                >
                  <option value="admin">管理员</option>
                  <option value="member">成员</option>
                </select>
                <button
                  onClick={() => handleToggleActive(m)}
                  className="rounded-md border border-line px-2 py-1 text-xs text-ink-secondary hover:border-primary"
                >
                  {m.is_active ? '禁用' : '启用'}
                </button>
                <button
                  onClick={() => setRemoving(m)}
                  className="rounded-md border border-danger/30 px-2 py-1 text-xs text-danger hover:border-danger"
                >
                  移除
                </button>
              </div>
            )}
          </div>
        )
      })}

      {isOwner === undefined && (
        <button
          onClick={handleLeave}
          className="mt-2 rounded-btn border border-danger/30 py-2.5 text-sm font-medium text-danger"
        >
          退出家庭组
        </button>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="移除成员"
        message={removing ? `确定移除「${removing.display_name || removing.username}」吗？` : ''}
        variant="danger"
        confirmLabel="移除"
        onConfirm={handleRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}

function SharedStatsPanel({ groupId }: { groupId: number }) {
  const [stats, setStats] = useState<{
    person_count: number
    total_received: number
    total_sent: number
    member_count: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const data = await getSharedStats(groupId)
        setStats(data)
      } catch { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [groupId])

  if (loading) return <p className="py-8 text-center text-sm text-ink-secondary">加载中…</p>
  if (!stats) return <p className="py-8 text-center text-sm text-ink-secondary">加载失败</p>

  const cards = [
    { label: '家庭组成员', value: `${stats.member_count} 人` },
    { label: '人员档案', value: `${stats.person_count} 人` },
    { label: '收到礼金', value: `¥${(stats.total_received / 100).toFixed(2)}` },
    { label: '送出礼金', value: `¥${(stats.total_sent / 100).toFixed(2)}` },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-card bg-card p-4 shadow-card">
          <p className="text-xs text-ink-secondary">{c.label}</p>
          <p className="mt-1 text-xl font-bold text-ink">{c.value}</p>
        </div>
      ))}
      <div className="col-span-2 mt-2 rounded-lg border border-line p-4 xl:col-span-4">
        <p className="text-xs text-ink-secondary">
          共享数据仅包含非隐私记录。每位成员的隐私记录仅本人可见。
        </p>
      </div>
    </div>
  )
}

function SettingsPanel({
  group,
  isOwner,
  onGroupUpdate,
  showToast,
}: {
  group: FamilyGroup
  isOwner: boolean
  onGroupUpdate: (g: FamilyGroup) => void
  showToast: (msg: string) => void
}) {
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description || '')
  const [saving, setSaving] = useState(false)
  const [dissolving, setDissolving] = useState(false)

  async function handleSave() {
    if (!name.trim()) { showToast('名称不能为空'); return }
    setSaving(true)
    try {
      await updateFamilyGroup(group.id!, { name: name.trim(), description: description.trim() || undefined })
      showToast('已保存')
      onGroupUpdate({ ...group, name: name.trim(), description: description.trim() || undefined })
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleDissolve() {
    setDissolving(true)
    try {
      await dissolveFamilyGroup(group.id!)
      showToast('家庭组已解散')
      onGroupUpdate(group)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '解散失败')
    } finally {
      setDissolving(false)
    }
  }

  if (!isOwner) {
    return (
      <div className="rounded-card bg-card p-6 shadow-card">
        <p className="text-sm text-ink-secondary">仅主账户可修改家庭组设置。</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card bg-card p-5 shadow-card">
        <h3 className="text-section-title">基本信息</h3>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">家庭组名称</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">描述</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="家庭组简介（可选）"
              className="h-11 rounded-btn border border-line px-4 text-base outline-none focus:border-primary"
            />
          </label>
          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-1 rounded-btn bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      <div className="rounded-card bg-card p-5 shadow-card">
        <h3 className="text-section-title text-danger">解散家庭组</h3>
        <p className="mt-2 text-sm text-ink-secondary">
          解散后所有成员将被移除，此操作不可撤销。
        </p>
        <ConfirmDialog
          open={dissolving}
          title="解散家庭组"
          message="确定解散此家庭组吗？所有成员将被移除，此操作不可撤销。"
          variant="danger"
          confirmLabel="确认解散"
          loading={dissolving}
          onConfirm={handleDissolve}
          onCancel={() => setDissolving(false)}
        />
        <button
          onClick={() => setDissolving(true)}
          className="mt-3 rounded-btn border border-danger/30 px-4 py-2 text-sm font-medium text-danger"
        >
          解散家庭组
        </button>
      </div>
    </div>
  )
}
