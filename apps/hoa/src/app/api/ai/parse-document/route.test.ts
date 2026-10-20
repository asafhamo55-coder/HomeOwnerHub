import { beforeEach, describe, expect, it, vi } from 'vitest'

// POST /api/ai/parse-document against api-route-conventions (RC-1..RC-12).
// The gate, the database and the model are mocked; the route's own
// branching (order, envelope, limits, write check) is what is under test.

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as
    | { ok: true; role: 'board' | 'admin'; orgId: string }
    | { ok: false; error: string },
  doc: { id: '11111111-1111-4111-8111-111111111111' } as { id: string } | null,
  lookupError: null as { code: string; message: string } | null,
  updateError: null as { code: string; message: string } | null,
  updated: [{ id: '11111111-1111-4111-8111-111111111111' }] as Array<{ id: string }> | null,
  calls: [] as Array<[string, unknown[]]>,
}))

// BL-104: the shared board AI ceiling is tested in lib/api/rate-limit.test.ts.
vi.mock('@/lib/api/rate-limit', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/rate-limit')>()),
  requireAiQuota: vi.fn(async () => ({ usageId: null, userId: 'user-1' })),
}))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => null),
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const chain: Record<string, unknown> = {}
    const rec =
      (name: string) =>
      (...args: unknown[]) => {
        h.calls.push([name, args])
        return chain
      }
    chain.select = rec('select')
    chain.eq = rec('eq')
    chain.update = rec('update')
    chain.maybeSingle = vi.fn(async () => ({ data: h.doc, error: h.lookupError }))
    // An awaited update chain resolves to the write result.
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: h.updateError ? null : h.updated, error: h.updateError })
    return {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) },
      from: vi.fn((table: string) => {
        h.calls.push(['from', [table]])
        return chain
      }),
    }
  }),
}))

vi.mock('@homeowner-portal/ai', () => ({
  parseCCRDocument: vi.fn(async () => ({
    documentTitle: 'CC&Rs',
    sections: [{ number: '4.2', title: 'Parking', summary: 'No boats.' }],
  })),
}))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import { parseCCRDocument } from '@homeowner-portal/ai'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MAX_DOCUMENT_TEXT } from '@/lib/api/limits'
import { POST } from './route'

const ID = '11111111-1111-4111-8111-111111111111'
const TEXT = 'Article 4. Parking. '.repeat(20)

function req(body: unknown, raw?: string): Request {
  return new Request('http://x/api/ai/parse-document', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  })
}

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: 'org-1' }
  h.doc = { id: ID }
  h.lookupError = null
  h.updateError = null
  h.updated = [{ id: ID }]
  h.calls = []
  vi.mocked(parseCCRDocument).mockClear()
  vi.mocked(getSupabaseServerClient).mockClear()
})

describe('POST /api/ai/parse-document', () => {
  it('a resident gets the 403 envelope before the body or database is touched (RC-3, RC-4)', async () => {
    h.gate = { ok: false, error: 'Only board members and admins can make this change.' }
    const res = await POST(req(null, '{not json'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('forbidden')
    expect(typeof body.error.message).toBe('string')
    expect(parseCCRDocument).not.toHaveBeenCalled()
  })

  it('bad JSON is 400 invalid_json (RC-1, RC-10)', async () => {
    const res = await POST(req(null, '{not json'))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_json')
  })

  it('a schema miss is 400 validation_failed with issues (RC-1, RC-2)', async () => {
    const res = await POST(req({ documentId: 'nope', rawText: 'short' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_failed')
    expect(Array.isArray(body.error.issues)).toBe(true)
    expect(body.error.issues.map((i: { path: string }) => i.path).sort()).toEqual(['documentId', 'rawText'])
  })

  it('rawText over MAX_DOCUMENT_TEXT is rejected before the model runs (RC-8, R-17)', async () => {
    const res = await POST(req({ documentId: ID, rawText: 'x'.repeat(MAX_DOCUMENT_TEXT + 1) }))
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.error.code).toBe('payload_too_large')
    // RC-1: every 413 carries extra.maxBytes — the same field, and the same
    // value, as the byte-cap 413 below, so a client reads one shape.
    expect(body.error.maxBytes).toBe(MAX_DOCUMENT_TEXT * 4)
    expect(body.error.maxChars).toBe(MAX_DOCUMENT_TEXT)
    expect(parseCCRDocument).not.toHaveBeenCalled()
  })

  it('a body over the byte cap is 413 with the same maxBytes (RC-1, RC-8)', async () => {
    const res = await POST(req(null, JSON.stringify({ documentId: ID, rawText: 'x'.repeat(MAX_DOCUMENT_TEXT * 4) })))
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.error.code).toBe('payload_too_large')
    expect(body.error.maxBytes).toBe(MAX_DOCUMENT_TEXT * 4)
    expect(parseCCRDocument).not.toHaveBeenCalled()
  })

  it('a document outside the caller org is 404 not_found, scoped by org_id (RC-4)', async () => {
    h.doc = null
    const res = await POST(req({ documentId: ID, rawText: TEXT }))
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
    expect(h.calls).toContainEqual(['eq', ['org_id', 'org-1']])
    expect(parseCCRDocument).not.toHaveBeenCalled()
  })

  it('a model failure is 503 upstream_unavailable with no raw provider text (RC-1, RC-2)', async () => {
    vi.mocked(parseCCRDocument).mockRejectedValueOnce(new Error('groq 500: secret-provider-detail'))
    const res = await POST(req({ documentId: ID, rawText: TEXT }))
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('upstream_unavailable')
    expect(text).not.toContain('secret-provider-detail')
  })

  it('a model reply we cannot use is 503 upstream_unavailable (RC-1)', async () => {
    vi.mocked(parseCCRDocument).mockResolvedValueOnce({ nope: true } as never)
    const res = await POST(req({ documentId: ID, rawText: TEXT }))
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('upstream_unavailable')
  })

  it('a numeric section number from the model is coerced, not rejected', async () => {
    vi.mocked(parseCCRDocument).mockResolvedValueOnce({
      documentTitle: 'Rules',
      sections: [{ number: 4, title: 'Pets' }],
    } as never)
    const res = await POST(req({ documentId: ID, rawText: TEXT }))
    expect(res.status).toBe(200)
    expect((await res.json()).sections).toEqual([{ number: '4', title: 'Pets', summary: '' }])
  })

  it('a failed save is the generic 500, not a success, and leaks no DB text (RC-6, R-19)', async () => {
    h.updateError = { code: '42501', message: 'permission denied for table hoa_documents' }
    const res = await POST(req({ documentId: ID, rawText: TEXT }))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('internal')
    expect(text).not.toContain('hoa_documents')
  })

  it('an update RLS silently refused (no rows) is not reported as success (RC-6)', async () => {
    h.updated = []
    const res = await POST(req({ documentId: ID, rawText: TEXT }))
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe('internal')
  })

  it('success returns camelCase sections and scopes the update to the caller org (RC-11)', async () => {
    const res = await POST(req({ documentId: ID, rawText: TEXT }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      documentTitle: 'CC&Rs',
      sections: [{ number: '4.2', title: 'Parking', summary: 'No boats.' }],
    })
    expect(body.error).toBeUndefined()
    const updateIdx = h.calls.findIndex(([n]) => n === 'update')
    expect(updateIdx).toBeGreaterThan(-1)
    expect(h.calls.slice(updateIdx)).toContainEqual(['eq', ['org_id', 'org-1']])
  })
})
