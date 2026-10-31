import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fake database: one table of cases, a log of writes, and a role switch.
const state = vi.hoisted(() => ({
  role: 'board' as 'board' | 'admin' | 'resident',
  orgId: 'org-1',
  cases: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ patch: Record<string, unknown>; eq: Array<[string, unknown]> }>,
  events: [] as Array<Record<string, unknown>>,
  updateError: null as { code?: string; message: string } | null,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: async () => ({ id: state.orgId }) }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => ({ id: 'assoc-1' }) }))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: async () => 'America/New_York' }))
vi.mock('@/lib/association-time', () => ({ todayIn: () => '2026-10-30' }))
vi.mock('@/lib/ga-registration/load', () => ({ loadGaRegistrationGate: vi.fn() }))
vi.mock('@homeowner-portal/db/m7', () => ({ M7_APPLIED: false }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: async (denied: string) =>
    state.role === 'resident' ? { ok: false, error: denied } : { ok: true, role: state.role, orgId: state.orgId },
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      if (table === 'collection_events') {
        return {
          insert: async (row: Record<string, unknown>) => {
            state.events.push(row)
            return { error: null }
          },
        }
      }
      // collection_cases: select(...).eq().eq().is().maybeSingle() and update(...).eq().eq().select()
      const filters: Array<[string, unknown]> = []
      let patch: Record<string, unknown> | null = null
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.is = () => q
      q.eq = (k: string, v: unknown) => (filters.push([k, v]), q)
      q.update = (p: Record<string, unknown>) => ((patch = p), q)
      const matches = () =>
        state.cases.filter((c) => filters.every(([k, v]) => (k === 'organization_id' ? c.organization_id === v : c[k] === v)))
      q.maybeSingle = async () => ({ data: matches()[0] ?? null, error: null })
      q.then = (resolve: (v: unknown) => unknown) => {
        if (!patch) return resolve({ data: matches(), error: null })
        if (state.updateError) return resolve({ data: null, error: state.updateError })
        const hit = matches()
        state.updates.push({ patch, eq: filters })
        for (const c of hit) Object.assign(c, patch)
        return resolve({ data: hit.map((c) => ({ id: c.id })), error: null })
      }
      return q
    },
  }),
}))

import { recordCollectionEvent, setCollectionStatus } from './actions'
import type { CollectionStatus } from './statuses'

const CASE = '11111111-1111-4111-8111-111111111111'

function seed(status: CollectionStatus, extra: Record<string, unknown> = {}) {
  state.cases = [{ id: CASE, organization_id: 'org-1', status, closed_on: null, closed_reason: null, ...extra }]
}

beforeEach(() => {
  state.role = 'board'
  state.orgId = 'org-1'
  state.updates = []
  state.events = []
  state.updateError = null
})

describe('setCollectionStatus transitions', () => {
  it('resolves an open case: stamps closed_on and closed_reason, logs case_closed with who and why', async () => {
    seed('lien_letter')
    expect(await setCollectionStatus({ caseId: CASE, status: 'resolved', closedReason: 'Paid in full, check 1042' })).toEqual({ ok: true })
    expect(state.cases[0]).toMatchObject({ status: 'resolved', closed_on: '2026-10-30', closed_reason: 'Paid in full, check 1042' })
    expect(state.events).toEqual([
      expect.objectContaining({
        organization_id: 'org-1',
        collection_case_id: CASE,
        event_type: 'case_closed',
        occurred_on: '2026-10-30',
        note: 'Paid in full, check 1042',
        recorded_by: 'user-1',
      }),
    ])
  })

  it('writes off an open case with the date and reason', async () => {
    seed('suit_filed')
    expect(await setCollectionStatus({ caseId: CASE, status: 'written_off', closedReason: 'Uncollectable after sale' })).toEqual({ ok: true })
    expect(state.cases[0]).toMatchObject({ status: 'written_off', closed_on: '2026-10-30', closed_reason: 'Uncollectable after sale' })
    expect(state.events[0]).toMatchObject({ event_type: 'case_closed', note: 'Uncollectable after sale', recorded_by: 'user-1' })
  })

  it.each(['resolved', 'written_off'] as const)('reopens a %s case: clears both close fields and logs it', async (from) => {
    seed(from, { closed_on: '2026-09-01', closed_reason: 'old' })
    expect(await setCollectionStatus({ caseId: CASE, status: 'monitoring', closedReason: 'Owner defaulted on the plan' })).toEqual({ ok: true })
    expect(state.cases[0]).toMatchObject({ status: 'monitoring', closed_on: null, closed_reason: null })
    expect(state.events[0]).toMatchObject({
      event_type: 'status_changed',
      recorded_by: 'user-1',
      note: expect.stringContaining('Owner defaulted on the plan'),
    })
    expect(String(state.events[0].note)).toMatch(/^Reopened from /)
  })

  it('moves between open stages without a close date and without a required reason', async () => {
    seed('collection_letter')
    expect(await setCollectionStatus({ caseId: CASE, status: 'attorney_presuit' })).toEqual({ ok: true })
    expect(state.cases[0]).toMatchObject({ status: 'attorney_presuit', closed_on: null, closed_reason: null })
    expect(state.events[0]).toMatchObject({ event_type: 'status_changed' })
  })

  it('switches between the two closed states, restamping the date and reason', async () => {
    seed('resolved', { closed_on: '2026-09-01', closed_reason: 'old' })
    expect(await setCollectionStatus({ caseId: CASE, status: 'written_off', closedReason: 'Payment bounced' })).toEqual({ ok: true })
    expect(state.cases[0]).toMatchObject({ status: 'written_off', closed_on: '2026-10-30', closed_reason: 'Payment bounced' })
  })

  it('requires a reason to close or reopen, and writes nothing without one', async () => {
    seed('lien_letter')
    for (const status of ['resolved', 'written_off'] as const) {
      const r = await setCollectionStatus({ caseId: CASE, status })
      expect(r.ok).toBe(false)
    }
    seed('resolved', { closed_on: '2026-09-01' })
    expect((await setCollectionStatus({ caseId: CASE, status: 'monitoring', closedReason: '  ' })).ok).toBe(false)
    expect(state.updates).toEqual([])
    expect(state.events).toEqual([])
  })

  it('refuses a no-op change', async () => {
    seed('resolved', { closed_on: '2026-09-01' })
    const r = await setCollectionStatus({ caseId: CASE, status: 'resolved', closedReason: 'again' })
    expect(r.ok).toBe(false)
    expect(state.updates).toEqual([])
  })

  it('explains a reopen blocked by another open case on the unit', async () => {
    seed('resolved', { closed_on: '2026-09-01' })
    state.updateError = { code: '23505', message: 'duplicate key' }
    const r = await setCollectionStatus({ caseId: CASE, status: 'monitoring', closedReason: 'Back in arrears' })
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('already has an open collections case') })
    expect(state.events).toEqual([])
  })
})

