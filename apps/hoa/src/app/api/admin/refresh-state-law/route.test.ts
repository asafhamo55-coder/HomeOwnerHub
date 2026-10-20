import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────

let user: { id: string } | null = { id: 'user-1' }
let platformAdmin = true

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
  })),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => platformAdmin) }))

const send = vi.fn(async (_e: unknown) => ({ ids: ['evt-1'] }))
vi.mock('@homeowner-portal/jobs', () => ({ inngest: { send: (e: unknown) => send(e) } }))

interface Row {
  id: string
  state: string
  code_citation: string
  title: string
  category: string | null
  fetched_at: string
  last_checked_at: string | null
  content_hash: string | null
  source_name: string | null
  source_url: string | null
  superseded_at: string | null
}

let rows: Row[] = []
/** Which query (count | stale | page) errors. */
let failing: 'count' | 'stale' | 'page' | null = null
const ranges: Array<[number, number]> = []
let adminClientCalls = 0

const SECRET_PG_TEXT = 'relation "state_statutes" column secret_col violates constraint'

/** A minimal PostgREST builder over `rows`: eq, or(is.null / lte), order, range, head counts. */
function builder() {
  let head = false
  let filtered = rows
  let staleQuery = false
  const b = {
    select(_cols: string, opts?: { count?: string; head?: boolean }) {
      head = !!opts?.head
      return b
    },
    eq(col: string, val: unknown) {
      filtered = filtered.filter((r) => (r as unknown as Record<string, unknown>)[col] === val)
      return b
    },
    or(expr: string) {
      staleQuery = true
      const m = /^last_checked_at\.is\.null,last_checked_at\.lte\.(.+)$/.exec(expr)
      if (!m) throw new Error(`unexpected or(): ${expr}`)
      const cutoff = new Date(m[1]!).getTime()
      filtered = filtered.filter((r) => r.last_checked_at === null || new Date(r.last_checked_at).getTime() <= cutoff)
      return b
    },
    order() {
      return b
    },
    async range(from: number, to: number) {
      ranges.push([from, to])
      if (failing === 'page') return { data: null, error: { code: '42P01', message: SECRET_PG_TEXT } }
      // PostgREST's silent cap
      return { data: filtered.slice(from, Math.min(to + 1, from + 1000)), error: null }
    },
    then(resolve: (v: unknown) => void) {
      if (!head) throw new Error('awaited a non-head query')
      const kind = staleQuery ? 'stale' : 'count'
      if (failing === kind) resolve({ count: null, error: { code: '42P01', message: SECRET_PG_TEXT } })
      else resolve({ count: filtered.length, error: null })
    },
  }
  return b
}

vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => {
    adminClientCalls++
    return { from: (_t: string) => builder() }
  },
}))

const { GET, POST } = await import('./route')

const DAY = 24 * 60 * 60 * 1000
function seed(n: number, state = 'FL', ageDays: (i: number) => number | null = () => 1): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const age = ageDays(i)
    return {
      id: `id-${state}-${String(i).padStart(5, '0')}`,
      state,
      code_citation: `${state} 720.${String(i).padStart(5, '0')}`,
      title: `Section ${i}`,
      category: null,
      fetched_at: '2026-01-01T00:00:00+00:00',
      last_checked_at: age === null ? null : new Date(Date.now() - age * DAY - 60_000).toISOString(),
      content_hash: 'abc',
      source_name: 'Florida Legislature',
      source_url: 'https://www.leg.state.fl.us/',
      superseded_at: null,
    }
  })
}

function get(qs: string) {
  return GET(new Request(`http://localhost/api/admin/refresh-state-law${qs}`))
}
function post(body: string | undefined, headers: Record<string, string> = { 'content-type': 'application/json' }) {
  return POST(new Request('http://localhost/api/admin/refresh-state-law', { method: 'POST', body, headers }))
}

async function json(res: Response): Promise<any> {
  return res.json()
}

