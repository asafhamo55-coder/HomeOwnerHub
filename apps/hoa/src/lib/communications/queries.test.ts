import { beforeEach, describe, expect, it, vi } from 'vitest'

type Resp = { data: unknown; error: { code: string; message: string } | null }
const h = vi.hoisted(() => ({ resp: null as unknown }))

// Any chained call returns the builder; awaiting it (or maybeSingle) resolves the canned response.
function fakeDb() {
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (res: (r: unknown) => unknown) => Promise.resolve(h.resp).then(res)
        if (prop === 'maybeSingle') return () => Promise.resolve(h.resp)
        return () => builder
      },
    },
  )
  return { from: () => builder }
}

vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => fakeDb() }))
vi.mock('@homeowner-portal/observability/report', () => ({ reportError: vi.fn() }))

import { getCommunication, listTemplates } from './queries'

const bad: Resp = { data: null, error: { code: '42501', message: 'denied' } }
const row = {
  id: 'c1', category: 'general', subject: 'Hi', status: 'sent', channels: ['email'], audience_summary: null,
  scheduled_for: null, sent_at: null, created_at: '2026-01-01', body_html: '<p>x</p>', body_text: null,
  audience_definition: null, related_resource: null, ai_generated: false, template: null, recipients: [], replies: [],
}

describe('getCommunication', () => {
  beforeEach(() => vi.clearAllMocks())
  it('success returns the communication', async () => {
    h.resp = { data: row, error: null }
    const r = await getCommunication('a', 'c1')
    expect(r.ok && r.communication.id).toBe('c1')
  })
  it('a real miss is not_found', async () => {
    h.resp = { data: null, error: null }
    expect(await getCommunication('a', 'c1')).toEqual({ ok: false, reason: 'not_found' })
  })
  it('a failed read is error', async () => {
    h.resp = bad
    expect(await getCommunication('a', 'c1')).toEqual({ ok: false, reason: 'error' })
  })
})

describe('listTemplates', () => {
  beforeEach(() => vi.clearAllMocks())
  it('success returns rows', async () => {
    h.resp = { data: [{ id: 't1' }], error: null }
    expect(await listTemplates('o', 'a')).toEqual({ ok: true, templates: [{ id: 't1' }] })
  })
  it('a genuinely empty list is ok and empty', async () => {
    h.resp = { data: [], error: null }
    expect(await listTemplates('o', 'a')).toEqual({ ok: true, templates: [] })
  })
  it('a failed read is not an empty list', async () => {
    h.resp = bad
    expect(await listTemplates('o', 'a')).toEqual({ ok: false })
  })
})
