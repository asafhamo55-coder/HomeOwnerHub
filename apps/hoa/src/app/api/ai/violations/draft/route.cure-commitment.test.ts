import { beforeEach, describe, expect, it, vi } from 'vitest'

// POST /api/ai/violations/draft with `violationId`: the owner's recorded
// financial commitment to cure (CA § 5855(c)(2)) is folded into the W3
// requested action on the server, so the client cannot leave it out.

const h = vi.hoisted(() => ({
  owned: { units: true, hoa_violations: true } as Record<string, boolean>,
  ownedCalls: [] as Array<{ table: string; id: string; org: string }>,
  commitment: null as null | { committedOn: string; note: string | null; recordedAt: string },
  commitmentFails: false,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => ({
    role: 'board',
    org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 },
  })),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-1' } } })) },
    from: vi.fn((table: string) => {
      const q: Record<string, unknown> = {}
      let id = ''
      let org = ''
      q.select = vi.fn(() => q)
      q.eq = vi.fn((col: string, v: string) => {
        if (col === 'id') id = v
        else org = v
        return q
      })
      q.maybeSingle = vi.fn(async () => {
        h.ownedCalls.push({ table, id, org })
        return { data: h.owned[table] && org === 'org-1' ? { id } : null, error: null }
      })
      return q
    }),
  })),
}))

vi.mock('@/lib/violation-cure-commitment', async (orig) => {
  const real = await orig<typeof import('@/lib/violation-cure-commitment')>()
  return {
    ...real,
    loadCureCommitment: vi.fn(async () => {
      if (h.commitmentFails) throw new Error('cure_commitment_audit_failed')
      return h.commitment
    }),
  }
})

const execute = vi.hoisted(() => vi.fn())
vi.mock('@homeowner-portal/workflows/W3', () => ({ violationInspector: { execute } }))

import { POST } from './route'

const UNIT = '11111111-1111-4111-8111-111111111111'
const VIOLATION = '33333333-3333-4333-8333-333333333333'
const GOOD = {
  unitId: UNIT,
  violationType: 'parking',
  description: 'Car parked on the lawn for a week.',
  requestedAction: { step: 'impose_fine', hearingHeld: true, financialCommitmentToCure: false },
}

function req(body: unknown): Request {
  return new Request('http://x/api/ai/violations/draft', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  h.owned = { units: true, hoa_violations: true }
  h.ownedCalls = []
  h.commitment = null
  h.commitmentFails = false
  execute.mockReset()
  execute.mockResolvedValue({ runId: 'run-1', output: { notice: 'x' }, status: 'pending_human_approval', citations: [] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ai/violations/draft — financial commitment to cure', () => {
  it('a recorded commitment sets financialCommitmentToCure, overriding the client', async () => {
    h.commitment = { committedOn: '2026-10-01', note: null, recordedAt: '2026-10-02T00:00:00Z' }
    const res = await POST(req({ ...GOOD, violationId: VIOLATION }))
    expect(res.status).toBe(200)
    const input = execute.mock.calls[0][0]
    expect(input.requestedAction).toMatchObject({ step: 'impose_fine', financialCommitmentToCure: true })
    expect(input).not.toHaveProperty('violationId')
    expect(h.ownedCalls).toContainEqual({ table: 'hoa_violations', id: VIOLATION, org: 'org-1' })
  })

  it('no commitment recorded leaves the requested action as sent', async () => {
    const res = await POST(req({ ...GOOD, violationId: VIOLATION }))
    expect(res.status).toBe(200)
    expect(execute.mock.calls[0][0].requestedAction).toMatchObject({ financialCommitmentToCure: false })
  })

  it('without violationId nothing is looked up', async () => {
    h.commitment = { committedOn: '2026-10-01', note: null, recordedAt: '2026-10-02T00:00:00Z' }
    const res = await POST(req(GOOD))
    expect(res.status).toBe(200)
    expect(h.ownedCalls.some((c) => c.table === 'hoa_violations')).toBe(false)
    expect(execute.mock.calls[0][0].requestedAction).toMatchObject({ financialCommitmentToCure: false })
  })

  it('a foreign violation → 404 before any draft', async () => {
    h.owned.hoa_violations = false
    const res = await POST(req({ ...GOOD, violationId: VIOLATION }))
    expect(res.status).toBe(404)
    expect(execute).not.toHaveBeenCalled()
  })

  it('a failed commitment read → 500, never a draft that skipped the check', async () => {
    h.commitmentFails = true
    const res = await POST(req({ ...GOOD, violationId: VIOLATION }))
    expect(res.status).toBe(500)
    expect(execute).not.toHaveBeenCalled()
  })
})
