import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, type Recorded } from './test-utils/fake-supabase'

const h = vi.hoisted(() => ({
  failing: new Set<string>(),
  tickets: [] as { id: string; status: string }[],
  messages: [] as { id: string; ticket_id: string; author_role: string; internal: boolean; created_at: string }[],
  client: null as unknown,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireBoardOrAdmin: vi.fn(async () => ({ org: { id: 'org1' } })) }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => null) }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => h.client) }))
vi.mock('@/lib/resident-notify/notify', () => ({ notifyResidentAfterResponse: vi.fn() }))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: vi.fn(async () => 'UTC') }))
vi.mock('@homeowner-portal/observability/report', () => ({ reportError: vi.fn() }))

import { listTicketsForBoard } from './tickets'

const arg = (q: Recorded, method: string, col: string) =>
  q.ops.find(([m, c]) => m === method && c === col)?.[2] as unknown[] | undefined

// Honors the filters that matter (status, id, internal, ticket_id, range) so
// the test exercises how the code composes its reads, not canned answers.
function respond(q: Recorded) {
  if (h.failing.has(q.table)) return { data: null, error: { code: '42501', message: 'denied' } }
  const range = q.ops.find(([m]) => m === 'range')
  const page = <T,>(rows: T[]) =>
    range ? rows.slice(range[1] as number, (range[2] as number) + 1) : rows
  if (q.table === 'tickets') {
    const statuses = arg(q, 'in', 'status')
    const ids = arg(q, 'in', 'id')
    let rows = h.tickets
    if (statuses) rows = rows.filter((t) => statuses.includes(t.status))
    if (ids) rows = rows.filter((t) => ids.includes(t.id))
    return { data: page(rows), error: null, count: rows.length }
  }
  if (q.table === 'ticket_messages') {
    const ids = arg(q, 'in', 'ticket_id')
    const rows = h.messages.filter((m) => !m.internal && (!ids || ids.includes(m.ticket_id)))
    return { data: page(rows), error: null }
  }
  return { data: [], error: null }
}

let n = 0
const msg = (ticket_id: string, author_role: string, created_at: string, internal = false) => ({
  id: `m${++n}`, ticket_id, author_role, internal, created_at,
})

beforeEach(() => {
  h.failing.clear()
  h.tickets = []
  h.messages = []
  h.client = fakeSupabase(respond).client
})

describe('listTicketsForBoard reply=resident', () => {
  it('keeps only open or in-progress tickets whose latest non-internal message is the resident', async () => {
    h.tickets = [
      { id: 'resident-open', status: 'open' },
      { id: 'resident-progress', status: 'in_progress' },
      { id: 'board-last', status: 'open' },
      { id: 'internal-last', status: 'open' },
      { id: 'no-messages', status: 'open' },
    ]
    h.messages = [
      msg('resident-open', 'board', '2026-01-01'),
      msg('resident-open', 'resident', '2026-01-02'),
      msg('resident-progress', 'resident', '2026-01-02'),
      msg('board-last', 'resident', '2026-01-01'),
      msg('board-last', 'board', '2026-01-02'),
      // a newer internal board note must not hide the resident's reply
      msg('internal-last', 'resident', '2026-01-01'),
      msg('internal-last', 'board', '2026-01-03', true),
    ]
    const r = await listTicketsForBoard({ page: 1, pageSize: 50, reply: 'resident' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rows.map((x) => x.id).sort()).toEqual(['internal-last', 'resident-open', 'resident-progress'])
    expect(r.rows.every((x) => x.reply_state === 'resident')).toBe(true)
  })

  it('excludes closed tickets even when the resident spoke last', async () => {
    h.tickets = [
      { id: 'closed-one', status: 'closed' },
      { id: 'open-one', status: 'open' },
    ]
    h.messages = [msg('closed-one', 'resident', '2026-01-02'), msg('open-one', 'resident', '2026-01-02')]
    const r = await listTicketsForBoard({ page: 1, pageSize: 50, reply: 'resident' })
    expect(r.ok && r.rows.map((x) => x.id)).toEqual(['open-one'])
  })

  it('returns an empty list, not everything, when nobody has a resident reply', async () => {
    h.tickets = [{ id: 'a', status: 'open' }]
    h.messages = [msg('a', 'board', '2026-01-02')]
    const r = await listTicketsForBoard({ page: 1, pageSize: 50, reply: 'resident' })
    expect(r.ok && r.rows).toEqual([])
  })

  it('fails rather than returning an unfiltered list when the message read fails', async () => {
    h.tickets = [{ id: 'a', status: 'open' }]
    h.messages = [msg('a', 'resident', '2026-01-02')]
    h.failing.add('ticket_messages')
    expect(await listTicketsForBoard({ page: 1, pageSize: 50, reply: 'resident' })).toEqual({ ok: false })
  })
})

describe('listTicketsForBoard without the reply filter', () => {
  it('still returns tickets, with no chips, when the message read fails', async () => {
    h.tickets = [
      { id: 'a', status: 'open' },
      { id: 'b', status: 'closed' },
    ]
    h.messages = [msg('a', 'resident', '2026-01-02')]
    h.failing.add('ticket_messages')
    const r = await listTicketsForBoard({ page: 1, pageSize: 50 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.rows.map((x) => x.id)).toEqual(['a', 'b'])
    expect(r.rows.every((x) => x.reply_state === null)).toBe(true)
  })
})
