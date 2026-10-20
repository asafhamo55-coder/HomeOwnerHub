import { beforeEach, describe, expect, it, vi } from 'vitest'

// The roster CSV route: board/admin only (everyone else 404, before any
// client is made), validated params, one counts-only audit row before the
// file, and a refused export when the audit can't be written. Fixture
// names and addresses are invented.

let role: { role: 'admin' | 'board' | 'resident'; org: { id: string } } | null = { role: 'board', org: { id: 'org-1' } }
vi.mock('@/lib/auth', () => ({ getCurrentUserRole: vi.fn(async () => role) }))

let tableRows: Record<string, Array<Record<string, unknown>>> = {}
let failing = new Set<string>()
let auditError: { code: string; message: string } | null = null
const inserts: Array<Record<string, unknown>> = []
const created = vi.fn()

function builder(table: string) {
  const b = {
    select: () => b,
    eq: () => b,
    is: () => b,
    lt: () => b,
    in: () => b,
    order: () => b,
    async range(from: number, to: number) {
      if (failing.has(table)) return { data: null, error: { code: 'XX000', message: 'boom at 12 Oak Lane' } }
      return { data: (tableRows[table] ?? []).slice(from, to + 1), error: null }
    },
    // resolve.ts's chunked `.in()` reads await the query itself.
    then(resolve: (v: unknown) => void) {
      resolve(failing.has(table) ? { data: null, error: { code: 'XX000', message: 'boom' } } : { data: tableRows[table] ?? [], error: null })
    },
    async insert(row: Record<string, unknown>) {
      inserts.push(row)
      return { error: auditError }
    },
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    created()
    return { auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) }, from: builder }
  }),
}))

const { GET } = await import('./route')

const call = (q: string) => GET(new Request(`http://localhost/properties/roster/export${q}`) as never)

beforeEach(() => {
  role = { role: 'board', org: { id: 'org-1' } }
  failing = new Set()
  auditError = null
  inserts.length = 0
  created.mockClear()
  tableRows = {
    associations: [{ id: 'a1', name: 'Oak HOA', state: 'FL', governing_law_state: 'FL' }],
    hoa_properties: [{ id: 'p1', address: '12 Oak Lane', unit_number: null, owner_name: 'Pat Owner', owner_email: 'pat@example.test', owner_phone: null }],
    units: [{ id: 'u1', legacy_hoa_property_id: 'p1', created_at: '2024-01-01', association_id: 'a1', lot_number: '7', notes: null }],
    ownerships: [],
    property_residents: [],
    assessments: [{ id: 'c1', unit_id: 'u1', amount: 250, due_date: '2025-01-01', status: 'open' }],
    payments: [],
  }
})

describe('GET /properties/roster/export', () => {
  it('a resident gets 404 and no database client is made', async () => {
    role = { role: 'resident', org: { id: 'org-1' } }
    const res = await call('?kind=owners&asOf=2026-10-18')
    expect(res.status).toBe(404)
    expect(created).not.toHaveBeenCalled()
  })

  it('no org gets 404', async () => {
    role = null
    expect((await call('?kind=owners')).status).toBe(404)
  })

  it('an unknown kind or a fake date is 400 validation_failed', async () => {
    const a = await call('?kind=everyone&asOf=2026-10-18')
    expect(a.status).toBe(400)
    expect((await a.json()).error.issues).toEqual([{ path: 'kind', message: 'Use owners, voters or records.' }])
    expect((await call('?kind=owners&asOf=2026-02-30')).status).toBe(400)
    expect(inserts).toHaveLength(0)
  })

  it('owner roster CSV with a counts-only audit row', async () => {
    const res = await call('?kind=owners&asOf=2026-10-18')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="owner-roster-as-of-2026-10-18.csv"')
    const text = await res.text()
    expect(text).toContain('12 Oak Lane')
    expect(text).toContain('Pat Owner (100%)')
    expect(inserts).toEqual([
      expect.objectContaining({
        action: 'statutory_roster_export',
        metadata: { kind: 'owners', as_of: '2026-10-18', format: 'csv', counts: { homes: 1, owners: 1, noOwner: 0 } },
      }),
    ])
    expect(JSON.stringify(inserts)).not.toContain('Oak')
  })

  it('voter list flags a Florida home more than 90 days past due', async () => {
    const res = await call('?kind=voters&asOf=2026-10-18')
    const text = await res.text()
    expect(text).toContain('may be suspended only if the board voted the suspension')
    expect(inserts[0]?.metadata).toEqual({ kind: 'voters', as_of: '2026-10-18', format: 'csv', counts: { homes: 1, noOwner: 0, mayBeSuspended: 1 } })
  })

  it('records-request copy: no phone, no balance, no email in Florida; counts-only audit row', async () => {
    tableRows.hoa_properties = [{ id: 'p1', address: '12 Oak Lane', unit_number: null, owner_name: 'Pat Owner', owner_email: 'pat@example.test', owner_phone: '555-0199' }]
    const res = await call('?kind=records&asOf=2026-10-18')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="owner-roster-records-copy-as-of-2026-10-18.csv"')
    const text = await res.text()
    expect(text).toContain('Pat Owner')
    expect(text).toContain('12 Oak Lane')
    expect(text).not.toContain('555-0199')
    expect(text).not.toContain('pat@example.test')
    expect(text).not.toContain('250')
    expect(text).not.toMatch(/phone|past due/i)
    expect(inserts).toEqual([
      expect.objectContaining({
        action: 'statutory_roster_export',
        metadata: {
          kind: 'records',
          as_of: '2026-10-18',
          format: 'csv',
          counts: { homes: 1, owners: 1, noOwner: 0, emailsIncluded: 0, ownersWithheld: 0, homesWithheld: 0 },
        },
      }),
    ])
    expect(JSON.stringify(inserts)).not.toMatch(/Oak|Pat|example\.test/)
  })

  it('records-request copy: a resident gets 404 before any client', async () => {
    role = { role: 'resident', org: { id: 'org-1' } }
    expect((await call('?kind=records&asOf=2026-10-18')).status).toBe(404)
    expect(created).not.toHaveBeenCalled()
    expect(inserts).toHaveLength(0)
  })

  it('a failed audit write refuses the export (generic 500)', async () => {
    auditError = { code: '42501', message: 'denied' }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call('?kind=owners&asOf=2026-10-18')
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('Oak')
    err.mockRestore()
  })

  it('a failed read is a generic 500 with no raw text', async () => {
    failing = new Set(['ownerships'])
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call('?kind=owners&asOf=2026-10-18')
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body).not.toContain('boom')
    expect(inserts).toHaveLength(0)
    err.mockRestore()
  })
})
