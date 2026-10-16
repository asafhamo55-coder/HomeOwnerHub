import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────

/** What the `orgs` probe query resolves to. */
let dbResult: { error: { code?: string; message: string } | null } = { error: null }
let dbThrows: Error | null = null

vi.mock('@homeowner-portal/db', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  createAdminClient: vi.fn(() => {
    if (dbThrows) throw dbThrows
    return {
      from: () => ({
        select: () => ({
          limit: async () => dbResult,
        }),
      }),
    }
  }),
}))

const embedTexts = vi.fn(async (_: string[]) => [new Array(1536).fill(0)])

vi.mock('@homeowner-portal/ai', () => ({
  resolveModel: () => 'chat-model',
  resolveFastModel: () => 'fast-model',
  resolveVisionModel: () => 'vision-model',
  resolveCloudModel: () => 'cloud-model',
  embedTexts: (texts: string[]) => embedTexts(texts),
}))

const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))

import { GET } from './route'

const LEAK = 'relation "orgs" does not exist for jane@example.com'

const req = (opts: { auth?: string; query?: string } = {}) =>
  new Request(`https://hoa.test/api/health${opts.query ?? ''}`, {
    headers: opts.auth ? { authorization: opts.auth } : {},
  })

beforeEach(() => {
  dbResult = { error: null }
  dbThrows = null
  embedTexts.mockClear()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
  vi.stubEnv('AI_BASE_URL', 'https://ai.test/v1')
  vi.stubEnv('AI_API_KEY', 'ai-key')
  vi.stubEnv('OPENAI_API_KEY', 'openai-key')
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc1234')
  vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'claude/some-branch')
  vi.stubEnv('EMBEDDING_PROBE_KEY', 'probe-secret')
  vi.stubEnv('CRON_SECRET', 'cron-secret')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('GET /api/health — public (no Authorization header)', () => {
  it('returns exactly { ok, app, version } when healthy', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, app: 'hoa', version: 'abc1234' })
  })

  it('makes no outbound (billed) call on an unauthenticated poll', async () => {
    await GET(req({ query: '?probe=embedding' }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(embedTexts).not.toHaveBeenCalled()
  })

  it('no longer accepts a ?key= query secret (falls back to the public body)', async () => {
    const res = await GET(req({ query: '?probe=embedding&key=probe-secret' }))
    expect(embedTexts).not.toHaveBeenCalled()
    expect(Object.keys(await res.json()).sort()).toEqual(['app', 'ok', 'version'])
  })

  it('an unhealthy DB is a 503 envelope with no raw text, branch or env booleans', async () => {
    dbResult = { error: { code: '42P01', message: LEAK } }
    const res = await GET(req())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('upstream_unavailable')
    expect(body.error.app).toBe('hoa')
    expect(body.error.version).toBe('abc1234')
    const text = JSON.stringify(body)
    expect(text).not.toContain('jane@example.com')
    expect(text).not.toContain('claude/some-branch')
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(text).not.toContain('42P01')
    expect(body.ok).toBeUndefined()
  })

  it('a missing required env var is 503 not_configured (RC-1) that does not say which', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const res = await GET(req())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('not_configured')
    expect(body.error.app).toBe('hoa')
    expect(body.error.version).toBe('abc1234')
    expect(Object.keys(body.error).sort()).toEqual(['app', 'code', 'message', 'version'])
    const text = JSON.stringify(body)
    for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE', 'ANON_KEY', 'claude/some-branch']) {
      expect(text).not.toContain(name)
    }
  })

  it('a missing required env var is reported as not_configured even when the DB probe also fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    dbThrows = new Error(LEAK)
    const res = await GET(req())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('not_configured')
    expect(JSON.stringify(body)).not.toContain('jane@example.com')
  })

  it('a thrown DB client error does not leak its message', async () => {
    dbThrows = new Error(LEAK)
    const res = await GET(req())
    expect(res.status).toBe(503)
    expect(JSON.stringify(await res.json())).not.toContain('jane@example.com')
  })
})

describe('GET /api/health — details (Bearer EMBEDDING_PROBE_KEY)', () => {
  it('rejects a wrong bearer with the 401 envelope', async () => {
    const res = await GET(req({ auth: 'Bearer nope' }))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('unauthenticated')
  })

  it('does not accept CRON_SECRET (one env var per purpose)', async () => {
    const res = await GET(req({ auth: 'Bearer cron-secret' }))
    expect(res.status).toBe(401)
  })

  it('fails closed with 503 not_configured when the probe key is unset', async () => {
    vi.stubEnv('EMBEDDING_PROBE_KEY', '')
    const res = await GET(req({ auth: 'Bearer probe-secret' }))
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('not_configured')
  })

  it('returns camelCase details with the right bearer', async () => {
    const res = await GET(req({ auth: 'Bearer probe-secret' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      ok: true,
      app: 'hoa',
      version: 'abc1234',
      branch: 'claude/some-branch',
      supabaseUrl: 'https://example.supabase.co',
      probes: { db: { ok: true }, ai: { ok: true } },
      models: { chat: 'chat-model', fast: 'fast-model', cloud: 'cloud-model', vision: 'vision-model' },
    })
    expect(body.supabase_url).toBeUndefined()
    expect(body.env.SUPABASE_SERVICE_ROLE_KEY).toBe(true)
    expect(typeof body.timestamp).toBe('string')
    expect(embedTexts).not.toHaveBeenCalled()
  })

  it('runs the billed embedding probe only when also asked for', async () => {
    const res = await GET(req({ auth: 'Bearer probe-secret', query: '?probe=embedding' }))
    const body = await res.json()
    expect(embedTexts).toHaveBeenCalledTimes(1)
    expect(body.probes.embedding).toEqual({ ok: true, detail: 'dim=1536' })
  })

  it('a missing required env var is 503 not_configured (RC-1), with the details', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const res = await GET(req({ auth: 'Bearer probe-secret' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('not_configured')
    expect(body.error.reason).toBe('missing_env')
    expect(body.error.env.SUPABASE_SERVICE_ROLE_KEY).toBe(false)
  })

  it('an unreachable DB with env present stays 503 upstream_unavailable', async () => {
    dbResult = { error: { code: '08006', message: LEAK } }
    const res = await GET(req({ auth: 'Bearer probe-secret' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('upstream_unavailable')
    expect(body.error.reason).toBe('db_unreachable')
  })

  it('probe details carry codes, never raw DB / provider text', async () => {
    dbResult = { error: { code: '42P01', message: LEAK } }
    fetchMock.mockImplementationOnce(async () => new Response(LEAK, { status: 401, statusText: LEAK }))
    const providerErr = Object.assign(new Error(LEAK), { status: 429 })
    embedTexts.mockImplementationOnce(async () => {
      throw providerErr
    })
    const res = await GET(req({ auth: 'Bearer probe-secret', query: '?probe=embedding' }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('upstream_unavailable')
    expect(body.error.probes.db).toEqual({ ok: false, detail: 'code=42P01' })
    expect(body.error.probes.ai).toEqual({ ok: false, detail: 'status=401' })
    expect(body.error.probes.embedding.detail).toContain('status=429')
    expect(JSON.stringify(body)).not.toContain('jane@example.com')
  })
})
