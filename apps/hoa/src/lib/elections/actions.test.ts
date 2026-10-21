import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-141 updateElection: board/admin only (the gate runs before anything
// else), the meeting and a candidate's home must be the caller's org's,
// the planner only opens for a members' meeting, and a save writes a
// signed election while keeping every other settings key.

const ORG = 'org-1'
const MEETING = 'b0000000-0000-4000-8000-000000000001'
const ASSOC = 'a0000000-0000-4000-8000-000000000001'
const HOME = 'd0000000-0000-4000-8000-000000000001'
const OTHER_HOME = 'd0000000-0000-4000-8000-000000000099'

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: true; role: string; orgId: string } | { ok: false; error: string },
  meetingType: 'annual' as string | null,
  meetingOrg: 'org-1',
  settings: {} as Record<string, unknown>,
  reads: [] as string[],
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))
vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => 'test-secret' }))

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from(table: string) {
      h.reads.push(table)
      const filters: Record<string, unknown> = {}
      let update: Record<string, unknown> | null = null
      const rows = (): Record<string, unknown>[] => {
        if (table === 'hoa_meeting_minutes') {
          return filters.id === MEETING && filters.org_id === h.meetingOrg
            ? [{ id: MEETING, org_id: h.meetingOrg, meeting_date: '2027-01-15', meeting_type: h.meetingType, status: 'draft' }]
            : []
        }
        if (table === 'associations') {
          return filters.organization_id === ORG || filters.id === ASSOC
            ? [{ id: ASSOC, name: 'Peachtree HOA', state: 'GA', governing_law_state: null, compliance_settings: h.settings }]
            : []
        }
        if (table === 'hoa_properties') return filters.id === HOME && filters.org_id === ORG ? [{ id: HOME }] : []
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

const { updateElection } = await import('./actions')
const { readElection, ELECTIONS_KEY } = await import('./store')

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: ORG }
  h.meetingType = 'annual'
  h.meetingOrg = ORG
  h.settings = { arc_decision_clock: { days: 30 } }
  h.reads = []
  h.updates = []
})

describe('updateElection gate', () => {
  it('a resident is refused before any read', async () => {
    h.gate = { ok: false, error: 'Only board members and admins can make this change.' }
    const res = await updateElection(MEETING, { kind: 'setup', seats: 2, nominationDeadline: null, ballotsOutOn: null })
    expect(res).toEqual({ ok: false, error: 'Only board members and admins can make this change.' })
    expect(h.reads).toEqual([])
  })

  it('rejects bad input before any read', async () => {
    expect(await updateElection('nope', { kind: 'clear_results' })).toEqual({ ok: false, error: 'Invalid input.' })
    expect(await updateElection(MEETING, { kind: 'setup', seats: 99, nominationDeadline: null, ballotsOutOn: null })).toEqual({ ok: false, error: 'Invalid input.' })
    expect(await updateElection(MEETING, { kind: 'drop_table' } as never)).toEqual({ ok: false, error: 'Invalid input.' })
    expect(h.reads).toEqual([])
  })

  it('another org’s meeting is refused', async () => {
    h.meetingOrg = 'org-2'
    expect(await updateElection(MEETING, { kind: 'clear_results' })).toMatchObject({ ok: false })
    expect(h.updates).toEqual([])
  })

  it('a board meeting has no election', async () => {
    h.meetingType = 'regular'
    expect(await updateElection(MEETING, { kind: 'setup', seats: 2, nominationDeadline: null, ballotsOutOn: null })).toMatchObject({ ok: false })
    expect(h.updates).toEqual([])
  })

  it('a candidate’s home must be this org’s', async () => {
    const res = await updateElection(MEETING, { kind: 'add_candidate', name: 'Pat Lee', propertyId: OTHER_HOME, nominatedOn: null })
    expect(res).toEqual({ ok: false, error: 'That home isn’t part of your organization.' })
    expect(h.updates).toEqual([])
  })
})

describe('updateElection save', () => {
  it('writes a signed election and keeps the other settings', async () => {
    expect(await updateElection(MEETING, { kind: 'setup', seats: 2, nominationDeadline: '2026-12-15', ballotsOutOn: null })).toMatchObject({ ok: true })
    const res = await updateElection(MEETING, { kind: 'add_candidate', name: 'Pat Lee', propertyId: HOME, nominatedOn: '2026-11-02' })
    expect(res).toMatchObject({ ok: true })
    expect(h.settings.arc_decision_clock).toEqual({ days: 30 })
    const read = readElection(ASSOC, MEETING, h.settings, 'test-secret')
    expect(read).toMatchObject({ state: 'saved', seats: 2, nominationDeadline: '2026-12-15', updatedBy: 'user-1' })
    expect(read.candidates).toHaveLength(1)
    expect(read.candidates[0]).toMatchObject({ name: 'Pat Lee', propertyId: HOME })
    expect(Object.keys((h.settings[ELECTIONS_KEY] as Record<string, unknown>) ?? {})).toEqual([MEETING])
  })

  it('a rule break is explained and nothing is written', async () => {
    const res = await updateElection(MEETING, { kind: 'setup', seats: 2, nominationDeadline: '2027-02-01', ballotsOutOn: null })
    expect(res).toEqual({ ok: false, error: 'Nominations must close on or before the meeting day.' })
    expect(h.updates).toEqual([])
  })
})
