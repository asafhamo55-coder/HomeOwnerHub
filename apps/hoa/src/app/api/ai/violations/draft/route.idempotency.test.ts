import { beforeEach, describe, expect, it, vi } from 'vitest'

// POST /api/ai/violations/draft — Idempotency-Key. Inspection mode's offline
// queue retries a draft whose response was lost; the retry must hand back
// the draft that already exists rather than run W3 (and the model) again.
// No migration: the key rides in ai_runs.input, and the route looks for a
// non-failed W3 run in the caller's org with that key from the last 7 days.
//
// The fake ai_runs table below is shared by the route's lookup and the
// mocked W3 execute (which "persists" its input the way defineWorkflow does),
// so a retry really does find the first run.

interface Run {
  id: string
  organization_id: string
  workflow_id: string
  status: string
  created_at: string
  input: Record<string, unknown>
  output: Record<string, unknown>
}

const h = vi.hoisted(() => ({
  org: 'org-1',
  runs: [] as Run[],
  lookupError: null as null | { code: string },
  aiRunFilters: [] as Array<Array<[string, string, unknown]>>,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => ({
    role: 'board',
    org: { id: h.org, name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 },
  })),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))

function field(run: Run, col: string): unknown {
  if (col.startsWith('input->>')) return run.input[col.slice('input->>'.length)]
  return (run as unknown as Record<string, unknown>)[col]
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-1' } } })) },
    from: vi.fn((table: string) => {
      const filters: Array<[string, string, unknown]> = []
      const q: Record<string, unknown> = {}
      q.select = vi.fn(() => q)
      q.eq = vi.fn((c: string, v: unknown) => (filters.push(['eq', c, v]), q))
      q.neq = vi.fn((c: string, v: unknown) => (filters.push(['neq', c, v]), q))
      q.gte = vi.fn((c: string, v: unknown) => (filters.push(['gte', c, v]), q))
      q.order = vi.fn(() => q)
      q.limit = vi.fn(() => q)
      q.maybeSingle = vi.fn(async () => {
        if (table !== 'ai_runs') {
          // requireOrgOwned: every unit belongs to the caller's org.
          const id = filters.find(([, c]) => c === 'id')?.[2]
          return { data: { id }, error: null }
        }
        h.aiRunFilters.push(filters)
        if (h.lookupError) return { data: null, error: h.lookupError }
        const hit = h.runs
          .filter((r) =>
            filters.every(([op, c, v]) => {
              const f = field(r, c)
              if (op === 'eq') return f === v
              if (op === 'neq') return f !== v
              return String(f) >= String(v)
            }),
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
        return { data: hit ?? null, error: null }
      })
      return q
    }),
  })),
}))

const execute = vi.hoisted(() => vi.fn())
vi.mock('@homeowner-portal/workflows/W3', () => ({ violationInspector: { execute } }))

import { POST } from './route'

const UNIT = '11111111-1111-4111-8111-111111111111'
const GOOD = { unitId: UNIT, violationType: 'parking', description: 'Car parked on the lawn for a week.' }
const KEY = 'inspect-6b1d4c1e-0b7a-4c55-9a4e-1f0a1b2c3d4e'
const NOW = Date.parse('2026-10-18T12:00:00Z')

function req(body: unknown, key?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (key !== undefined) headers['idempotency-key'] = key
  return new Request('http://x/api/ai/violations/draft', { method: 'POST', headers, body: JSON.stringify(body) })
}

