import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────

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

const BOARD = '22222222-2222-4222-8222-222222222222'
const RESIDENT = '33333333-3333-4333-8333-333333333333'
const VENDOR = '11111111-1111-4111-8111-111111111111'

vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: async () => ({
          data: [
            { user_id: BOARD, role: 'board', profile: { full_name: 'Pat Board' } },
            { user_id: RESIDENT, role: 'resident', profile: { full_name: 'Rita Resident' } },
          ],
          error: null,
        }),
      }),
    }),
  }),
}))

let auditRows: Array<Record<string, unknown>> = []
let total = 0
let readError: { code: string; message: string } | null = null
let auditError: { code: string; message: string } | null = null
const inserts: Array<Record<string, unknown>> = []
const ops: Array<[string, ...unknown[]]> = []

function builder() {
  let head = false
  let range: [number, number] | null = null
  const b: Record<string, unknown> = {
    select(_cols: string, opts?: { head?: boolean }) {
      head = Boolean(opts?.head)
      return b
    },
    range(from: number, to: number) {
      range = [from, to]
      return b
    },
    async insert(row: Record<string, unknown>) {
      inserts.push(row)
      return { error: auditError }
    },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      const res = readError
        ? { data: null, count: null, error: readError }
        : head
          ? { data: null, count: total, error: null }
          : { data: auditRows.slice(range?.[0] ?? 0, (range?.[1] ?? 0) + 1), error: null }
      return Promise.resolve(res).then(resolve, reject)
    },
  }
  for (const op of ['eq', 'not', 'or', 'gte', 'lt', 'order']) {
    b[op] = (...args: unknown[]) => {
      ops.push([op, ...args])
      return b
    }
  }
  return b
}

const getSupabaseServerClient = vi.fn(async () => ({
  auth: { getUser: async () => ({ data: { user: { id: BOARD } } }) },
  from: () => builder(),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: () => getSupabaseServerClient() }))

import { GET as rawGET } from './route'

const GET = (qs = '') => rawGET(new Request(`http://x/api/settings/activity/export${qs}`))

beforeEach(() => {
  gate = { ok: true, role: 'board', orgId: 'org-1' }
  auditRows = [
    {
      id: 'a1',
      user_id: BOARD,
      action: 'vendor.compliance.manual_override',
      entity_type: 'vendor',
      entity_id: VENDOR,
      metadata: { new_status: 'red', summary: 'called Bob at 555-0100' },
      created_at: '2026-10-20T18:05:00Z',
    },
    {
      id: 'a2',
      user_id: RESIDENT,
      action: 'sms_consent_granted',
      entity_type: 'resident_communication_preferences',
      entity_id: RESIDENT,
      metadata: { phone: '+15550100' },
      created_at: '2026-10-19T12:00:00Z',
    },
  ]
  total = auditRows.length
  readError = null
  auditError = null
  inserts.length = 0
  ops.length = 0
  getSupabaseServerClient.mockClear()
})

describe('GET /api/settings/activity/export', () => {
  it('403s a resident before any client is made', async () => {
    gate = { ok: false, error: DENIED }
    const res = await GET()
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
  })

  it('400s a bad filter with issues', async () => {
    const res = await GET('?from=2026-02-30')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.issues[0].path).toBe('from')
  })

  it('exports what the page shows — no metadata, no resident name — and audits itself', async () => {
    const res = await GET('?area=vendors&from=2026-10-01')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    const csv = await res.text()
    expect(csv).toContain('Pat Board')
    expect(csv).toContain('Overrode a vendor’s insurance status')
    expect(csv).toContain('Set to not compliant')
    expect(csv).toContain(`/vendors/${VENDOR}`)
    expect(csv).toContain('A resident')
    expect(csv).not.toMatch(/Rita|Bob|555|\+1555|\{/)
    expect(ops).toContainEqual(['eq', 'org_id', 'org-1'])

    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      action: 'activity_log_export',
      org_id: 'org-1',
      user_id: BOARD,
      metadata: { rows: 2, area: 'vendors', from: '2026-10-01', to: null, person_filtered: false },
    })
  })

  it('refuses the export when its audit row cannot be written', async () => {
    auditError = { code: '42501', message: 'permission denied for Pat Board' }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET()
    expect(res.status).toBe(500)
    const body = JSON.stringify(await res.json())
    expect(body).not.toContain('permission denied')
    expect(JSON.stringify(err.mock.calls)).not.toContain('Pat Board')
    err.mockRestore()
  })

  it('500s with the generic envelope when the read fails', async () => {
    readError = { code: '57014', message: 'canceling statement for org-1 Pat' }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('canceling')
    expect(inserts).toHaveLength(0)
    err.mockRestore()
  })

  it('422s an export over the row cap and writes nothing', async () => {
    total = 50_000
    const res = await GET()
    expect(res.status).toBe(422)
    expect((await res.json()).error.reason).toBe('too_many_rows')
    expect(inserts).toHaveLength(0)
  })
})
