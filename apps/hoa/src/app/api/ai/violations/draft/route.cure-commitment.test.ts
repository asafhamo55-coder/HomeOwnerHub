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

// The BL-078 ledger: follow-up letters (letterKind) draw on follow_up_letter;
// since BL-104 every other draft draws on board_ai.
const quota = vi.hoisted(() => ({ fn: vi.fn(), limited: false }))
vi.mock('@/lib/api/rate-limit', async () => {
  const { ApiRouteError } = await import('@/lib/api/errors')
  return {
    requireAiQuota: quota.fn.mockImplementation(async () => {
      if (quota.limited) {
        throw new ApiRouteError('rate_limited', 'You’ve reached the limit.', { reason: 'user_limit', retryAfterSeconds: 60 }, { 'Retry-After': '60' })
      }
      return { usageId: null, userId: 'u-1' }
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

describe('POST /api/ai/violations/draft — follow-up letters (violation page)', () => {
  it('keeps the violation and letter kind on the run as followUp', async () => {
    const res = await POST(req({ ...GOOD, violationId: VIOLATION, letterKind: 'fine_notice' }))
    expect(res.status).toBe(200)
    const input = execute.mock.calls[0][0]
    // A dialog draft stays out of Approvals until the board saves it.
    expect(input.followUp).toEqual({ violationId: VIOLATION, letterKind: 'fine_notice', awaitingSave: true })
    expect(input).not.toHaveProperty('letterKind')
  })

  it('a violationId without a kind is still a follow-up', async () => {
    await POST(req({ ...GOOD, violationId: VIOLATION }))
    expect(execute.mock.calls[0][0].followUp).toEqual({ violationId: VIOLATION })
  })

  it('a new-violation draft carries no followUp', async () => {
    await POST(req(GOOD))
    expect(execute.mock.calls[0][0]).not.toHaveProperty('followUp')
  })

  it('a letter kind without a violation → 400, no draft', async () => {
    const res = await POST(req({ ...GOOD, letterKind: 'hearing_notice' }))
    expect(res.status).toBe(400)
    expect(execute).not.toHaveBeenCalled()
  })

  it('an unknown letter kind → 400, no draft', async () => {
    const res = await POST(req({ ...GOOD, violationId: VIOLATION, letterKind: 'eviction' }))
    expect(res.status).toBe(400)
    expect(execute).not.toHaveBeenCalled()
  })

  it('a state-law refusal answers with the rule text, never a draft', async () => {
    const { StatuteRuleRefusalError } = await import('@homeowner-portal/workflows/W3-state-rules')
    execute.mockRejectedValueOnce(
      new StatuteRuleRefusalError('CA', ['California law (Civ. Code § 5855(c)(2)) forbids a fine.']),
    )
    const res = await POST(req({ ...GOOD, violationId: VIOLATION, letterKind: 'fine_notice' }))
    expect(res.ok).toBe(false)
    const body = await res.json()
    expect(body.error).toMatchObject({ reason: 'statute_refusal', jurisdiction: 'CA' })
    expect(body.error.reasons[0]).toContain('5855(c)(2)')
    expect(body).not.toHaveProperty('notice')
  })
})

describe('POST /api/ai/violations/draft — follow-up letter rate limit', () => {
  beforeEach(() => {
    quota.fn.mockClear()
    quota.limited = false
  })

  it('a follow-up letter draws on the follow_up_letter bucket for this org', async () => {
    const res = await POST(req({ ...GOOD, violationId: VIOLATION, letterKind: 'second_notice' }))
    expect(res.status).toBe(200)
    expect(quota.fn).toHaveBeenCalledWith('follow_up_letter', 'org-1')
  })

  it('a full window is a 429 with Retry-After, and the model is not called', async () => {
    quota.limited = true
    const res = await POST(req({ ...GOOD, violationId: VIOLATION, letterKind: 'second_notice' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(execute).not.toHaveBeenCalled()
  })

  it('BL-104: new-violation drafts (wizard, /inspect) and a bare violationId draw on the shared board_ai bucket', async () => {
    expect((await POST(req(GOOD))).status).toBe(200)
    expect((await POST(req({ ...GOOD, violationId: VIOLATION }))).status).toBe(200)
    expect(quota.fn.mock.calls).toEqual([
      ['board_ai', 'org-1'],
      ['board_ai', 'org-1'],
    ])
  })

  it('BL-104: over the board AI ceiling a new-violation draft is a 429 and the model is not called', async () => {
    execute.mockClear()
    quota.limited = true
    const res = await POST(req(GOOD))
    expect(res.status).toBe(429)
    expect(execute).not.toHaveBeenCalled()
  })

  it('a request refused before the model (unknown violation) uses no quota', async () => {
    h.owned = { units: true, hoa_violations: false }
    const res = await POST(req({ ...GOOD, violationId: VIOLATION, letterKind: 'second_notice' }))
    expect(res.status).toBe(404)
    expect(quota.fn).not.toHaveBeenCalled()
  })
})
