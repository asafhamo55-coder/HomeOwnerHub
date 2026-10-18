import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  role: 'resident' as 'admin' | 'board' | 'resident' | null,
  user: { id: 'user-1' } as { id: string } | null,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Secret Org Name', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } })),
}))

const { POST } = await import('./route')

const req = (body: unknown, raw = false) =>
  new Request('http://localhost/api/help/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })

let lines: string[] = []
beforeEach(() => {
  h.role = 'resident'
  h.user = { id: 'user-1' }
  lines = []
  vi.spyOn(console, 'info').mockImplementation((l: unknown) => void lines.push(String(l)))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('POST /api/help/event', () => {
  it('401 when signed out', async () => {
    h.role = null
    h.user = null
    expect((await POST(req({ event: 'help.search', resultCount: 1, queryLengthBucket: '1-10' }))).status).toBe(401)
    expect(lines).toEqual([])
  })

  it('logs one allowlisted line per event; the role comes from the gate, not the client', async () => {
    const res = await POST(req({ event: 'help.article_view', articleId: 'resident-portal-basics', source: 'drawer', role: 'admin' }))
    expect(res.status).toBe(204)
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toEqual({ type: 'help_event', event: 'help.article_view', articleId: 'resident-portal-basics', source: 'drawer', role: 'resident' })
  })

  it('strips any field outside the allowlist (question text, emails, paths, names)', async () => {
    await POST(
      req({
        event: 'help.search',
        resultCount: 3,
        queryLengthBucket: '11-30',
        query: 'how do I evict jane.doe@example.test',
        path: '/properties/7b1e2c90',
        orgName: 'Secret Org Name',
      }),
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toMatch(/evict|jane|7b1e2c90|Secret Org/)
    expect(Object.keys(JSON.parse(lines[0]!)).sort()).toEqual(['event', 'queryLengthBucket', 'resultCount', 'role', 'type'])
  })

  it('refuses a concrete path, an unknown article, an unknown event and help.ask from the client', async () => {
    for (const bad of [
      { event: 'help.drawer_open', routeTemplate: '/properties/7b1e2c90', matchedCount: 1 },
      { event: 'help.article_view', articleId: 'jane.doe@example.test', source: 'drawer' },
      { event: 'help.anything', note: 'hi' },
      { event: 'help.ask', kind: 'answer', citationCount: 1 },
      { event: 'help.search', resultCount: 1, queryLengthBucket: 'how do I evict my neighbour' },
    ]) {
      const res = await POST(req(bad))
      expect(res.status, JSON.stringify(bad)).toBe(400)
    }
    expect(lines).toEqual([])
  })

  it('accepts a known route template for drawer opens', async () => {
    expect((await POST(req({ event: 'help.drawer_open', routeTemplate: '/violations/[id]', matchedCount: 1 }))).status).toBe(204)
    expect((await POST(req({ event: 'help.drawer_open', routeTemplate: null, matchedCount: 0 }))).status).toBe(204)
  })

  it('400 on bad JSON, 413 on an oversized body', async () => {
    expect((await POST(req('{', true))).status).toBe(400)
    expect((await POST(req({ event: 'help.search', resultCount: 1, queryLengthBucket: '1-10', pad: 'x'.repeat(4000) }))).status).toBe(413)
  })
})