beforeEach(() => {
  user = { id: 'user-1' }
  platformAdmin = true
  rows = []
  failing = null
  ranges.length = 0
  adminClientCalls = 0
  send.mockClear()
  send.mockImplementation(async () => ({ ids: ['evt-1'] }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ─── GET ─────────────────────────────────────────────────────────────

describe('GET /api/admin/refresh-state-law', () => {
  it('401 envelope when signed out, before any service-role read', async () => {
    user = null
    const res = await get('?state=FL')
    expect(res.status).toBe(401)
    expect((await json(res)).error.code).toBe('unauthenticated')
    expect(adminClientCalls).toBe(0)
  })

  it('403 envelope for a signed-in non-platform-admin, before validation or reads', async () => {
    platformAdmin = false
    const res = await get('?state=nope')
    expect(res.status).toBe(403)
    const b = await json(res)
    expect(b.error.code).toBe('forbidden')
    expect(typeof b.error.message).toBe('string')
    expect(adminClientCalls).toBe(0)
  })

  it('400 validation_failed with issues for an unsupported state', async () => {
    const res = await get('?state=NY')
    expect(res.status).toBe(400)
    const b = await json(res)
    expect(b.error.code).toBe('validation_failed')
    expect(b.error.issues).toEqual([expect.objectContaining({ path: 'state' })])
    expect(adminClientCalls).toBe(0)
  })

  it('400 validation_failed for a limit over 100 or a bad offset', async () => {
    for (const qs of ['?state=FL&limit=101', '?state=FL&limit=0', '?state=FL&offset=-1', '?state=FL&offset=abc']) {
      const res = await get(qs)
      expect(res.status, qs).toBe(400)
      expect((await json(res)).error.code).toBe('validation_failed')
    }
  })

  it('413 payload_too_large (not 400) for an over-long query string', async () => {
    const res = await get(`?state=${'F'.repeat(5000)}`)
    expect(res.status).toBe(413)
    const b = await json(res)
    expect(b.error.code).toBe('payload_too_large')
    expect(b.error.maxBytes).toBe(1024)
  })

  it('returns one explicit page (default limit 100) with camelCase fields and counts from count queries', async () => {
    rows = seed(1205, 'FL', (i) => (i % 5 === 0 ? 45 : i % 7 === 0 ? null : 2))
    const res = await get('?state=fl')
    expect(res.status).toBe(200)
    const b = await json(res)
    expect(b.error).toBeUndefined()
    expect(b.state).toBe('FL')
    expect(b.limit).toBe(100)
    expect(b.offset).toBe(0)
    expect(b.statutes).toHaveLength(100)
    expect(ranges).toEqual([[0, 99]])
    // Totals cover the whole state, past PostgREST's 1000-row cap — not the page length.
    expect(b.total).toBe(1205)
    const expectedStale = rows.filter((_, i) => i % 5 === 0 || i % 7 === 0).length
    expect(b.staleCount).toBe(expectedStale)
    expect(b.nextOffset).toBe(100)
    expect(b.refreshable).toBe(true)

    const first = b.statutes[0]
    expect(Object.keys(first).sort()).toEqual(
      [
        'ageDays',
        'category',
        'codeCitation',
        'contentHash',
        'fetchedAt',
        'id',
        'lastCheckedAt',
        'sourceName',
        'sourceUrl',
        'stale',
        'supersededAt',
        'title',
      ].sort(),
    )
    expect(first.ageDays).toBe(45)
    expect(first.stale).toBe(true)
    expect(first.fetchedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(b.statutes[1].stale).toBe(false)
  })

  it('pages with limit/offset to the last page, where nextOffset is null', async () => {
    rows = seed(1205)
    const res = await get('?state=FL&limit=50&offset=1200')
    const b = await json(res)
    expect(res.status).toBe(200)
    expect(ranges).toEqual([[1200, 1249]])
    expect(b.statutes).toHaveLength(5)
    expect(b.statutes[0].codeCitation).toBe('FL 720.01200')
    expect(b.total).toBe(1205)
    expect(b.nextOffset).toBeNull()
  })

  it('an offset past the end returns an empty page, not an error', async () => {
    rows = seed(3)
    const b = await json(await get('?state=FL&offset=10'))
    expect(b.statutes).toEqual([])
    expect(b.total).toBe(3)
    expect(b.nextOffset).toBeNull()
  })

  it.each(['count', 'stale', 'page'] as const)('a failing %s query is a generic 500 with no raw DB text', async (which) => {
    rows = seed(3)
    failing = which
    const res = await get('?state=FL')
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('internal')
    expect(text).not.toContain('secret_col')
    expect(text).not.toContain('state_statutes')
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)
    expect(logged).not.toContain('secret_col')
  })
})

// ─── POST ────────────────────────────────────────────────────────────

describe('POST /api/admin/refresh-state-law', () => {
  it('401 when signed out and 403 for a non-platform-admin, before reading the body', async () => {
    user = null
    let res = await post('not json')
    expect(res.status).toBe(401)
    expect((await json(res)).error.code).toBe('unauthenticated')

    user = { id: 'user-1' }
    platformAdmin = false
    res = await post('not json')
    expect(res.status).toBe(403)
    expect((await json(res)).error.code).toBe('forbidden')
    expect(send).not.toHaveBeenCalled()
  })

  it('400 invalid_json for a body that is not JSON (or is empty)', async () => {
    for (const body of ['{oops', undefined]) {
      const res = await post(body)
      expect(res.status).toBe(400)
      expect((await json(res)).error.code).toBe('invalid_json')
    }
    expect(send).not.toHaveBeenCalled()
  })

  it('400 validation_failed with issues for an unsupported state', async () => {
    const res = await post(JSON.stringify({ state: 'NY' }))
    expect(res.status).toBe(400)
    const b = await json(res)
    expect(b.error.code).toBe('validation_failed')
    expect(b.error.issues).toEqual([expect.objectContaining({ path: 'state' })])
  })

  it('413 payload_too_large (not 400) for an oversized body or an over-long state', async () => {
    const res = await post(JSON.stringify({ state: 'F'.repeat(5000) }))
    expect(res.status).toBe(413)
    expect((await json(res)).error).toMatchObject({ code: 'payload_too_large', maxBytes: 1024 })
    expect(send).not.toHaveBeenCalled()
  })

  it('422 unprocessable with reason no_official_source for a supported but non-refreshable state', async () => {
    const res = await post(JSON.stringify({ state: 'GA' }))
    expect(res.status).toBe(422)
    const b = await json(res)
    expect(b.error).toMatchObject({ code: 'unprocessable', reason: 'no_official_source', refreshable: ['FL', 'CA', 'TX'] })
    expect(send).not.toHaveBeenCalled()
  })

  it('queues the refresh job for FL with a 202 and no ok/error keys', async () => {
    const res = await post(JSON.stringify({ state: 'fl' }))
    expect(res.status).toBe(202)
    expect(await json(res)).toEqual({ state: 'FL', queued: 'law/refresh.requested' })
    expect(send).toHaveBeenCalledWith({ name: 'law/refresh.requested', data: { state: 'FL' } })
  })

  it('CA and TX are refreshable too (official-source adapters)', async () => {
    for (const state of ['CA', 'TX']) {
      const res = await post(JSON.stringify({ state }))
      expect(res.status).toBe(202)
      expect(send).toHaveBeenCalledWith({ name: 'law/refresh.requested', data: { state } })
    }
  })

  it('an Inngest failure is 503 upstream_unavailable with no raw provider text', async () => {
    send.mockImplementation(async () => {
      throw new Error('inngest: event key sk-secret-123 rejected')
    })
    const res = await post(JSON.stringify({ state: 'FL' }))
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('upstream_unavailable')
    expect(text).not.toContain('sk-secret')
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)
    expect(logged).not.toContain('sk-secret')
  })
})
