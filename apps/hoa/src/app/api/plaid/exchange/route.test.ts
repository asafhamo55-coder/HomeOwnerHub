import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// POST /api/plaid/exchange — api-route-conventions (RC-1..RC-12).
// The handler is called directly; Plaid, Supabase and the role gate are
// mocked so every branch (gate, parse, ownership, provider failure,
// write failure, compensation, success shape) is pinned.

const FUND = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const ASSOC = 'assoc-1'
const ORG = 'org-1'
const SECRET_TEXT = 'Key (plaid_item_id)=(item-secret-xyz) already exists in plaid_items'
const ACCESS_TOKEN = 'access-sandbox-do-not-log'

// ─── Mocks ───────────────────────────────────────────────────────────

let gate: { ok: true; role: 'admin' | 'board'; orgId: string } | { ok: false; error: string }
let user: { id: string } | null

vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => gate),
}))

let assoc: { id: string; name: string } | null
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: vi.fn(async () => assoc) }))

/** funds rows visible to the query, keyed by id. */
let funds: Record<string, { organization_id: string; association_id: string }>
let plaidItemsError: { code?: string; message: string } | null
let bankAccountsError: { code?: string; message: string } | null
/** The bank_accounts compensation delete: its error, and how many rows it reports. */
let bankDeleteError: { code?: string; message: string } | null
let bankDeleteCount: number | null
const plaidItemsInserts: Array<Record<string, unknown>> = []
const bankAccountInserts: Array<Array<Record<string, unknown>>> = []
const bankAccountDeletes: string[][] = []
/** Every write, in the order the route issued it. */
const writes: string[] = []
const fromCalls: string[] = []

function fundsQuery() {
  const filters: Record<string, unknown> = {}
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filters[col] = val
      return q
    },
    maybeSingle: async () => {
      const row = funds[String(filters.id)]
      const match =
        row &&
        Object.entries(filters).every(([col, val]) => col === 'id' || (row as Record<string, unknown>)[col] === val)
      return { data: match ? { id: filters.id } : null, error: null }
    },
  }
  return q
}

