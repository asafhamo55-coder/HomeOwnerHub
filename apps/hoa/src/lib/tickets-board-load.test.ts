import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, type Recorded } from './test-utils/fake-supabase'

const h = vi.hoisted(() => ({ failing: new Set<string>(), data: {} as Record<string, unknown>, client: null as unknown }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireBoardOrAdmin: vi.fn(async () => ({})) }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => null) }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => h.client) }))
vi.mock('@/lib/resident-notify/notify', () => ({ notifyResidentAfterResponse: vi.fn() }))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: vi.fn() }))
vi.mock('@homeowner-portal/observability/report', () => ({ reportError: vi.fn() }))

import { getTicketForBoard } from './tickets'

function respond(q: Recorded) {
  if (h.failing.has(q.table)) return { data: null, error: { code: '42501', message: 'denied' } }
  return { data: h.data[q.table] ?? null, error: null }
}

beforeEach(() => {
  h.failing.clear()
  h.data = {}
  h.client = fakeSupabase(respond).client
})

const ticket = {
  id: 't1', unit_id: 'u1', submitted_by: 'p1', category: 'other', subject: 's', description: 'd',
  status: 'open', priority: 'normal', created_at: '2026-01-01', closed_at: null, closed_by: null,
  unit: { unit_number: '4' }, submitter: { full_name: 'R', email: 'r@x.test' },
}
const msgs = [
  { id: 'm1', author_id: 'a', author_role: 'board', body: 'hi', internal: true, created_at: '2026-01-02', author: { full_name: 'B' } },
]

describe('getTicketForBoard', () => {
  it('success is unchanged', async () => {
    h.data = { tickets: ticket, ticket_messages: msgs }
    const r = await getTicketForBoard('t1')
    expect(r).toMatchObject({ ok: true, messagesFailed: false })
    if (r.ok) {
      expect(r.ticket.unit_number).toBe('4')
      expect(r.ticket.submitter_name).toBe('R')
      expect(r.ticket.messages).toEqual([
        { id: 'm1', author_id: 'a', author_role: 'board', author_name: 'B', body: 'hi', internal: true, created_at: '2026-01-02' },
      ])
    }
  })
  it('a real miss is not_found', async () => {
    expect(await getTicketForBoard('t1')).toEqual({ ok: false, reason: 'not_found' })
  })
  it('a failed ticket read is error, not not_found', async () => {
    h.failing.add('tickets')
    expect(await getTicketForBoard('t1')).toEqual({ ok: false, reason: 'error' })
  })
  it('a failed messages read keeps the ticket and flags it', async () => {
    h.data = { tickets: ticket }
    h.failing.add('ticket_messages')
    const r = await getTicketForBoard('t1')
    expect(r).toMatchObject({ ok: true, messagesFailed: true })
    if (r.ok) expect(r.ticket.messages).toEqual([])
  })
})
