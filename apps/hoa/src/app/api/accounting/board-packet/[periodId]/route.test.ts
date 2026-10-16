import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────

let gate: { ok: true; role: 'admin' | 'board'; orgId: string } | { ok: false; error: string } = {
  ok: true,
  role: 'board',
  orgId: 'org-1',
}

vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async (denied: string) => (gate.ok ? gate : { ok: false, error: gate.error === '__denied__' ? denied : gate.error })),
}))

type Ctx = { organizationId: string; associationId: string; associationName: string; currentPeriod: null }
let accountingCtx: Ctx | null = null
let ctxThrows = false
let computeThrows = false

const BS = {
  asOfDate: '2026-01-31',
  assets: [{ accountId: 'a1', accountNumber: '1010', accountName: 'Operating cash', accountType: 'asset', balance: 100 }],
  liabilities: [],
  equity: [],
  netIncomePtd: 100,
  totalAssets: 100,
  totalLiabilities: 0,
  totalEquity: 100,
  isBalanced: true,
}
const IS = {
  periodId: 'p',
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  basis: 'accrual',
  income: [],
  expenses: [],
  totalIncome: 0,
  totalExpenses: 0,
  netIncome: 0,
}
const CF = { periodId: 'p', startDate: '2026-01-01', endDate: '2026-01-31', rows: [], openingCash: 0, closingCash: 0, totalNet: 0 }

vi.mock('@/lib/accounting/queries', () => ({
  getAccountingContext: vi.fn(async () => {
    if (ctxThrows) throw new Error('relation "secret_table" does not exist')
    return accountingCtx
  }),
  computeBalanceSheet: vi.fn(async () => {
    if (computeThrows) throw new Error('duplicate key value violates unique constraint "ledger_pkey"')
    return BS
  }),
  computeIncomeStatement: vi.fn(async () => IS),
  computeCashFlow: vi.fn(async () => CF),
}))

let period: Record<string, unknown> | null = null
let periodError: { code: string; message: string } | null = null
let user: { id: string } | null = { id: 'user-1' }
const scopes: Array<[string, unknown]> = []

function builder() {
  const b = {
    select() {
      return b
    },
    eq(col: string, val: unknown) {
      scopes.push([col, val])
      return b
    },
    async maybeSingle() {
      return { data: periodError ? null : period, error: periodError }
    },
    async single() {
      return { data: periodError ? null : period, error: periodError }
    },
  }
  return b
}

const getSupabaseServerClient = vi.fn(async () => ({
  auth: { getUser: async () => ({ data: { user } }) },
  from: () => builder(),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient }))

const { GET } = await import('./route')

const PERIOD_ID = '11111111-1111-4111-8111-111111111111'

function call(periodId = PERIOD_ID) {
  return GET(new Request(`http://x/api/accounting/board-packet/${periodId}`), {
    params: Promise.resolve({ periodId }),
  })
}

async function envelope(res: Response) {
  const body = (await res.json()) as { error: { code: string; message: string; reason?: string; issues?: unknown[] } }
  expect(typeof body.error).toBe('object')
  expect(typeof body.error.message).toBe('string')
  return body.error
}

beforeEach(() => {
  gate = { ok: true, role: 'board', orgId: 'org-1' }
  accountingCtx = { organizationId: 'org-1', associationId: 'assoc-1', associationName: 'Test HOA', currentPeriod: null }
  ctxThrows = false
  computeThrows = false
  period = { id: PERIOD_ID, start_date: '2026-01-01', end_date: '2026-01-31', status: 'open' }
  periodError = null
  user = { id: 'user-1' }
  scopes.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/accounting/board-packet/[periodId]', () => {
  it('returns the PDF to a board member', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain('board-packet-2026')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    // The period lookup is scoped to the caller's association.
    expect(scopes).toContainEqual(['id', PERIOD_ID])
    expect(scopes).toContainEqual(['association_id', 'assoc-1'])
  })

  it('a resident gets 403 forbidden in the envelope, before any database read', async () => {
    gate = { ok: false, error: '__denied__' }
    getSupabaseServerClient.mockClear()
    const res = await call()
    expect(res.status).toBe(403)
    const err = await envelope(res)
    expect(err.code).toBe('forbidden')
    expect(err.message).toMatch(/board packet/i)
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('a signed-out caller gets 401 unauthenticated', async () => {
    gate = { ok: false, error: 'You are not signed in to an organization.' }
    user = null
    const res = await call()
    expect(res.status).toBe(401)
    expect((await envelope(res)).code).toBe('unauthenticated')
  })

  it('a signed-in caller with no org gets 403 no_org (not 401 after the gate)', async () => {
    gate = { ok: false, error: 'You are not signed in to an organization.' }
    const res = await call()
    expect(res.status).toBe(403)
    const err = await envelope(res)
    expect(err.code).toBe('forbidden')
    expect(err.reason).toBe('no_org')
  })

  it('a malformed period id is 400 validation_failed with issues', async () => {
    const res = await call('not-a-uuid')
    expect(res.status).toBe(400)
    const err = await envelope(res)
    expect(err.code).toBe('validation_failed')
    expect(Array.isArray(err.issues)).toBe(true)
  })

  it('accounting not set up is 404 not_found, not 401', async () => {
    accountingCtx = null
    const res = await call()
    expect(res.status).toBe(404)
    const err = await envelope(res)
    expect(err.code).toBe('not_found')
    expect(err.reason).toBe('accounting_not_set_up')
  })

  it('an association from another org is 404 not_found', async () => {
    accountingCtx = { organizationId: 'org-2', associationId: 'assoc-2', associationName: 'Other', currentPeriod: null }
    const res = await call()
    expect(res.status).toBe(404)
    expect((await envelope(res)).code).toBe('not_found')
  })

  it('an unknown or foreign period is 404 not_found with reason period_not_found', async () => {
    period = null
    const res = await call()
    expect(res.status).toBe(404)
    const err = await envelope(res)
    expect(err.code).toBe('not_found')
    expect(err.reason).toBe('period_not_found')
  })

  it('a failed period read is a generic 500, not a 404, and leaks no raw text', async () => {
    periodError = { code: '42P01', message: 'relation "fiscal_periods" does not exist' }
    const res = await call()
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('fiscal_periods')
    expect(JSON.parse(text).error.code).toBe('internal')
    for (const args of vi.mocked(console.error).mock.calls) {
      expect(JSON.stringify(args)).not.toContain('does not exist')
    }
  })

  it('a report computation failure is a JSON 500 envelope with no raw text', async () => {
    computeThrows = true
    const res = await call()
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('ledger_pkey')
    expect(JSON.parse(text).error.code).toBe('internal')
  })

  it('a context read failure is a JSON 500 envelope with no raw text', async () => {
    ctxThrows = true
    const res = await call()
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('secret_table')
    expect(JSON.parse(text).error.code).toBe('internal')
  })
})
