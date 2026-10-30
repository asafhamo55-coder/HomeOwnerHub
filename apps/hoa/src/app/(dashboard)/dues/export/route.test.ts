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

let association: { id: string; name: string; timeZone: string } | null = {
  id: 'assoc-1',
  name: 'Oak HOA',
  timeZone: 'America/New_York',
}
vi.mock('@/lib/primary-association', () => ({
  getPrimaryAssociationResult: vi.fn(async () => ({ ok: true, data: association, count: null })),
}))

const credits = new Map<string, number>()
vi.mock('@/lib/dues/unit-credit', () => ({ loadCreditByUnit: vi.fn(async () => credits) }))

interface Assessment {
  id: string
  unit_id: string
  amount: number
  due_date: string
  assessment_type: string
  payments: { amount: number }[]
  unit: { id: string; address_line1: string; unit_number: string | null }
}
interface Ownership {
  unit_id: string
  owner_name: string | null
  owner_email: string | null
  owner_user_id: string | null
}
let signedIn = true
let assessments: Assessment[] = []
let ownerships: Ownership[] = []
const calls: Array<{ table: string; op: string; args: unknown[] }> = []

function builder(table: string) {
  let ids: string[] | null = null
  let rng: [number, number] = [0, 0]
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'is', 'order']) {
    b[op] = (...args: unknown[]) => {
      calls.push({ table, op, args })
      return b
    }
  }
  b.in = (...args: unknown[]) => {
    calls.push({ table, op: 'in', args })
    if (table === 'ownerships') ids = args[1] as string[]
    return b
  }
  b.range = (from: number, to: number) => {
    calls.push({ table, op: 'range', args: [from, to] })
    rng = [from, to]
    return b
  }
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    const all: unknown[] =
      table === 'assessments' ? assessments : ownerships.filter((o) => (ids ?? []).includes(o.unit_id))
    return Promise.resolve({ data: all.slice(rng[0], rng[1] + 1), error: null }).then(resolve, reject)
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

const GET = (qs = '') => rawGET(new Request(`http://x/dues/export${qs}`))

function charge(unit: string, due: string, amount = 100, address = `${unit} Oak St`): Assessment {
  return {
    id: `a-${unit}-${due}`,
    unit_id: unit,
    amount,
    due_date: due,
    assessment_type: 'regular',
    payments: [],
    unit: { id: unit, address_line1: address, unit_number: null },
  }
}
const owner = (unit: string, name: string | null, email = `${unit}@x.test`): Ownership => ({
  unit_id: unit,
  owner_name: name,
  owner_email: email,
  owner_user_id: null,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-30T16:00:00Z'))
  signedIn = true
  gate = { ok: true, role: 'board', orgId: 'org-1' }
  association = { id: 'assoc-1', name: 'Oak HOA', timeZone: 'America/New_York' }
  credits.clear()
  calls.length = 0
  assessments = [
    charge('u1', '2026-10-10', 100), // 20 days late: 1-30
    charge('u2', '2026-07-01', 250), // 121 days late: 90+
    charge('u2', '2026-09-01', 50),
    charge('u3', '2026-11-15', 80), // not due yet: current
  ]
  ownerships = [owner('u1', 'Ann Ames'), owner('u2', 'Bo Bell'), owner('u3', 'Cy Cole')]
})
afterEach(() => vi.useRealTimers())

describe('GET /dues/export', () => {
  it('refuses a resident with 403 before reading anything', async () => {
    gate = { ok: false, error: DENIED }
    const res = await GET()
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
    expect(calls).toHaveLength(0)
  })

  it('refuses a signed-out caller with 401', async () => {
    gate = { ok: false, error: 'You are not signed in to an organization.' }
    signedIn = false
    const res = await GET()
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('scopes every read to the caller association', async () => {
    await GET()
    expect(calls).toContainEqual({ table: 'assessments', op: 'eq', args: ['association_id', 'assoc-1'] })
    const touched = new Set(calls.map((c) => c.table))
    expect(touched).toEqual(new Set(['assessments', 'ownerships']))
  })

  it('exports every owner with the six columns and no email', async () => {
    credits.set('u2', 12.5)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="who-owes-all-2026-10-30.csv"')
    const csv = await res.text()
    const lines = csv.replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toBe('Unit,Owner name,Aging,Amount owed,Oldest unpaid due date,Credit on account')
    expect(lines).toHaveLength(4)
    expect(lines).toContain('u2 Oak St,Bo Bell,Over 90 days,300.00,2026-07-01,12.50')
    expect(lines).toContain('u1 Oak St,Ann Ames,1–30 days,100.00,2026-10-10,0.00')
    expect(lines).toContain('u3 Oak St,Cy Cole,Current,80.00,2026-11-15,0.00')
    expect(csv).not.toContain('@x.test')
  })

  it('filters by the aging bucket, matching the panel', async () => {
    const res = await GET('?aging=90%2B')
    expect(res.headers.get('content-disposition')).toContain('who-owes-90+-2026-10-30.csv')
    const lines = (await res.text()).replace('﻿', '').trim().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('Bo Bell')
  })

  it('treats an unknown bucket as all', async () => {
    const lines = (await (await GET('?aging=bogus')).text()).trim().split('\r\n')
    expect(lines).toHaveLength(4)
  })

  it('neutralises a formula in an owner name', async () => {
    ownerships = [owner('u1', '=HYPERLINK("http://evil","x")'), owner('u2', '@SUM(A1)'), owner('u3', '-2+3')]
    const csv = await (await GET()).text()
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`)
    expect(csv).toContain("'@SUM(A1)")
    expect(csv).toContain("'-2+3")
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m)
  })

  it('pages past the 1000-row cap', async () => {
    assessments = Array.from({ length: 1500 }, (_, i) => charge(`p${i}`, '2026-10-10'))
    ownerships = assessments.map((a, i) => owner(a.unit_id, `Owner ${i}`))
    const res = await GET()
    const lines = (await res.text()).trim().split('\r\n')
    expect(lines).toHaveLength(1501)
    const ranges = calls.filter((c) => c.table === 'assessments' && c.op === 'range').map((c) => c.args)
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('returns 404 when no association is set up', async () => {
    association = null
    const res = await GET()
    expect(res.status).toBe(404)
  })
})
