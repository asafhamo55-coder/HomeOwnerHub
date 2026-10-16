import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  role: 'resident' as 'admin' | 'board' | 'resident' | null,
  user: { id: 'user-1' } as { id: string } | null,
  orgOwned: true,
  workflowError: null as unknown,
  citations: [] as Array<{ chunkId: string; documentId: string; docType: string; section: string | null }>,
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

const w1 = vi.hoisted(() => {
  class GoverningDocsRetrievalError extends Error {
    constructor() {
      super('governing_docs_retrieval_failed:chunks')
      this.name = 'GoverningDocsRetrievalError'
    }
  }
  return { GoverningDocsRetrievalError, queryGoverningDocs: vi.fn() }
})
vi.mock('@homeowner-portal/workflows/W1', () => w1)

const { POST } = await import('./route')

function req(body: unknown, raw = false): Request {
  return new Request('http://localhost/api/ai/ask-docs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

const RAW = 'relation "governing_document_chunks" does not exist; key (email)=(jane@example.com)'

beforeEach(() => {
  h.role = 'resident'
  h.user = { id: 'user-1' }
  h.orgOwned = true
  h.workflowError = null
  h.citations = [{ chunkId: 'c1', documentId: 'd1', docType: 'rules', section: '4.2' }]
  w1.queryGoverningDocs.mockReset()
  w1.queryGoverningDocs.mockImplementation(async () => {
    if (h.workflowError) throw h.workflowError
    return {
      answer: 'Pets are allowed.',
      confidence: 'HIGH',
      citations: h.citations,
      clarification: null,
      recommendation: null,
      runId: 'run-1',
    }
  })
})

describe('POST /api/ai/ask-docs', () => {
  it('401 envelope when signed out, before reading the body', async () => {
    h.role = null
    h.user = null
    const res = await POST(req('{not json', true))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('unauthenticated')
    expect(w1.queryGoverningDocs).not.toHaveBeenCalled()
  })

  it('403 forbidden/no_org when signed in without an org', async () => {
    h.role = null
    const res = await POST(req({ question: 'Can I have a dog?' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'forbidden', reason: 'no_org' })
  })

  it('a resident is restricted to the resident-visible governing doc types (F-04)', async () => {
    const res = await POST(req({ question: 'Can I have a dog?' }))
    expect(res.status).toBe(200)
    const [, ctx] = w1.queryGoverningDocs.mock.calls[0]!
    expect(ctx).toMatchObject({ organizationId: 'org-1', associationId: null })
    expect([...ctx.allowedDocTypes].sort()).toEqual(['amendment', 'bylaws', 'declaration', 'policy', 'rules'])
    expect(ctx.allowedDocTypes).not.toContain('minutes')
  })

  it.each(['admin', 'board'] as const)('%s sees every document (no filter)', async (role) => {
    h.role = role
    const res = await POST(req({ question: 'What do the minutes say?' }))
    expect(res.status).toBe(200)
    const [, ctx] = w1.queryGoverningDocs.mock.calls[0]!
    expect(ctx.allowedDocTypes).toBeUndefined()
  })

  it('returns the camelCase answer body', async () => {
    const res = await POST(req({ question: 'Can I have a dog?' }))
    const body = await res.json()
    expect(body).toEqual({
      answer: 'Pets are allowed.',
      confidence: 'HIGH',
      citations: [{ chunkId: 'c1', documentId: 'd1', docType: 'rules', section: '4.2' }],
      clarification: null,
      recommendation: null,
      runId: 'run-1',
    })
    expect(body).not.toHaveProperty('error')
  })

  it('fails closed if a resident answer cites a hidden doc type', async () => {
    h.citations = [{ chunkId: 'c9', documentId: 'd9', docType: 'minutes', section: null }]
    const res = await POST(req({ question: 'What did the board decide?' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('internal')
    expect(JSON.stringify(body)).not.toContain('Pets')
  })

  it('400 invalid_json for a malformed body', async () => {
    const res = await POST(req('{nope', true))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_json')
  })

  it('400 validation_failed with issues, never raw Zod', async () => {
    const res = await POST(req({ question: 'x', associationId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_failed')
    expect(Array.isArray(body.error.issues)).toBe(true)
    expect(body.error.issues[0]).toEqual({ path: expect.any(String), message: expect.any(String) })
    expect(body).not.toHaveProperty('issues')
  })

  it('400 for an over-long question', async () => {
    const res = await POST(req({ question: 'a'.repeat(2001) }))
    expect(res.status).toBe(400)
  })

  it('413 for an oversized body', async () => {
    const res = await POST(req({ question: 'a'.repeat(1024 * 1024 + 10) }))
    expect(res.status).toBe(413)
    expect((await res.json()).error.code).toBe('payload_too_large')
  })

  it('404 for a foreign associationId, before calling W1', async () => {
    h.orgOwned = false
    const res = await POST(req({ question: 'Can I have a dog?', associationId: '00000000-0000-4000-8000-000000000001' }))
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
    expect(w1.queryGoverningDocs).not.toHaveBeenCalled()
  })

  it('503 upstream_unavailable on a model failure, with no raw text', async () => {
    h.workflowError = new Error(`workflow_W1_failed: ${RAW}`)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req({ question: 'Can I have a dog?' }))
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('upstream_unavailable')
    expect(text).not.toContain('jane@')
    expect(text).not.toContain('governing_document_chunks')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('jane@')
    spy.mockRestore()
  })

  it('500 internal when retrieval (a DB read) fails', async () => {
    h.workflowError = new Error(`workflow_W1_failed: ${RAW}`, { cause: new w1.GoverningDocsRetrievalError() })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(req({ question: 'Can I have a dog?' }))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('internal')
    expect(text).not.toContain('jane@')
    spy.mockRestore()
  })
})
