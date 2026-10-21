import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-140: cancelHearingAfterCure. Board-gated and flag-gated before any
// read; re-checks the cure server-side; audits (ids and codes only) BEFORE
// the status change, and refuses when the audit fails.

const h = vi.hoisted(() => ({
  live: true,
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: true; role: string; orgId: string } | { ok: false; error: string },
  violation: { id: 'v', status: 'resolved', resolved_at: '2026-11-10T15:00:00Z' } as Record<string, unknown> | null,
  hearing: null as Record<string, unknown> | null,
  state: 'FL' as string | null,
  auditError: null as { code: string } | null,
  updateError: null as { code: string } | null,
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  clientCalls: 0,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/db/m4', () => ({
  get M4_APPLIED() {
    return h.live
  },
}))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'board only',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))
vi.mock('@/lib/impersonation', () => ({ IMPERSONATION_READONLY_MSG: 'read only', getResidentActor: vi.fn() }))
vi.mock('@/lib/violation-cure-commitment', () => ({ loadOrgStateRules: vi.fn(async () => ({ state: h.state })) }))
vi.mock('@/lib/association-time-current', () => ({ currentTimeZone: vi.fn(async () => 'America/New_York') }))

function chain(table: string) {
  const self: Record<string, unknown> = {}
  let op = 'select'
  for (const m of ['select', 'eq', 'is', 'update']) {
    self[m] = (...args: unknown[]) => {
      h.calls.push({ table, method: m, args })
      if (m === 'update') op = 'update'
      return self
    }
  }
  self.insert = async (...args: unknown[]) => {
    h.calls.push({ table, method: 'insert', args })
    return { error: table === 'audit_log' ? h.auditError : null }
  }
  self.maybeSingle = async () => ({ data: table === 'hoa_violations' ? h.violation : h.hearing, error: null })
  // `await db.from(t).update(...).eq(...).eq(...)`
  self.then = (resolve: (v: unknown) => void) => resolve(op === 'update' ? { error: h.updateError } : { data: null, error: null })
  return self
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    h.clientCalls += 1
    return { from: (t: string) => chain(t), auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }
  }),
}))

import { cancelHearingAfterCure } from './actions'
import { HEARINGS_NOT_LIVE } from './rules'

const V = '22222222-2222-4222-8222-222222222222'
const HEARING = {
  id: 'h-1',
  violation_id: V,
  status: 'scheduled',
  hearing_on: '2026-11-20',
  panel: [{ name: 'Somebody', role: 'member' }],
  notice_sent_on: '2026-11-01',
}

beforeEach(() => {
  h.live = true
  h.gate = { ok: true, role: 'board', orgId: 'org-1' }
  h.violation = { id: V, status: 'resolved', resolved_at: '2026-11-10T15:00:00Z' }
  h.hearing = { ...HEARING }
  h.state = 'FL'
  h.auditError = null
  h.updateError = null
  h.calls = []
  h.clientCalls = 0
})

const writes = () => h.calls.filter((c) => c.method === 'insert' || c.method === 'update')

