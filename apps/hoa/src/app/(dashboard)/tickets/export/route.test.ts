import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DENIED = 'Only board members and admins can make this change.'
let gate: { ok: true; role: 'admin' | 'board'; orgId: string } | { ok: false; error: string } = {
  ok: true,
  role: 'board',
  orgId: 'org-1',
}
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => gate),
}))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: vi.fn(async () => 'America/New_York') }))

interface Ticket {
  id: string
  category: string
  subject: string
  status: string
  priority: string
  created_at: string
  unit: { unit_number: string | null } | null
  submitter: { full_name: string | null } | null
}
let signedIn = true
let tickets: Ticket[] = []
let people: { id: string }[] = []
let units: { id: string }[] = []
const calls: Array<{ table: string; op: string; args: unknown[] }> = []

function builder(table: string) {
  let rng: [number, number] | null = null
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'is', 'order', 'or', 'ilike', 'limit', 'in']) {
    b[op] = (...args: unknown[]) => {
      calls.push({ table, op, args })
      return b
    }
  }
  b.range = (from: number, to: number) => {
    calls.push({ table, op: 'range', args: [from, to] })
    rng = [from, to]
    return b
  }
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    const all: unknown[] = table === 'tickets' ? tickets : table === 'profiles' ? people : units
    const data = rng ? all.slice(rng[0], rng[1] + 1) : all
    return Promise.resolve({ data, error: null }).then(resolve, reject)
  }
  return b
}
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'u' } : null } }) },
    from: (t: string) => builder(t),
  })),
}))

import { GET as rawGET } from './route'

const GET = (qs = '') => rawGET(new Request(`http://x/tickets/export${qs}`))
const lines = async (res: Response) => (await res.text()).replace('﻿', '').trim().split('\r\n')

function ticket(n: number, over: Partial<Ticket> = {}): Ticket {
  return {
    id: `t${n}`,
    category: 'maintenance',
    subject: `Gate ${n}`,
    status: 'open',
    priority: 'high',
    created_at: '2026-10-20T15:00:00Z',
    unit: { unit_number: '4B' },
    submitter: { full_name: 'Ann Ames' },
    ...over,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-30T16:00:00Z'))
  signedIn = true
  gate = { ok: true, role: 'board', orgId: 'org-1' }
  calls.length = 0
  tickets = [ticket(1)]
  people = [{ id: 'p1' }]
  units = [{ id: 'u1' }]
})
afterEach(() => vi.useRealTimers())

describe('GET /tickets/export', () => {
  it('refuses a resident with 403 before reading anything', async () => {
    gate = { ok: false, error: DENIED }
    const res = await GET()
    expect(res.status).toBe(403)
    expect(calls).toHaveLength(0)
  })

  it('refuses a signed-out caller with 401', async () => {
    gate = { ok: false, error: 'You are not signed in to an organization.' }
    signedIn = false
    const res = await GET()
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('scopes the read to the caller organization and skips deleted tickets', async () => {
    await GET()
    expect(calls).toContainEqual({ table: 'tickets', op: 'eq', args: ['organization_id', 'org-1'] })
    expect(calls).toContainEqual({ table: 'tickets', op: 'is', args: ['deleted_at', null] })
  })

  it('writes the seven columns, the age in days, a resident name and no email', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="tickets-2026-10-30.csv"')
    const out = await lines(res)
    expect(out[0]).toBe('Subject,Category,Priority,Status,Resident,Unit,Opened,Age in days')
    expect(out[1]).toBe('Gate 1,Maintenance,High,Open,Ann Ames,4B,2026-10-20,10')
    expect(out.join('\n')).not.toContain('@')
    expect(calls.some((c) => c.args.some((a) => typeof a === 'string' && a.includes('email') && c.table === 'tickets'))).toBe(false)
  })

  it('applies the status filter and ignores an unknown status', async () => {
    const res = await GET('?status=closed')
    expect(calls).toContainEqual({ table: 'tickets', op: 'eq', args: ['status', 'closed'] })
    expect(res.headers.get('content-disposition')).toContain('tickets-closed-2026-10-30.csv')
    calls.length = 0
    await GET('?status=bogus')
    expect(calls.some((c) => c.table === 'tickets' && c.op === 'eq' && c.args[0] === 'status')).toBe(false)
  })

  it('applies the search the way the page does: subject, resident and unit', async () => {
    const res = await GET('?q=50%25,gate')
    const or = calls.find((c) => c.table === 'tickets' && c.op === 'or')
    expect(or?.args[0]).toBe('subject.ilike.%50\\% gate%,submitted_by.in.(p1),unit_id.in.(u1)')
    expect(res.headers.get('content-disposition')).toContain('tickets-search-2026-10-30.csv')
  })

  it('adds no OR without a search term', async () => {
    await GET()
    expect(calls.some((c) => c.op === 'or')).toBe(false)
  })

  it('neutralises a leading = in a subject and a resident name', async () => {
    tickets = [ticket(1, { subject: '=HYPERLINK("http://evil","x")', submitter: { full_name: '@SUM(A1)' } })]
    const csv = await (await GET()).text()
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`)
    expect(csv).toContain("'@SUM(A1)")
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m)
  })

  it('pages past the 1000-row cap', async () => {
    tickets = Array.from({ length: 1500 }, (_, i) => ticket(i))
    const out = await lines(await GET())
    expect(out).toHaveLength(1501)
    const ranges = calls.filter((c) => c.table === 'tickets' && c.op === 'range').map((c) => c.args)
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })
})
