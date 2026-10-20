import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-119: a task can be assigned only to a board member or admin of the
// caller's own HOA. A resident (or someone from another HOA) is refused
// before anything is written.

const h = vi.hoisted(() => ({
  assignable: true,
  updates: [] as Array<{ patch: unknown; filters: Array<[string, unknown]> }>,
}))

vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: vi.fn(async () => ({ ok: true, role: 'board', orgId: 'org-1' })),
}))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1' })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/inbox/assignees', () => ({
  isAssignableMember: vi.fn(async () => h.assignable),
  listAssignees: vi.fn(async () => [{ userId: USER, name: 'Pat Chair' }]),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: () => {
      const entry = { patch: undefined as unknown, filters: [] as Array<[string, unknown]> }
      const q: Record<string, unknown> = {
        update: (patch: unknown) => {
          entry.patch = patch
          h.updates.push(entry)
          return q
        },
        eq: (k: string, v: unknown) => {
          entry.filters.push([k, v])
          return q
        },
        select: () => q,
        single: async () => ({ data: { meeting_id: 'm-1' }, error: null }),
      }
      return q
    },
  })),
}))

const TASK = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'

const { assignActionItem, updateActionItem } = await import('./meeting-action-items')

beforeEach(() => {
  h.assignable = true
  h.updates = []
})

describe('assignActionItem', () => {
  it('assigns a board member: their id and name, scoped to the caller’s org', async () => {
    expect(await assignActionItem(TASK, USER)).toEqual({ ok: true })
    expect(h.updates).toHaveLength(1)
    expect(h.updates[0]!.patch).toEqual({ assignee_user_id: USER, assignee_name: 'Pat Chair' })
    expect(h.updates[0]!.filters).toEqual([
      ['id', TASK],
      ['org_id', 'org-1'],
    ])
  })

  it('refuses someone who is not a board member of this HOA, writing nothing', async () => {
    h.assignable = false
    const res = await assignActionItem(TASK, USER)
    expect(res.ok).toBe(false)
    expect(h.updates).toEqual([])
  })

  it('clears the assignee', async () => {
    expect(await assignActionItem(TASK, null)).toEqual({ ok: true })
    expect(h.updates[0]!.patch).toEqual({ assignee_user_id: null, assignee_name: null })
  })

  it('rejects a malformed id', async () => {
    expect((await assignActionItem('nope', USER)).ok).toBe(false)
    expect(h.updates).toEqual([])
  })
})

describe('updateActionItem', () => {
  it('a typed-in name drops the board-member link, so the digest stops emailing the old assignee', async () => {
    await updateActionItem(TASK, { assignee_name: 'Linda' })
    expect(h.updates[0]!.patch).toEqual({ assignee_name: 'Linda', assignee_user_id: null })
  })

  it('a due-date change leaves the assignee alone', async () => {
    await updateActionItem(TASK, { due_date: '2026-11-01' })
    expect(h.updates[0]!.patch).toEqual({ due_date: '2026-11-01' })
  })
})
