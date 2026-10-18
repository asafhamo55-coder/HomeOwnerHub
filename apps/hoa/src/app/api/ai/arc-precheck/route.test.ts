import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  role: 'resident' as 'admin' | 'board' | 'resident' | null,
  user: { id: 'user-1' } as { id: string } | null,
  orgOwned: true,
  units: [{ unit_id: '11111111-1111-4111-8111-111111111111', association_id: '22222222-2222-4222-8222-222222222222' }],
  workflowError: null as unknown,
  rules: [] as Array<{ chunkId: string; documentId: string; docType: string; section: string | null; point: string; status: string }>,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null
      ? null
      : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: h.orgOwned ? { id: 'x' } : null, error: null }),
      }
      return q
    },
  })),
}))

vi.mock('@/lib/resident', () => ({ getResidentUnits: vi.fn(async () => h.units) }))

const w37 = vi.hoisted(() => {
  class GoverningDocsRetrievalError extends Error {
    constructor() {
      super('governing_docs_retrieval_failed:chunks')
      this.name = 'GoverningDocsRetrievalError'
    }
  }
  return {
    GoverningDocsRetrievalError,
    reviewArcRequest: vi.fn(),
    buildArcFacts: vi.fn((r: { category: string; summary: string; scopeDescription: string }) => ({
      category: r.category,
      summary: r.summary,
      scopeDescription: r.scopeDescription,
      hasStartDate: false,
      hasCompletionDate: false,
      hasContractor: false,
      hasContractorLicense: false,
    })),
  }
})
vi.mock('@homeowner-portal/workflows/W37', () => w37)

const { POST } = await import('./route')

const UNIT = '11111111-1111-4111-8111-111111111111'
const ASSOC = '22222222-2222-4222-8222-222222222222'

const BODY = {
  unitId: UNIT,
  category: 'fence',
  summary: 'Replace rear fence',
  scopeDescription: 'Six foot white vinyl privacy fence on the rear line.',
}

function req(body: unknown, raw = false): Request {
  return new Request('http://localhost/api/ai/arc-precheck', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

beforeEach(() => {
  h.role = 'resident'
  h.user = { id: 'user-1' }
  h.orgOwned = true
  h.workflowError = null
  h.rules = [{ chunkId: 'c1', documentId: 'd1', docType: 'rules', section: '4.2', point: 'Six feet max.', status: 'fits' }]
  w37.reviewArcRequest.mockReset()
  w37.reviewArcRequest.mockImplementation(async () => {
    if (h.workflowError) throw h.workflowError
    return {
      mode: 'precheck',
      status: 'answered',
      summary: 'Rear fences are limited to 6 feet.',
      confidence: 'HIGH',
      rules: h.rules,
      questions: ['Where on the lot?'],
      missingInfo: [],
      suggestion: null,
      warnings: [],
      disclaimer: 'Only the board can approve or deny your application.',
      runId: 'run-1',
    }
  })
})

describe('POST /api/ai/arc-precheck', () => {
  it('401 when signed out, before reading the body', async () => {
    h.role = null
    h.user = null
    const res = await POST(req('{not json', true))
    expect(res.status).toBe(401)
    expect(w37.reviewArcRequest).not.toHaveBeenCalled()
  })

  it('400 on a body that fails validation, without calling the model', async () => {
    const res = await POST(req({ ...BODY, category: 'moat' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('validation_failed')
    expect(w37.reviewArcRequest).not.toHaveBeenCalled()
  })

  it('a resident runs precheck mode on their own home, restricted to resident-visible docs', async () => {
    const res = await POST(req(BODY))
    expect(res.status).toBe(200)
    const [input, ctx] = w37.reviewArcRequest.mock.calls[0]!
    expect(ctx).toEqual({ organizationId: 'org-1' })
    expect(input.mode).toBe('precheck')
    expect(input.associationId).toBe(ASSOC)
    expect([...input.allowedDocTypes].sort()).toEqual(['amendment', 'bylaws', 'declaration', 'policy', 'rules'])
    expect(w37.buildArcFacts).toHaveBeenCalled()
  })

  it('404 for a unit that is not the resident’s', async () => {
    const res = await POST(req({ ...BODY, unitId: '99999999-9999-4999-8999-999999999999' }))
    expect(res.status).toBe(404)
    expect(w37.reviewArcRequest).not.toHaveBeenCalled()
  })

  it('returns the camelCase pre-check with no suggestion field', async () => {
    const body = await (await POST(req(BODY))).json()
    expect(body).toEqual({
      status: 'answered',
      summary: 'Rear fences are limited to 6 feet.',
      confidence: 'HIGH',
      rules: [{ chunkId: 'c1', documentId: 'd1', docType: 'rules', section: '4.2', point: 'Six feet max.', status: 'fits' }],
      questions: ['Where on the lot?'],
      missingInfo: [],
      disclaimer: 'Only the board can approve or deny your application.',
      runId: 'run-1',
    })
    expect(body).not.toHaveProperty('suggestion')
  })

  it('fails closed if a resident check cites a hidden doc type', async () => {
    h.rules = [{ chunkId: 'c9', documentId: 'd9', docType: 'minutes', section: null, point: 'x', status: 'fits' }]
    const res = await POST(req(BODY))
    expect(res.status).toBe(500)
  })

  it('a model failure is 503 upstream_unavailable with no raw text', async () => {
    h.workflowError = new Error('workflow_W37_failed: key (email)=(jane@example.com)')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req(BODY))
    expect(res.status).toBe(503)
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain('jane@example.com')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('jane@example.com')
    spy.mockRestore()
  })

  it('a retrieval DB failure is a generic 500', async () => {
    h.workflowError = new Error('workflow_W37_failed', { cause: new w37.GoverningDocsRetrievalError() })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req(BODY))
    expect(res.status).toBe(500)
    spy.mockRestore()
  })
})