const getSupabaseServerClient = vi.fn(async () => ({
  auth: { getUser: async () => ({ data: { user } }) },
  from: (table: string) => {
    fromCalls.push(table)
    if (table === 'funds') return fundsQuery()
    if (table === 'plaid_items') {
      return {
        insert: async (row: Record<string, unknown>) => {
          writes.push('plaid_items.insert')
          plaidItemsInserts.push(row)
          return { error: plaidItemsError }
        },
      }
    }
    if (table === 'bank_accounts') {
      return {
        insert: (rows: Array<Record<string, unknown>>) => {
          writes.push('bank_accounts.insert')
          bankAccountInserts.push(rows)
          return {
            select: async () =>
              bankAccountsError
                ? { data: null, error: bankAccountsError }
                : { data: rows.map((_, i) => ({ id: `ba-${i + 1}` })), error: null },
          }
        },
        delete: (opts?: { count?: string }) => ({
          in: async (col: string, ids: string[]) => {
            expect(col).toBe('id')
            expect(opts?.count).toBe('exact')
            writes.push('bank_accounts.delete')
            bankAccountDeletes.push(ids)
            return { error: bankDeleteError, count: bankDeleteError ? null : (bankDeleteCount ?? ids.length) }
          },
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  },
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient }))

const plaid = {
  itemPublicTokenExchange: vi.fn(),
  accountsGet: vi.fn(),
  institutionsGetById: vi.fn(),
  itemRemove: vi.fn(),
}
let plaidConfigured = true
vi.mock('@/lib/plaid', () => ({ getPlaidClient: () => (plaidConfigured ? plaid : null) }))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

const { POST } = await import('./route')

// ─── Helpers ─────────────────────────────────────────────────────────

function req(body: unknown): Request {
  return new Request('http://x/api/plaid/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const valid = { publicToken: 'public-sandbox-abc', fundId: FUND }

async function json(res: Response): Promise<Record<string, any>> {
  return (await res.json()) as Record<string, any>
}

function providerError(): Error {
  // Shaped like Plaid's axios error: the message and response body carry
  // provider text that must never reach the client or a log line.
  return Object.assign(new Error(`Request failed: ${SECRET_TEXT}`), {
    code: 'ERR_BAD_REQUEST',
    response: { status: 400, data: { error_code: 'INVALID_PUBLIC_TOKEN', error_message: SECRET_TEXT } },
  })
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  gate = { ok: true, role: 'board', orgId: ORG }
  user = { id: 'user-1' }
  assoc = { id: ASSOC, name: 'Test HOA' }
  funds = { [FUND]: { organization_id: ORG, association_id: ASSOC } }
  plaidItemsError = null
  bankAccountsError = null
  bankDeleteError = null
  bankDeleteCount = null
  plaidItemsInserts.length = 0
  bankAccountInserts.length = 0
  bankAccountDeletes.length = 0
  writes.length = 0
  fromCalls.length = 0
  plaidConfigured = true
  getSupabaseServerClient.mockClear()
  plaid.itemPublicTokenExchange.mockReset().mockResolvedValue({
    data: { access_token: ACCESS_TOKEN, item_id: 'item-1' },
  })
  plaid.accountsGet.mockReset().mockResolvedValue({
    data: {
      item: { institution_id: 'ins_1' },
      accounts: [
        { account_id: 'acc-chk', name: 'Checking', subtype: 'checking', mask: '1111' },
        { account_id: 'acc-sav', name: 'Savings', subtype: 'savings', mask: '2222' },
        { account_id: 'acc-cc', name: 'Card', subtype: 'credit card', mask: '3333' },
      ],
    },
  })
  plaid.institutionsGetById.mockReset().mockResolvedValue({ data: { institution: { name: 'First Bank' } } })
  plaid.itemRemove.mockReset().mockResolvedValue({ data: {} })
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

function expectNoLeak(text: string) {
  expect(text).not.toContain(SECRET_TEXT)
  expect(text).not.toContain('item-secret-xyz')
  expect(text).not.toContain(ACCESS_TOKEN)
  expect(text).not.toContain('plaid_items')
  expect(text).not.toContain('0009')
  const logged = JSON.stringify(consoleError.mock.calls)
  expect(logged).not.toContain(SECRET_TEXT)
  expect(logged).not.toContain(ACCESS_TOKEN)
}

function expectNoPlaidCalls() {
  expect(plaid.itemPublicTokenExchange).not.toHaveBeenCalled()
  expect(plaid.accountsGet).not.toHaveBeenCalled()
}

// ─── Auth and role (RC-3, RC-4) ──────────────────────────────────────

describe('POST /api/plaid/exchange — gate', () => {
  it('a resident gets 403 forbidden before the body is read or Plaid is called', async () => {
    gate = { ok: false, error: 'Only board members and admins can make this change.' }
    const res = await POST(req('{not json'))
    expect(res.status).toBe(403)
    const body = await json(res)
    expect(body.error.code).toBe('forbidden')
    expect(typeof body.error.message).toBe('string')
    expectNoPlaidCalls()
    expect(fromCalls).toEqual([])
  })

  it('a signed-out caller gets 401 unauthenticated', async () => {
    gate = { ok: false, error: 'You are not signed in to an organization.' }
    user = null
    const res = await POST(req(valid))
    expect(res.status).toBe(401)
    expect((await json(res)).error.code).toBe('unauthenticated')
    expectNoPlaidCalls()
  })

  it('a signed-in user with no HOA org gets 403 reason no_org', async () => {
    gate = { ok: false, error: 'You are not signed in to an organization.' }
    const res = await POST(req(valid))
    expect(res.status).toBe(403)
    const body = await json(res)
    expect(body.error.code).toBe('forbidden')
    expect(body.error.reason).toBe('no_org')
  })

  it('missing Plaid env is 503 not_configured, after the role gate', async () => {
    plaidConfigured = false
    const res = await POST(req(valid))
    expect(res.status).toBe(503)
    expect((await json(res)).error.code).toBe('not_configured')

    gate = { ok: false, error: 'Only board members and admins can make this change.' }
    expect((await POST(req(valid))).status).toBe(403)
  })
})

// ─── Parse and validate (RC-1, RC-8, RC-10) ──────────────────────────

describe('POST /api/plaid/exchange — parsing', () => {
  it('a body that is not JSON is 400 invalid_json', async () => {
    const res = await POST(req('{not json'))
    expect(res.status).toBe(400)
    expect((await json(res)).error.code).toBe('invalid_json')
    expectNoPlaidCalls()
  })

  it('an empty body is 400 invalid_json, not a thrown 500', async () => {
    const res = await POST(new Request('http://x/api/plaid/exchange', { method: 'POST' }))
    expect(res.status).toBe(400)
    expect((await json(res)).error.code).toBe('invalid_json')
  })

  it('a schema miss is 400 validation_failed with field issues, never raw Zod JSON', async () => {
    const res = await POST(req({ fundId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error.code).toBe('validation_failed')
    const paths = (body.error.issues as Array<{ path: string; message: string }>).map((i) => i.path).sort()
    expect(paths).toEqual(['fundId', 'publicToken'])
    for (const i of body.error.issues) expect(Object.keys(i).sort()).toEqual(['message', 'path'])
    expectNoPlaidCalls()
  })

  it('an empty publicToken is 400 validation_failed on publicToken', async () => {
    const res = await POST(req({ publicToken: '   ', fundId: FUND }))
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.issues.map((i: { path: string }) => i.path)).toEqual(['publicToken'])
  })

  it('the legacy snake_case public_token field is refused (request fields are camelCase)', async () => {
    const res = await POST(req({ public_token: 'public-sandbox-abc', fundId: FUND }))
    expect(res.status).toBe(400)
    expect((await json(res)).error.issues.map((i: { path: string }) => i.path)).toEqual(['publicToken'])
  })

  it('an oversized body is 413 payload_too_large with maxBytes, before Plaid is called', async () => {
    const res = await POST(req({ ...valid, padding: 'x'.repeat(20_000) }))
    expect(res.status).toBe(413)
    const body = await json(res)
    expect(body.error.code).toBe('payload_too_large')
    expect(body.error.maxBytes).toBe(16 * 1024)
    expectNoPlaidCalls()
  })

  it('an oversized declared Content-Length is 413 without reading the body', async () => {
    const r = new Request('http://x/api/plaid/exchange', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(10 * 1024 * 1024) },
      body: JSON.stringify(valid),
    })
    const res = await POST(r)
    expect(res.status).toBe(413)
    const body = await json(res)
    expect(body.error.code).toBe('payload_too_large')
    expect(body.error.maxBytes).toBe(16 * 1024)
  })

  it('an oversized publicToken (inside the body cap) is 413 payload_too_large with maxBytes, not 400', async () => {
    const res = await POST(req({ publicToken: 'p'.repeat(10_000), fundId: FUND }))
    expect(res.status).toBe(413)
    const body = await json(res)
    expect(body.error.code).toBe('payload_too_large')
    expect(body.error.maxBytes).toBe(500)
    expect(body.error.issues).toBeUndefined()
    expectNoPlaidCalls()
  })

  it('a publicToken exactly at the limit is accepted', async () => {
    const res = await POST(req({ publicToken: 'p'.repeat(500), fundId: FUND }))
    expect(res.status).toBe(201)
  })
})

// ─── Ownership (RC-4, R-18) ──────────────────────────────────────────

describe('POST /api/plaid/exchange — ownership', () => {
  it('no association for the org is 404 not_found reason no_association', async () => {
    assoc = null
    const res = await POST(req(valid))
    expect(res.status).toBe(404)
    const body = await json(res)
    expect(body.error.code).toBe('not_found')
    expect(body.error.reason).toBe('no_association')
    expectNoPlaidCalls()
  })

  it("another org's fundId is 404 not_found and no Plaid item is minted", async () => {
    funds = { [FUND]: { organization_id: 'org-other', association_id: 'assoc-other' } }
    const res = await POST(req(valid))
    expect(res.status).toBe(404)
    expect((await json(res)).error.code).toBe('not_found')
    expectNoPlaidCalls()
    expect(plaidItemsInserts).toEqual([])
  })

  it('an unknown fundId is 404 not_found', async () => {
    const res = await POST(req({ ...valid, fundId: OTHER }))
    expect(res.status).toBe(404)
    expectNoPlaidCalls()
  })

  it('a fund of a different association in the same org is 404 not_found', async () => {
    funds = { [FUND]: { organization_id: ORG, association_id: 'assoc-2' } }
    const res = await POST(req(valid))
    expect(res.status).toBe(404)
    expect((await json(res)).error.code).toBe('not_found')
    expectNoPlaidCalls()
  })
})

// ─── Provider and write failures (RC-1, RC-2, RC-6) ──────────────────

describe('POST /api/plaid/exchange — failures', () => {
  it('a failed token exchange is 503 upstream_unavailable with no provider text', async () => {
    plaid.itemPublicTokenExchange.mockRejectedValue(providerError())
    const res = await POST(req(valid))
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('upstream_unavailable')
    expectNoLeak(text)
    expect(plaid.itemRemove).not.toHaveBeenCalled()
    expect(plaidItemsInserts).toEqual([])
  })

  it('a failed accounts read is 503, and the minted item is removed', async () => {
    plaid.accountsGet.mockRejectedValue(providerError())
    const res = await POST(req(valid))
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('upstream_unavailable')
    expectNoLeak(text)
    expect(plaid.itemRemove).toHaveBeenCalledWith({ access_token: ACCESS_TOKEN })
    expect(plaidItemsInserts).toEqual([])
  })

  it('writes bank_accounts first and plaid_items last', async () => {
    const res = await POST(req(valid))
    expect(res.status).toBe(201)
    expect(writes).toEqual(['bank_accounts.insert', 'plaid_items.insert'])
  })

  it('a failed bank_accounts insert is the generic 500: nothing stored, the item is removed', async () => {
    bankAccountsError = { code: '23503', message: SECRET_TEXT }
    const res = await POST(req(valid))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text).error.code).toBe('internal')
    expectNoLeak(text)
    expect(plaid.itemRemove).toHaveBeenCalledWith({ access_token: ACCESS_TOKEN })
    // The token is never written when the accounts could not be.
    expect(writes).toEqual(['bank_accounts.insert'])
    expect(plaidItemsInserts).toEqual([])
  })

  it('a bank_accounts 23505 (already linked) is 409 and the live item is NOT revoked', async () => {
    bankAccountsError = { code: '23505', message: SECRET_TEXT }
    const res = await POST(req(valid))
    expect(res.status).toBe(409)
    const text = await res.text()
    const body = JSON.parse(text)
    expect(body.error.code).toBe('conflict')
    expect(body.error.reason).toBe('already_linked')
    expectNoLeak(text)
    expect(plaid.itemRemove).not.toHaveBeenCalled()
    expect(plaidItemsInserts).toEqual([])
  })

  it('a failed plaid_items insert deletes the new bank rows, then removes the item (reverse order), and is the generic 500', async () => {
    plaidItemsError = { code: '42501', message: SECRET_TEXT }
    plaid.itemRemove.mockImplementation(async () => {
      writes.push('plaid.itemRemove')
      return { data: {} }
    })
    const res = await POST(req(valid))
    expect(res.status).toBe(500)
    const text = await res.text()
    const body = JSON.parse(text)
    expect(body.error.code).toBe('internal')
    expect(body.error.message).toBe('Something went wrong on our side. Try again in a moment.')
    expectNoLeak(text)
    expect(writes).toEqual(['bank_accounts.insert', 'plaid_items.insert', 'bank_accounts.delete', 'plaid.itemRemove'])
    expect(bankAccountDeletes).toEqual([['ba-1', 'ba-2']])
    expect(plaid.itemRemove).toHaveBeenCalledWith({ access_token: ACCESS_TOKEN })
  })

  it('a plaid_items 23505 is 409 already_linked: our bank rows are deleted, the stored item is NOT revoked', async () => {
    plaidItemsError = { code: '23505', message: SECRET_TEXT }
    const res = await POST(req(valid))
    expect(res.status).toBe(409)
    const text = await res.text()
    expect(JSON.parse(text).error.reason).toBe('already_linked')
    expectNoLeak(text)
    expect(bankAccountDeletes).toEqual([['ba-1', 'ba-2']])
    expect(plaid.itemRemove).not.toHaveBeenCalled()
  })

  it('a compensation delete that fails is logged by code and still answers the generic 500', async () => {
    plaidItemsError = { code: '42501', message: SECRET_TEXT }
    bankDeleteError = { code: '42501', message: SECRET_TEXT }
    const res = await POST(req(valid))
    expect(res.status).toBe(500)
    expectNoLeak(await res.text())
    expect(plaid.itemRemove).toHaveBeenCalledWith({ access_token: ACCESS_TOKEN })
    expect(JSON.stringify(consoleError.mock.calls)).toContain('plaid.exchange.compensate.bank_accounts')
  })

  it('a compensation delete that RLS filters to fewer rows is treated as a failed compensation', async () => {
    plaidItemsError = { code: '42501', message: SECRET_TEXT }
    bankDeleteCount = 0
    const res = await POST(req(valid))
    expect(res.status).toBe(500)
    const logged = JSON.stringify(consoleError.mock.calls)
    expect(logged).toContain('plaid.exchange.compensate.bank_accounts')
    expect(logged).toContain('"left":2')
  })

  it('with no depository accounts a failed plaid_items insert deletes nothing and removes the item', async () => {
    plaid.accountsGet.mockResolvedValue({
      data: { item: { institution_id: null }, accounts: [{ account_id: 'cc', name: 'Card', subtype: 'credit card', mask: null }] },
    })
    plaidItemsError = { code: '42501', message: SECRET_TEXT }
    const res = await POST(req(valid))
    expect(res.status).toBe(500)
    expect(bankAccountDeletes).toEqual([])
    expect(plaid.itemRemove).toHaveBeenCalledWith({ access_token: ACCESS_TOKEN })
  })

  it('a failing itemRemove during compensation still answers the original error', async () => {
    bankAccountsError = { code: '23503', message: SECRET_TEXT }
    plaid.itemRemove.mockRejectedValue(providerError())
    const res = await POST(req(valid))
    expect(res.status).toBe(500)
    expectNoLeak(await res.text())
  })
})

// ─── Success (RC-1, RC-11) ───────────────────────────────────────────

describe('POST /api/plaid/exchange — success', () => {
  it('links every depository account to the fund and answers camelCase with no ok/error key', async () => {
    const res = await POST(req(valid))
    expect(res.status).toBe(201)
    const body = await json(res)
    expect(body).toEqual({ itemId: 'item-1', institutionName: 'First Bank', bankAccountIds: ['ba-1', 'ba-2'] })

    expect(plaid.itemPublicTokenExchange).toHaveBeenCalledWith({ public_token: 'public-sandbox-abc' })
    expect(plaidItemsInserts).toHaveLength(1)
    expect(plaidItemsInserts[0]).toMatchObject({
      organization_id: ORG,
      association_id: ASSOC,
      plaid_item_id: 'item-1',
      access_token: ACCESS_TOKEN,
      institution_name: 'First Bank',
    })
    expect(bankAccountInserts).toHaveLength(1)
    expect(bankAccountInserts[0]!.map((r) => r.plaid_account_id)).toEqual(['acc-chk', 'acc-sav'])
    for (const r of bankAccountInserts[0]!) {
      expect(r).toMatchObject({ organization_id: ORG, association_id: ASSOC, fund_id: FUND, plaid_item_id: 'item-1' })
    }
    expect(plaid.itemRemove).not.toHaveBeenCalled()
  })

  it('an item with no depository accounts succeeds with an empty list and inserts no bank rows', async () => {
    plaid.accountsGet.mockResolvedValue({
      data: { item: { institution_id: null }, accounts: [{ account_id: 'cc', name: 'Card', subtype: 'credit card', mask: null }] },
    })
    const res = await POST(req(valid))
    expect(res.status).toBe(201)
    expect(await json(res)).toEqual({ itemId: 'item-1', institutionName: null, bankAccountIds: [] })
    expect(plaid.institutionsGetById).not.toHaveBeenCalled()
    expect(bankAccountInserts).toEqual([])
  })
})
