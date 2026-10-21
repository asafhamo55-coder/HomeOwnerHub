import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-133: the two hearing actions. Flag off: refused with nothing touched.
// Flag on: the board's write is org-scoped and board-gated; the resident's
// goes through the database function with their own client.

const h = vi.hoisted(() => ({
  live: false,
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: true; role: string; orgId: string } | { ok: false; error: string },
  impersonating: false,
  violation: { id: 'v' } as { id: string } | null,
  calls: [] as Array<{ table?: string; fn?: string; method: string; args: unknown[] }>,
  upsertError: null as { code: string } | null,
  rpcResult: { data: '2026-10-20T12:00:00Z', error: null } as { data: string | null; error: { code: string } | null },
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
vi.mock('@/lib/impersonation', () => ({
  IMPERSONATION_READONLY_MSG: 'read only',
  getResidentActor: vi.fn(async () => ({ impersonating: h.impersonating })),
}))

function chain(table: string) {
  const self: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'insert']) {
    self[m] = (...args: unknown[]) => {
      h.calls.push({ table, method: m, args })
      if (m === 'insert') return Promise.resolve({ error: null })
      return self
    }
  }
  self.maybeSingle = async () => ({ data: h.violation, error: null })
  self.upsert = async (...args: unknown[]) => {
    h.calls.push({ table, method: 'upsert', args })
    return { error: h.upsertError }
  }
  return self
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    h.clientCalls += 1
    return {
      from: (t: string) => chain(t),
      rpc: async (fn: string, args: unknown) => {
        h.calls.push({ fn, method: 'rpc', args: [args] })
        return h.rpcResult
      },
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    }
  }),
}))

import { requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { requestViolationHearing, saveViolationHearing } from './actions'
import { HEARINGS_NOT_LIVE } from './rules'

const V = '22222222-2222-4222-8222-222222222222'
const input = {
  violationId: V,
  status: 'scheduled' as const,
  hearingOn: '2026-11-20',
  hearingTime: '18:30',
  location: 'Clubhouse',
  panel: [
    { name: 'A', role: 'member' as const },
    { name: 'B', role: 'member' as const },
    { name: 'C', role: 'member' as const },
  ],
  noticeSentOn: '2026-11-01',
  outcome: null,
  decidedOn: null,
  findingsSentOn: null,
  paymentDueOn: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  h.live = false
  h.gate = { ok: true, role: 'board', orgId: 'org-1' }
  h.impersonating = false
  h.violation = { id: V }
  h.calls = []
  h.upsertError = null
  h.rpcResult = { data: '2026-10-20T12:00:00Z', error: null }
  h.clientCalls = 0
})

describe('saveViolationHearing', () => {
  it('flag off: refuses after the gate and touches no database', async () => {
    expect(await saveViolationHearing(input)).toEqual({ ok: false, error: HEARINGS_NOT_LIVE })
    expect(requireBoardOrAdminForAction).toHaveBeenCalled()
    expect(h.clientCalls).toBe(0)
  })

  it('a resident is refused by the gate before anything else', async () => {
    h.live = true
    h.gate = { ok: false, error: 'board only' }
    expect(await saveViolationHearing(input)).toEqual({ ok: false, error: 'board only' })
    expect(h.clientCalls).toBe(0)
  })

  it('flag on: upserts one row per violation, scoped to the gate’s org', async () => {
    h.live = true
    expect(await saveViolationHearing(input)).toEqual({ ok: true })
    const vRead = h.calls.filter((c) => c.table === 'hoa_violations' && c.method === 'eq')
    expect(vRead.map((c) => c.args)).toEqual([
      ['id', V],
      ['org_id', 'org-1'],
    ])
    const up = h.calls.find((c) => c.method === 'upsert')!
    expect(up.table).toBe('violation_hearings')
    expect(up.args[0]).toMatchObject({ organization_id: 'org-1', violation_id: V, status: 'scheduled', hearing_on: '2026-11-20', panel: input.panel, outcome: null })
    expect(up.args[1]).toEqual({ onConflict: 'violation_id' })
    // The audit row carries ids, codes and a count — no names.
    const audit = h.calls.find((c) => c.table === 'audit_log' && c.method === 'insert')!
    expect(JSON.stringify(audit.args)).not.toContain('Clubhouse')
    expect(audit.args[0]).toMatchObject({ action: 'violation.hearing_saved', entity_id: V, metadata: { panel_size: 3 } })
  })

  it('flag on: another org’s violation is not found and nothing is written', async () => {
    h.live = true
    h.violation = null
    expect(await saveViolationHearing(input)).toEqual({ ok: false, error: 'We could not find that violation.' })
    expect(h.calls.some((c) => c.method === 'upsert')).toBe(false)
  })

  it('flag on: the 0068 shape rule is enforced before any write', async () => {
    h.live = true
    const res = await saveViolationHearing({ ...input, status: 'held', outcome: null })
    expect(res).toMatchObject({ ok: false, fieldErrors: { outcome: expect.any(String) } })
    expect(h.clientCalls).toBe(0)
  })
})

describe('requestViolationHearing', () => {
  it('flag off: refuses and touches no database', async () => {
    const res = await requestViolationHearing(V, 'I fixed it')
    expect(res.ok).toBe(false)
    expect(h.clientCalls).toBe(0)
  })

  it('an impersonating admin is refused first', async () => {
    h.live = true
    h.impersonating = true
    expect(await requestViolationHearing(V, null)).toEqual({ ok: false, error: 'read only' })
    expect(h.clientCalls).toBe(0)
  })

  it('flag on: calls request_violation_hearing with the resident’s own client', async () => {
    h.live = true
    expect(await requestViolationHearing(V, '  I fixed it  ')).toEqual({ ok: true, requestedAt: '2026-10-20T12:00:00Z' })
    expect(h.calls).toEqual([{ fn: 'request_violation_hearing', method: 'rpc', args: [{ p_violation_id: V, p_statement: 'I fixed it' }] }])
  })

  it('maps the function’s refusals to plain messages', async () => {
    h.live = true
    h.rpcResult = { data: null, error: { code: '42501' } }
    expect(await requestViolationHearing(V, null)).toEqual({ ok: false, error: 'We couldn’t find that notice on your home.' })
    h.rpcResult = { data: null, error: { code: '22023' } }
    expect((await requestViolationHearing(V, null)).ok).toBe(false)
    h.rpcResult = { data: null, error: { code: '55000' } }
    expect(await requestViolationHearing(V, null)).toEqual({ ok: false, error: expect.stringMatching(/hasn’t sent a notice/) })
  })

  it('refuses a bad id or an over-long statement without a call', async () => {
    h.live = true
    expect((await requestViolationHearing('nope', null)).ok).toBe(false)
    expect((await requestViolationHearing(V, 'x'.repeat(4001))).ok).toBe(false)
    expect(h.clientCalls).toBe(0)
  })
})
