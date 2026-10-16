import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StatuteRuleRefusalError } from '@homeowner-portal/workflows/W3-state-rules'

// POST /api/ai/violations/draft against api-route-conventions (RC-1..RC-12):
// board gate first (R-01), envelope everywhere, a foreign unit is 404 not a
// 503 "AI unavailable" (R-06), and no raw error text in any response (R-05).

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  owned: { units: true, associations: true } as Record<string, boolean>,
  lookupError: null as null | { code: string },
  ownedCalls: [] as Array<{ table: string; id: string; org: string }>,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null
      ? null
      : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))

vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: h.role === null ? null : { id: 'u-1' } } })) },
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
        if (h.lookupError) return { data: null, error: h.lookupError }
        return { data: h.owned[table] && org === 'org-1' ? { id } : null, error: null }
      })
      return q
    }),
  })),
}))

const execute = vi.hoisted(() => vi.fn())
vi.mock('@homeowner-portal/workflows/W3', () => ({ violationInspector: { execute } }))

import { POST } from './route'

const UNIT = '11111111-1111-4111-8111-111111111111'
const ASSOC = '22222222-2222-4222-8222-222222222222'
const GOOD = { unitId: UNIT, violationType: 'parking', description: 'Car parked on the lawn for a week.' }

const OUTPUT = {
  notice: 'Dear owner…',
  citedSection: '4.2',
  citations: [],
  recommendedSeverity: 'low',
  recommendedFineAmountCents: 2500,
  recommendedCurePeriodDays: 14,
  confidence: 'HIGH',
  stateRules: { jurisdiction: 'OTHER' },
}

function req(body: unknown, raw = false): Request {
  return new Request('http://x/api/ai/violations/draft', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

async function json(res: Response): Promise<Record<string, any>> {
  return (await res.json()) as Record<string, any>
}

const LEAK = 'duplicate key value violates unique constraint "ai_runs_pkey" Key (owner_email)=(jane@example.com)'

beforeEach(() => {
  h.role = 'board'
  h.owned = { units: true, associations: true }
  h.lookupError = null
  h.ownedCalls = []
  execute.mockReset()
  execute.mockResolvedValue({ runId: 'run-1', output: OUTPUT, status: 'pending_human_approval', citations: [] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ai/violations/draft', () => {
  it('signed out → 401 envelope, body never read', async () => {
    h.role = null
    const res = await POST(req('{not json', true))
    expect(res.status).toBe(401)
    expect((await json(res)).error.code).toBe('unauthenticated')
    expect(execute).not.toHaveBeenCalled()
  })

  it('resident → 403 forbidden envelope before validation (R-01, R-16)', async () => {
    h.role = 'resident'
    const res = await POST(req({}))
    expect(res.status).toBe(403)
    const body = await json(res)
    expect(body.error.code).toBe('forbidden')
    expect(typeof body.error.message).toBe('string')
    expect(execute).not.toHaveBeenCalled()
    expect(h.ownedCalls).toHaveLength(0)
  })

  it('bad JSON → 400 invalid_json envelope', async () => {
    const res = await POST(req('{not json', true))
    expect(res.status).toBe(400)
    expect((await json(res)).error.code).toBe('invalid_json')
  })

  it('schema miss → 400 validation_failed with {path, message} issues, not raw Zod', async () => {
    const res = await POST(req({ unitId: 'nope', violationType: 'x', description: 'short' }))
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.issues.map((i: { path: string }) => i.path).sort()).toEqual(
      ['description', 'unitId', 'violationType'],
    )
    for (const issue of body.error.issues) expect(Object.keys(issue).sort()).toEqual(['message', 'path'])
    expect(execute).not.toHaveBeenCalled()
  })

  it('oversized body → 413 payload_too_large', async () => {
    const res = await POST(req({ ...GOOD, description: 'x'.repeat(1_100_000) }))
    expect(res.status).toBe(413)
    expect((await json(res)).error.code).toBe('payload_too_large')
  })

  it('a foreign or missing unit → 404 not_found, never a 503 "AI unavailable" (R-06)', async () => {
    h.owned.units = false
    const res = await POST(req(GOOD))
    expect(res.status).toBe(404)
    expect((await json(res)).error.code).toBe('not_found')
    expect(execute).not.toHaveBeenCalled()
  })

  it('a foreign associationId → 404 before the service-role workflow runs (R-18)', async () => {
    h.owned.associations = false
    const res = await POST(req({ ...GOOD, associationId: ASSOC }))
    expect(res.status).toBe(404)
    expect(execute).not.toHaveBeenCalled()
    expect(h.ownedCalls.map((c) => c.table)).toEqual(['units', 'associations'])
  })

  it('board → 200 with runId and the camelCase draft; org id comes from the gate', async () => {
    const res = await POST(req({ ...GOOD, organizationId: 'org-evil' }))
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body).toEqual({ runId: 'run-1', ...OUTPUT })
    expect(body.error).toBeUndefined()
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ unitId: UNIT }), { organizationId: 'org-1' })
    expect(execute.mock.calls[0]![0]).not.toHaveProperty('organizationId')
  })

  it('statute refusal → 422 unprocessable, reason statute_refusal, with rule reasons', async () => {
    execute.mockRejectedValue(
      new Error('workflow_W3_failed: x', { cause: new StatuteRuleRefusalError('FL', ['Needs a hearing first.']) }),
    )
    const res = await POST(req(GOOD))
    expect(res.status).toBe(422)
    const body = await json(res)
    expect(body.error.code).toBe('unprocessable')
    expect(body.error.reason).toBe('statute_refusal')
    expect(body.error.jurisdiction).toBe('FL')
    expect(body.error.reasons).toEqual(['Needs a hearing first.'])
  })

  it('provider failure → 503 upstream_unavailable with no raw text', async () => {
    const providerErr = Object.assign(new Error(`429 ${LEAK}`), { status: 429, headers: {}, error: { message: LEAK } })
    execute.mockRejectedValue(new Error(`workflow_W3_failed: ${LEAK}`, { cause: providerErr }))
    const res = await POST(req(GOOD))
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('upstream_unavailable')
    expect(text).not.toContain('jane@')
    expect(text).not.toContain('ai_runs')
  })

  it('any other failure → generic 500 internal, no raw text in body or log', async () => {
    execute.mockRejectedValue(new Error(`ai_runs_insert_failed: ${LEAK}`))
    const res = await POST(req(GOOD))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('internal')
    expect(text).not.toContain('jane@')
    expect(text).not.toContain('ai_runs')
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls)
    expect(logged).not.toContain('jane@')
  })

  it('an ownership lookup DB error → 500 internal, not 404', async () => {
    h.lookupError = { code: '57014' }
    const res = await POST(req(GOOD))
    expect(res.status).toBe(500)
    expect((await json(res)).error.code).toBe('internal')
  })
})