let seq = 0
beforeEach(() => {
  h.org = 'org-1'
  h.runs = []
  h.lookupError = null
  h.aiRunFilters = []
  seq = 0
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  execute.mockReset()
  // Stands in for defineWorkflow: one model call, one ai_runs row holding the parsed input.
  execute.mockImplementation(async (input: Record<string, unknown>, ctx: { organizationId: string }) => {
    const id = `run-${++seq}`
    const output = { notice: `Draft ${seq}`, recommendedFineAmountCents: 2500 }
    h.runs.push({
      id,
      organization_id: ctx.organizationId,
      workflow_id: 'W3',
      status: 'pending_human_approval',
      created_at: new Date().toISOString(),
      input,
      output,
    })
    return { runId: id, output, status: 'pending_human_approval', citations: [] }
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ai/violations/draft — Idempotency-Key', () => {
  it('a retry after a lost response returns the same draft and makes no second model call', async () => {
    const first = await POST(req(GOOD, KEY))
    expect(first.status).toBe(200)
    const firstBody = await first.json()
    // The response is lost; the queue retries with the same key.
    const retry = await POST(req(GOOD, KEY))
    expect(retry.status).toBe(200)
    expect(await retry.json()).toEqual(firstBody)
    expect(firstBody.runId).toBe('run-1')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(h.runs).toHaveLength(1)
  })

  it('stores the key with the run input so the next request can find it', async () => {
    await POST(req(GOOD, KEY))
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: KEY }), { organizationId: 'org-1' })
    const filters = h.aiRunFilters[0]!
    expect(filters).toEqual(
      expect.arrayContaining([
        ['eq', 'organization_id', 'org-1'],
        ['eq', 'workflow_id', 'W3'],
        ['eq', 'input->>idempotencyKey', KEY],
        ['neq', 'status', 'failed'],
        ['gte', 'created_at', new Date(NOW - 7 * 24 * 3600_000).toISOString()],
      ]),
    )
  })

  it('different keys make different drafts', async () => {
    const a = await (await POST(req(GOOD, KEY))).json()
    const b = await (await POST(req(GOOD, `${KEY}-b`))).json()
    expect(a.runId).not.toBe(b.runId)
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('keys are org-scoped: the same key in another org makes its own draft', async () => {
    const a = await (await POST(req(GOOD, KEY))).json()
    h.org = 'org-2'
    const b = await (await POST(req(GOOD, KEY))).json()
    expect(b.runId).not.toBe(a.runId)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute.mock.calls[1]![1]).toEqual({ organizationId: 'org-2' })
  })

  it('a key older than 7 days does not dedupe', async () => {
    await POST(req(GOOD, KEY))
    vi.setSystemTime(NOW + 8 * 24 * 3600_000)
    await POST(req(GOOD, KEY))
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('a failed run with the key does not block a retry', async () => {
    h.runs.push({
      id: 'run-failed',
      organization_id: 'org-1',
      workflow_id: 'W3',
      status: 'failed',
      created_at: new Date(NOW - 60_000).toISOString(),
      input: { ...GOOD, idempotencyKey: KEY },
      output: { _error: 'x' },
    })
    const res = await POST(req(GOOD, KEY))
    expect((await res.json()).runId).toBe('run-1')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('the same key reused for a different home → 409 conflict, no model call', async () => {
    await POST(req(GOOD, KEY))
    const res = await POST(req({ ...GOOD, unitId: '33333333-3333-4333-8333-333333333333' }, KEY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('conflict')
    expect(body.error.reason).toBe('idempotency_key_reused')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('no key → behaves as before (no lookup, every call drafts)', async () => {
    await POST(req(GOOD))
    await POST(req(GOOD))
    expect(execute).toHaveBeenCalledTimes(2)
    expect(h.aiRunFilters).toHaveLength(0)
    expect(execute.mock.calls[0]![0]).not.toHaveProperty('idempotencyKey')
  })

  it('a malformed key → 400 validation_failed before any lookup or model call', async () => {
    for (const bad of ['short', 'x'.repeat(129), 'has spaces in it ok', 'slash/in/the/key']) {
      const res = await POST(req(GOOD, bad))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('validation_failed')
      expect(body.error.issues[0].path).toBe('Idempotency-Key')
    }
    expect(execute).not.toHaveBeenCalled()
    expect(h.aiRunFilters).toHaveLength(0)
  })

  it('a lookup DB error → generic 500, no model call', async () => {
    h.lookupError = { code: '57014' }
    const res = await POST(req(GOOD, KEY))
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe('internal')
    expect(execute).not.toHaveBeenCalled()
  })
})
