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
vi.mock('@/lib/association-time-current', () => ({ currentTimeZone: vi.fn(async () => 'America/New_York') }))
let live = true
vi.mock('@homeowner-portal/db/m4', () => ({
  get M4_APPLIED() {
    return live
  },
}))

let signedIn = true
let rows: Record<string, unknown>[] = []
const calls: Array<{ table: string; op: string; args: unknown[] }> = []

function builder(table: string) {
  let rng: [number, number] = [0, 0]
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'order']) {
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
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve({ data: rows.slice(rng[0], rng[1] + 1), error: null }).then(resolve, reject)
  return b
}
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'u' } : null } }) },
    from: (t: string) => builder(t),
  })),
}))

import { GET as rawGET } from './route'

const GET = () => rawGET(new Request('http://x/insurance/export'))
const lines = async (res: Response) => (await res.text()).replace('﻿', '').trim().split('\r\n')

function policy(n: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `pol-${n}`,
    organization_id: 'org-1',
    association_id: null,
    kind: 'property',
    carrier: 'Acme Mutual',
    policy_number: 'PN-100',
    coverage_limit_cents: 250_000_000,
    deductible_cents: 500_000,
    premium_cents: 9_000_000,
    effective_on: '2026-01-01',
    expires_on: '2027-01-01',
    document_id: null,
    notes: 'private note',
    ...over,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-30T16:00:00Z'))
  signedIn = true
  live = true
  gate = { ok: true, role: 'board', orgId: 'org-1' }
  calls.length = 0
  rows = [policy(1)]
})
afterEach(() => vi.useRealTimers())

describe('GET /insurance/export', () => {
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

  it('scopes the read to the caller organization', async () => {
    await GET()
    expect(calls).toContainEqual({ table: 'insurance_policies', op: 'eq', args: ['organization_id', 'org-1'] })
  })

  it('writes the board columns and leaves premium, deductible and notes out', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="insurance-2026-10-30.csv"')
    const out = await lines(res)
    expect(out[0]).toBe('Kind,Carrier,Policy number,Coverage amount,Start,Expiry,Status')
    expect(out[1]).toBe('Master / property,Acme Mutual,PN-100,2500000.00,2026-01-01,2027-01-01,Active')
    expect(out.join('\n')).not.toContain('private note')
  })

  it('labels expired and not-yet-started policies', async () => {
    rows = [
      policy(1, { expires_on: '2026-09-01', effective_on: '2025-09-01' }),
      policy(2, { effective_on: '2026-12-01', expires_on: '2027-12-01' }),
    ]
    const out = await lines(await GET())
    expect(out[1]).toMatch(/,Expired$/)
    expect(out[2]).toMatch(/,Not started$/)
  })

  it('neutralises a leading = in the carrier and policy number', async () => {
    rows = [policy(1, { carrier: '=HYPERLINK("http://evil","x")', policy_number: '+1+1' })]
    const csv = await (await GET()).text()
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`)
    expect(csv).toContain("'+1+1")
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m)
  })

  it('pages past the 1000-row cap', async () => {
    rows = Array.from({ length: 1500 }, (_, i) => policy(i))
    const out = await lines(await GET())
    expect(out).toHaveLength(1501)
    const ranges = calls.filter((c) => c.op === 'range').map((c) => c.args)
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('returns 404 and reads nothing while migration 0068 is not applied', async () => {
    live = false
    const res = await GET()
    expect(res.status).toBe(404)
    expect(calls).toHaveLength(0)
  })
})