describe('setCollectionStatus access', () => {
  it('rejects a resident before touching anything', async () => {
    seed('lien_letter')
    state.role = 'resident'
    const r = await setCollectionStatus({ caseId: CASE, status: 'resolved', closedReason: 'Paid' })
    expect(r).toEqual({ ok: false, error: 'Only board members and admins can make this change.' })
    expect(state.updates).toEqual([])
    expect(state.events).toEqual([])
    expect(state.cases[0]).toMatchObject({ status: 'lien_letter', closed_on: null })
  })

  it('allows an admin', async () => {
    seed('lien_letter')
    state.role = 'admin'
    expect((await setCollectionStatus({ caseId: CASE, status: 'resolved', closedReason: 'Paid' })).ok).toBe(true)
  })

  it("cannot reach another organization's case", async () => {
    seed('lien_letter', { organization_id: 'org-2' })
    const r = await setCollectionStatus({ caseId: CASE, status: 'written_off', closedReason: 'Nope' })
    expect(r).toEqual({ ok: false, error: 'That collections case wasn’t found.' })
    expect(state.updates).toEqual([])
    expect(state.events).toEqual([])
    expect(state.cases[0]).toMatchObject({ status: 'lien_letter', closed_on: null })
  })

  it('scopes the update to the caller’s organization', async () => {
    seed('lien_letter')
    await setCollectionStatus({ caseId: CASE, status: 'resolved', closedReason: 'Paid' })
    expect(state.updates[0].eq).toContainEqual(['organization_id', 'org-1'])
  })
})

describe('recordCollectionEvent closing path', () => {
  const base = { caseId: CASE, occurredOn: '2026-10-01', advanceStatus: true } as const

  it('case_closed with advanceStatus stamps closed_on and the note as closed_reason', async () => {
    seed('lien_letter')
    expect(await recordCollectionEvent({ ...base, eventType: 'case_closed', note: 'Paid at closing' })).toEqual({ ok: true })
    expect(state.cases[0]).toMatchObject({ status: 'resolved', closed_on: '2026-10-30', closed_reason: 'Paid at closing' })
    expect(state.events[0]).toMatchObject({ event_type: 'case_closed', recorded_by: 'user-1' })
  })

  it('falls back to a plain reason when no note was typed', async () => {
    seed('lien_letter')
    await recordCollectionEvent({ ...base, eventType: 'case_closed' })
    expect(state.cases[0]).toMatchObject({ status: 'resolved', closed_on: '2026-10-30' })
    expect(state.cases[0].closed_reason).toBeTruthy()
  })

  it('an open-stage event leaves the close fields empty', async () => {
    seed('monitoring')
    await recordCollectionEvent({ ...base, eventType: 'collection_letter_sent' })
    expect(state.cases[0]).toMatchObject({ status: 'collection_letter', closed_on: null, closed_reason: null })
  })

  it('without advanceStatus the case is not closed', async () => {
    seed('lien_letter')
    await recordCollectionEvent({ ...base, advanceStatus: false, eventType: 'case_closed' })
    expect(state.cases[0]).toMatchObject({ status: 'lien_letter', closed_on: null })
  })

  it('rejects a resident', async () => {
    seed('lien_letter')
    state.role = 'resident'
    const r = await recordCollectionEvent({ ...base, eventType: 'case_closed' })
    expect(r.ok).toBe(false)
    expect(state.events).toEqual([])
  })
})
