import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-138 updateBudgetAdoption: board/admin only, the budget must be the
// primary association's and the meeting the caller's org's, dates only on
// an approved budget and never in the future, and a save writes a signed
// record while keeping every other settings key.

const ORG = 'org-1'
const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const BUDGET = 'b0000000-0000-4000-8000-000000000001'
const OTHER_BUDGET = 'b0000000-0000-4000-8000-000000000099'
const MEETING = 'c0000000-0000-4000-8000-000000000001'

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: true; role: string; orgId: string } | { ok: false; error: string },
  budgetStatus: 'draft',
  meetingOrg: 'org-1',
  settings: {} as Record<string, unknown>,
  reads: [] as string[],
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))
vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => 'test-secret' }))
vi.mock('@/lib/vendors', () => ({
  getPrimaryAssociation: vi.fn(async () => ({ id: 'a0000000-0000-4000-8000-000000000001', name: 'Maple HOA', timeZone: 'America/New_York' })),
}))
vi.mock('@/lib/association-time', async (orig) => ({
  ...(await orig<typeof import('@/lib/association-time')>()),
  todayIn: () => '2026-10-21',
}))

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from(table: string) {
      h.reads.push(table)
      const filters: Record<string, unknown> = {}
      let update: Record<string, unknown> | null = null
      const rows = (): Record<string, unknown>[] => {
        if (table === 'budgets') return filters.id === BUDGET && filters.association_id === ASSOC ? [{ id: BUDGET, status: h.budgetStatus }] : []
        if (table === 'hoa_meeting_minutes') {
          return filters.id === MEETING && filters.org_id === h.meetingOrg
            ? [{ id: MEETING, meeting_date: '2026-11-18', meeting_type: 'regular', status: 'draft', ai_summary: null }]
            : []
        }
        if (table === 'associations') {
          return filters.id === ASSOC ? [{ id: ASSOC, state: 'FL', governing_law_state: null, compliance_settings: h.settings }] : []
        }
        return []
      }
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((filters[c] = v), q),
        is: () => q,
        update: (v: Record<string, unknown>) => ((update = v), q),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => {
          if (update) {
            h.updates.push({ table, values: update })
            if (table === 'associations') h.settings = update.compliance_settings as Record<string, unknown>
            return Promise.resolve({ data: [{ id: ASSOC }], error: null }).then(res)
          }
          return Promise.resolve({ data: rows(), error: null }).then(res)
        },
      }
      return q
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => fakeClient()) }))

const { updateBudgetAdoption } = await import('./actions')
const { readAdoption, BUDGET_ADOPTIONS_KEY } = await import('./store')

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: ORG }
  h.budgetStatus = 'draft'
  h.meetingOrg = ORG
  h.settings = { meeting_quorum_kits: { x: 1 } }
  h.reads = []
  h.updates = []
})

describe('updateBudgetAdoption', () => {
  it('a resident is refused before any read', async () => {
    h.gate = { ok: false, error: 'Only board members and admins can make this change.' }
    expect(await updateBudgetAdoption(BUDGET, { kind: 'special', value: true })).toEqual({
      ok: false,
      error: 'Only board members and admins can make this change.',
    })
    expect(h.reads).toEqual([])
  })

  it('rejects malformed input without reading', async () => {
    expect(await updateBudgetAdoption('nope', { kind: 'special', value: true })).toEqual({ ok: false, error: 'Invalid input.' })
    expect(await updateBudgetAdoption(BUDGET, { kind: 'adopted', on: '2026-13-01' })).toEqual({ ok: false, error: 'Invalid input.' })
    expect(await updateBudgetAdoption(BUDGET, { kind: 'meeting', meetingId: 'x' })).toEqual({ ok: false, error: 'Invalid input.' })
    expect(await updateBudgetAdoption(BUDGET, { kind: 'drop' } as never)).toEqual({ ok: false, error: 'Invalid input.' })
    expect(h.reads).toEqual([])
  })

  it('another association’s budget is refused', async () => {
    expect(await updateBudgetAdoption(OTHER_BUDGET, { kind: 'special', value: true })).toMatchObject({ ok: false })
    expect(h.updates).toEqual([])
  })

  it('another org’s meeting is refused', async () => {
    h.meetingOrg = 'org-2'
    expect(await updateBudgetAdoption(BUDGET, { kind: 'meeting', meetingId: MEETING })).toEqual({
      ok: false,
      error: 'That meeting isn’t part of your organization.',
    })
    expect(h.updates).toEqual([])
  })

  it('adoption dates need an approved budget and can’t be in the future', async () => {
    expect(await updateBudgetAdoption(BUDGET, { kind: 'adopted', on: '2026-10-20' })).toEqual({ ok: false, error: 'Approve the budget first.' })
    h.budgetStatus = 'approved'
    expect(await updateBudgetAdoption(BUDGET, { kind: 'adopted', on: '2026-10-22' })).toEqual({ ok: false, error: 'The date can’t be in the future.' })
    expect(h.updates).toEqual([])
  })

  it('links the meeting, then records the adoption, keeping other settings keys', async () => {
    expect(await updateBudgetAdoption(BUDGET, { kind: 'meeting', meetingId: MEETING })).toMatchObject({ ok: true })
    h.budgetStatus = 'approved'
    const res = await updateBudgetAdoption(BUDGET, { kind: 'adopted', on: '2026-10-21' })
    expect(res).toEqual({ ok: true, record: { meetingId: MEETING, special: false, adoptedOn: '2026-10-21', ownerNoticeOn: null } })
    expect(h.settings.meeting_quorum_kits).toEqual({ x: 1 })
    expect(Object.keys(h.settings[BUDGET_ADOPTIONS_KEY] as object)).toEqual([BUDGET])
    expect(readAdoption(ASSOC, BUDGET, h.settings, 'test-secret')).toMatchObject({
      state: 'saved',
      record: { meetingId: MEETING, adoptedOn: '2026-10-21' },
    })
  })
})
