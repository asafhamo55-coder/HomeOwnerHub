import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-122 updateQuorumKit: board/admin only, the meeting and the home must
// be the caller's org's, the kit only opens for a members' meeting, and a
// save writes a signed kit while keeping every other settings key.

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
  updates: [] as Array<{ table: string; values: Record<string, unknown>; filters: Record<string, unknown> }>,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))
vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => 'test-secret' }))

/** A tiny chainable stand-in for the cookie-bound client. */
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
            ? [{ id: ASSOC, name: 'Maple HOA', state: 'FL', governing_law_state: null, compliance_settings: h.settings }]
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
            h.updates.push({ table, values: update, filters: { ...filters } })
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

const { updateQuorumKit } = await import('./actions')
const { readKit, QUORUM_KITS_KEY } = await import('./store')

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: ORG }
  h.meetingType = 'annual'
  h.meetingOrg = ORG
  h.settings = { arc_decision_clock: { days: 30 } }
  h.reads = []
  h.updates = []
})

describe('updateQuorumKit gate', () => {
  it('a resident is refused before any read', async () => {
    h.gate = { ok: false, error: 'Only board members and admins can make this change.' }
    const res = await updateQuorumKit(MEETING, { kind: 'present', propertyId: HOME, present: true })
    expect(res).toEqual({ ok: false, error: 'Only board members and admins can make this change.' })
    expect(h.reads).toEqual([])
    expect(h.updates).toEqual([])
  })

  it('rejects malformed input without reading', async () => {
    expect(await updateQuorumKit('nope', { kind: 'quorum_pct', pct: 25 })).toEqual({ ok: false, error: 'Invalid input.' })
    expect(await updateQuorumKit(MEETING, { kind: 'quorum_pct', pct: 0 })).toEqual({ ok: false, error: 'Invalid input.' })
    expect(await updateQuorumKit(MEETING, { kind: 'proxy', propertyId: HOME, proxy: 'everything' } as never)).toEqual({ ok: false, error: 'Invalid input.' })
    expect(await updateQuorumKit(MEETING, { kind: 'drop_table' } as never)).toEqual({ ok: false, error: 'Invalid input.' })
    expect(h.reads).toEqual([])
  })

  it('another org’s meeting is refused', async () => {
    h.meetingOrg = 'org-2'
    const res = await updateQuorumKit(MEETING, { kind: 'quorum_pct', pct: 25 })
    expect(res).toMatchObject({ ok: false })
    expect(h.updates).toEqual([])
  })

  it('another org’s home is refused', async () => {
    const res = await updateQuorumKit(MEETING, { kind: 'present', propertyId: OTHER_HOME, present: true })
    expect(res).toEqual({ ok: false, error: 'That home isn’t part of your organization.' })
    expect(h.updates).toEqual([])
  })

  it('a board meeting has no kit', async () => {
    h.meetingType = 'regular'
    expect(await updateQuorumKit(MEETING, { kind: 'quorum_pct', pct: 25 })).toMatchObject({ ok: false })
    expect(await updateQuorumKit(MEETING, { kind: 'member_meeting', value: true })).toMatchObject({ ok: false })
    expect(h.updates).toEqual([])
  })

  it('a special meeting opens only after the board confirms it is the members’', async () => {
    h.meetingType = 'special'
    expect(await updateQuorumKit(MEETING, { kind: 'present', propertyId: HOME, present: true })).toMatchObject({ ok: false })
    expect(await updateQuorumKit(MEETING, { kind: 'member_meeting', value: true })).toMatchObject({ ok: true })
    expect(await updateQuorumKit(MEETING, { kind: 'present', propertyId: HOME, present: true })).toMatchObject({ ok: true })
  })
})

describe('updateQuorumKit saves', () => {
  it('writes a signed kit to the association and keeps the other keys', async () => {
    const res = await updateQuorumKit(MEETING, { kind: 'proxy', propertyId: HOME, proxy: 'general' })
    expect(res.ok).toBe(true)
    expect(h.updates).toHaveLength(1)
    expect(h.updates[0]!.table).toBe('associations')
    expect(h.updates[0]!.filters.id).toBe(ASSOC)
    expect(h.settings.arc_decision_clock).toEqual({ days: 30 })
    const read = readKit(ASSOC, MEETING, h.settings, 'test-secret')
    expect(read.state).toBe('saved')
    expect(read.homes[HOME]!.proxy!.kind).toBe('general')
    // Ids and times only: the stored blob names no one.
    expect(JSON.stringify((h.settings[QUORUM_KITS_KEY] as Record<string, unknown>)[MEETING])).not.toMatch(/Maple|@/)
  })

  it('builds on the saved kit: proxy then check-in then quorum %', async () => {
    await updateQuorumKit(MEETING, { kind: 'proxy', propertyId: HOME, proxy: 'limited' })
    await updateQuorumKit(MEETING, { kind: 'present', propertyId: HOME, present: true })
    const res = await updateQuorumKit(MEETING, { kind: 'quorum_pct', pct: 30 })
    expect(res).toMatchObject({ ok: true, kit: { quorumPct: 30 } })
    const read = readKit(ASSOC, MEETING, h.settings, 'test-secret')
    expect(read.quorumPct).toBe(30)
    expect(read.homes[HOME]!.proxy!.kind).toBe('limited')
    expect(read.homes[HOME]!.presentAt).not.toBeNull()
  })
})