describe('cancelHearingAfterCure', () => {
  it('a resident is refused before any client is made', async () => {
    h.gate = { ok: false, error: 'board only' }
    expect(await cancelHearingAfterCure({ violationId: V, reason: 'cured_before_hearing' })).toEqual({ ok: false, error: 'board only' })
    expect(h.clientCalls).toBe(0)
  })

  it('flag off: refused, nothing touched', async () => {
    h.live = false
    expect(await cancelHearingAfterCure({ violationId: V, reason: 'cured_before_hearing' })).toEqual({ ok: false, error: HEARINGS_NOT_LIVE })
    expect(h.clientCalls).toBe(0)
  })

  it('an unknown reason is refused before any read', async () => {
    const r = await cancelHearingAfterCure({ violationId: V, reason: 'because I said so' })
    expect(r.ok).toBe(false)
    expect(h.clientCalls).toBe(0)
  })

  it('FL: audits ids and codes first, then cancels, both org-scoped', async () => {
    expect(await cancelHearingAfterCure({ violationId: V, reason: 'cured_as_noticed' })).toEqual({ ok: true })
    const w = writes()
    expect(w.map((c) => `${c.table}.${c.method}`)).toEqual(['audit_log.insert', 'violation_hearings.update'])
    const audit = w[0]!.args[0] as Record<string, unknown>
    expect(audit).toMatchObject({
      action: 'violation.hearing_cancelled_cured',
      org_id: 'org-1',
      entity_type: 'hoa_violation',
      entity_id: V,
      metadata: { hearing_id: 'h-1', reason: 'cured_as_noticed', state: 'FL', prior_status: 'scheduled' },
    })
    expect(JSON.stringify(audit)).not.toContain('Somebody')
    expect(w[1]!.args[0]).toMatchObject({ status: 'cancelled', outcome: null })
    const updEqs = h.calls.filter((c) => c.table === 'violation_hearings' && c.method === 'eq').map((c) => c.args)
    expect(updEqs).toContainEqual(['organization_id', 'org-1'])
    expect(updEqs).toContainEqual(['id', 'h-1'])
  })

  it('the violation read is scoped to the caller’s org', async () => {
    await cancelHearingAfterCure({ violationId: V, reason: 'cured_before_hearing' })
    const eqs = h.calls.filter((c) => c.table === 'hoa_violations' && c.method === 'eq').map((c) => c.args)
    expect(eqs).toContainEqual(['org_id', 'org-1'])
  })

  it('a failed audit refuses and does not cancel', async () => {
    h.auditError = { code: '42501' }
    const r = await cancelHearingAfterCure({ violationId: V, reason: 'cured_before_hearing' })
    expect(r.ok).toBe(false)
    expect(writes().map((c) => c.method)).toEqual(['insert'])
  })

  it('a reason from another state is refused (FL has no financial commitment)', async () => {
    const r = await cancelHearingAfterCure({ violationId: V, reason: 'cure_commitment' })
    expect(r.ok).toBe(false)
    expect(writes()).toEqual([])
  })

  it('CA: a financial commitment is accepted', async () => {
    h.state = 'CA'
    expect(await cancelHearingAfterCure({ violationId: V, reason: 'cure_commitment' })).toEqual({ ok: true })
  })

  it('an open violation: refused, nothing written', async () => {
    h.violation = { id: V, status: 'notice_sent', resolved_at: null }
    const r = await cancelHearingAfterCure({ violationId: V, reason: 'cured_before_hearing' })
    expect(r.ok).toBe(false)
    expect(writes()).toEqual([])
  })

  it('cured after the hearing day: refused', async () => {
    h.violation = { id: V, status: 'resolved', resolved_at: '2026-11-25T15:00:00Z' }
    expect((await cancelHearingAfterCure({ violationId: V, reason: 'cured_before_hearing' })).ok).toBe(false)
    expect(writes()).toEqual([])
  })

  it('a held hearing: refused', async () => {
    h.hearing = { ...HEARING, status: 'held', outcome: 'upheld' }
    const r = await cancelHearingAfterCure({ violationId: V, reason: 'cured_before_hearing' })
    expect(r).toMatchObject({ ok: false, error: 'This hearing is already held or cancelled.' })
    expect(writes()).toEqual([])
  })

  it('no hearing on record: refused', async () => {
    h.hearing = null
    expect((await cancelHearingAfterCure({ violationId: V, reason: 'cured_before_hearing' })).ok).toBe(false)
    expect(writes()).toEqual([])
  })

  it('another org’s violation (not found): refused', async () => {
    h.violation = null
    expect(await cancelHearingAfterCure({ violationId: V, reason: 'cured_before_hearing' })).toEqual({
      ok: false,
      error: 'We could not find that violation.',
    })
    expect(writes()).toEqual([])
  })
})
