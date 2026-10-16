import { beforeEach, describe, expect, it, vi } from 'vitest'

// POST /api/ai/meeting-summary — board-only AI drafting (RC-4). Proves the
// api-route-conventions rules this route used to break: resident 403 before
// the body is read (R-02, R-16), the RC-1 envelope for bad JSON / schema
// misses (R-14/R-15), a bounded transcript that is 413 — not 400 — whether
// it trips the 1 MB body cap or only the 500k-char transcript cap (R-17,
// RC-1), a real date (C-11), and provider / org-read failures that carry no
// raw text (RC-2). The resident-403 case is also in
// src/lib/board-write-gates.test.ts (RC-12 step 2).

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  signedIn: true,
  summarize: vi.fn(async (_p: { hoaName: string; meetingDate: string; transcript: string }) => 'SUMMARY'),
  orgRow: { data: { name: 'Test HOA' } as { name: string } | null, error: null as { code: string; message: string } | null },
  orgQuery: [] as Array<[string, unknown]>,
}))

const ORG = { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 }

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => (h.role === null ? null : { role: h.role, org: ORG })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const q = {
      select: (cols: string) => (h.orgQuery.push(['select', cols]), q),
      eq: (col: string, v: unknown) => (h.orgQuery.push([`eq:${col}`, v]), q),
      maybeSingle: async () => h.orgRow,
    }
    return {
      auth: { getUser: async () => ({ data: { user: h.signedIn ? { id: 'user-1' } : null } }) },
      from: (t: string) => (h.orgQuery.push(['from', t]), q),
    }
  }),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@homeowner-portal/ai', () => ({ summarizeMeeting: h.summarize }))

import { POST } from './route'

const TRANSCRIPT = 'The board met and discussed the pool, the budget and the landscaping contract renewal.'

function post(body: unknown, raw = false): Request {
  return new Request('http://x/api/ai/meeting-summary', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

beforeEach(() => {
  h.role = 'board'
  h.signedIn = true
  h.summarize.mockReset()
  h.summarize.mockImplementation(async () => 'SUMMARY')
  h.orgRow = { data: { name: 'Test HOA' }, error: null }
  h.orgQuery = []
})

describe('POST /api/ai/meeting-summary', () => {
  it('returns the summary to a board member', async () => {
    const res = await POST(post({ meetingDate: '2026-10-01', transcript: TRANSCRIPT }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ summary: 'SUMMARY' })
    expect(h.summarize).toHaveBeenCalledWith({ hoaName: 'Test HOA', meetingDate: '2026-10-01', transcript: TRANSCRIPT })
    // The org name is read by the gate's org id, not re-resolved from the cookie.
    expect(h.orgQuery).toEqual([
      ['from', 'orgs'],
      ['select', 'name'],
      ['eq:id', ORG.id],
    ])
  })

  it('refuses a resident with 403 before reading the body (no schema leak)', async () => {
    h.role = 'resident'
    const res = await POST(post('not json', true))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('forbidden')
    expect(typeof body.error.message).toBe('string')
    expect(h.summarize).not.toHaveBeenCalled()
  })

  it('answers a signed-out caller 401 with the envelope', async () => {
    h.role = null
    h.signedIn = false
    const res = await POST(post({ meetingDate: '2026-10-01', transcript: TRANSCRIPT }))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('unauthenticated')
  })

  it('answers a signed-in user with no org 403 no_org', async () => {
    h.role = null
    const res = await POST(post({ meetingDate: '2026-10-01', transcript: TRANSCRIPT }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('forbidden')
    expect(body.error.reason).toBe('no_org')
  })

  it('answers bad JSON with 400 invalid_json', async () => {
    const res = await POST(post('{nope', true))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_json')
  })

  it('answers a schema miss with 400 validation_failed and field issues', async () => {
    const res = await POST(post({ meetingDate: '2026-10-01', transcript: 'too short' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'transcript' })]))
  })

  it('refuses a date that is not a real calendar date (C-11)', async () => {
    const res = await POST(post({ meetingDate: '2026-02-30', transcript: TRANSCRIPT }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.issues[0].path).toBe('meetingDate')
  })

  it('answers a transcript over MAX_DOCUMENT_TEXT but under the body cap with 413, not 400 (R-17, RC-1)', async () => {
    const res = await POST(post({ meetingDate: '2026-10-01', transcript: 'x'.repeat(500_001) }))
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.error.code).toBe('payload_too_large')
    expect(body.error.reason).toBe('transcript_too_long')
    expect(body.error.maxLength).toBe(500_000)
    expect(body.error.maxBytes).toBeGreaterThan(0)
    expect(typeof body.error.message).toBe('string')
    expect(h.summarize).not.toHaveBeenCalled()
  })

  it('accepts a transcript of exactly MAX_DOCUMENT_TEXT characters', async () => {
    const res = await POST(post({ meetingDate: '2026-10-01', transcript: 'x'.repeat(500_000) }))
    expect(res.status).toBe(200)
  })

  it('answers a non-string transcript with 400 validation_failed, not 413', async () => {
    const res = await POST(post({ meetingDate: '2026-10-01', transcript: 42 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.issues[0].path).toBe('transcript')
  })

  it('answers a body over the JSON cap with 413', async () => {
    const res = await POST(post({ meetingDate: '2026-10-01', transcript: 'x'.repeat(1_100_000) }))
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.error.code).toBe('payload_too_large')
    expect(body.error.maxBytes).toBeGreaterThan(0)
    expect(h.summarize).not.toHaveBeenCalled()
  })

  it('maps a provider failure to 503 upstream_unavailable with no raw text', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.summarize.mockImplementation(async () => {
      throw new Error('groq: 401 invalid api key sk-secret-123')
    })
    const res = await POST(post({ meetingDate: '2026-10-01', transcript: TRANSCRIPT }))
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(text).not.toContain('sk-secret')
    expect(text).not.toContain('groq')
    expect(JSON.parse(text).error.code).toBe('upstream_unavailable')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('sk-secret')
    spy.mockRestore()
  })

  it('maps an org-name read failure to the generic 500 with no raw text', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.orgRow = { data: null, error: { code: '42501', message: 'permission denied for table orgs' } }
    const res = await POST(post({ meetingDate: '2026-10-01', transcript: TRANSCRIPT }))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('permission denied')
    expect(JSON.parse(text).error.code).toBe('internal')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('permission denied')
    expect(h.summarize).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('maps a missing org row (gate passed, row not visible) to the generic 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.orgRow = { data: null, error: null }
    const res = await POST(post({ meetingDate: '2026-10-01', transcript: TRANSCRIPT }))
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe('internal')
    expect(h.summarize).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
