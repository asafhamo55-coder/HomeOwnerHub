import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────

const RAW = 'duplicate key value violates unique constraint "bank_transactions_pkey" secret-detail'

let bankAcct: { data: { organization_id: string } | null; error: { code: string; message: string } | null }
let existingTxn: { data: { id: string } | null; error: { code: string; message: string } | null }
let existingAfterRace: { id: string } | null
let insertResult: { data: { id: string } | null; error: { code: string; message: string } | null }
const inserts: Array<Record<string, unknown>> = []
let txnSelects = 0
const txnEqs: Array<[string, unknown]> = []

function bankAccountsBuilder() {
  const b = {
    select: () => b,
    eq: () => b,
    maybeSingle: async () => bankAcct,
    single: async () => bankAcct,
  }
  return b
}

function bankTransactionsBuilder() {
  const b = {
    select: () => b,
    eq: (col: string, val: unknown) => {
      txnEqs.push([col, val])
      return b
    },
    maybeSingle: async () => {
      txnSelects += 1
      // First lookup is the pre-insert idempotency check; a later one is the
      // re-read after a unique-violation race.
      if (txnSelects === 1) return existingTxn
      return { data: existingAfterRace, error: null }
    },
    insert: (row: Record<string, unknown>) => {
      inserts.push(row)
      const ib = {
        select: () => ib,
        single: async () => insertResult,
      }
      return ib
    },
  }
  return b
}

vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'bank_accounts') return bankAccountsBuilder()
      if (table === 'bank_transactions') return bankTransactionsBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

const execute = vi.fn()
vi.mock('@homeowner-portal/workflows', () => ({
  bankReconciliationAgent: { execute: (...args: unknown[]) => execute(...args) },
}))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

const { POST } = await import('./route')

// ─── Helpers ─────────────────────────────────────────────────────────

const SECRET = 'test-ingest-secret'
const ACCOUNT = '11111111-1111-4111-8111-111111111111'

function req(body: unknown, headers: Record<string, string> = { authorization: `Bearer ${SECRET}` }): Request {
  return new Request('http://localhost/api/webhooks/plaid', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const valid = {
  bankAccountId: ACCOUNT,
  amountCents: 12345,
  postedDate: '2026-10-01',
  memo: 'ZELLE MEMO',
  merchant: null,
  plaidTransactionId: 'txn-1',
}

async function json(res: Response): Promise<Record<string, any>> {
  return (await res.json()) as Record<string, any>
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  process.env.PLAID_INGEST_SECRET = SECRET
  bankAcct = { data: { organization_id: 'org-1' }, error: null }
  existingTxn = { data: null, error: null }
  existingAfterRace = null
  insertResult = { data: { id: 'bt-1' }, error: null }
  inserts.length = 0
  txnSelects = 0
  txnEqs.length = 0
  execute.mockReset()
  execute.mockResolvedValue({
    runId: 'run-1',
    status: 'succeeded',
    output: { matchMethod: 'auto_exact', confidence: 1, notes: 'matched' },
  })
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  delete process.env.PLAID_INGEST_SECRET
  errorSpy.mockRestore()
})

function expectNoRaw(res: Response, body: unknown) {
  const text = JSON.stringify(body)
  expect(text).not.toContain('secret-detail')
  expect(text).not.toContain('bank_transactions_pkey')
  expect(text).not.toContain('boom')
  for (const call of errorSpy.mock.calls) {
    expect(JSON.stringify(call)).not.toContain('secret-detail')
    expect(JSON.stringify(call)).not.toContain('boom')
  }
  expect(res.headers.get('content-type')).toContain('application/json')
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('POST /api/webhooks/plaid (manual bank-transaction ingest)', () => {
  it('fails closed with 503 not_configured when the secret is unset', async () => {
    delete process.env.PLAID_INGEST_SECRET
    const res = await POST(req(valid))
    expect(res.status).toBe(503)
    expect((await json(res)).error.code).toBe('not_configured')
  })

  it('rejects the legacy x-ingest-key header (Bearer only)', async () => {
    const res = await POST(req(valid, { 'x-ingest-key': SECRET }))
    expect(res.status).toBe(401)
    expect((await json(res)).error.code).toBe('unauthenticated')
  })

  it('rejects a wrong bearer secret with 401 before reading the body', async () => {
    const res = await POST(req('{not json', { authorization: 'Bearer nope' }))
    expect(res.status).toBe(401)
    expect((await json(res)).error.code).toBe('unauthenticated')
  })

  it('answers bad JSON with 400 invalid_json', async () => {
    const res = await POST(req('{not json'))
    expect(res.status).toBe(400)
    expect((await json(res)).error.code).toBe('invalid_json')
  })

  it('answers a schema miss with 400 validation_failed and field issues', async () => {
    const res = await POST(req({ ...valid, amountCents: 12.5, postedDate: '2026-02-30' }))
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error.code).toBe('validation_failed')
    const paths = (body.error.issues as Array<{ path: string }>).map((i) => i.path)
    expect(paths).toContain('amountCents')
    expect(paths).toContain('postedDate')
  })

  it('refuses a zero amount and the old float-dollar `amount` field', async () => {
    const zero = await POST(req({ ...valid, amountCents: 0 }))
    expect(zero.status).toBe(400)
    const { amountCents: _drop, ...rest } = valid
    const legacy = await POST(req({ ...rest, amount: 123.45 }))
    expect(legacy.status).toBe(400)
    expect((await json(legacy)).error.code).toBe('validation_failed')
  })

  it('bounds memo text', async () => {
    const res = await POST(req({ ...valid, memo: 'x'.repeat(5000) }))
    expect(res.status).toBe(400)
    expect((await json(res)).error.code).toBe('validation_failed')
  })

  it('answers an oversized body with 413', async () => {
    const res = await POST(req({ ...valid, memo: 'x'.repeat(70_000) }))
    expect(res.status).toBe(413)
    expect((await json(res)).error.code).toBe('payload_too_large')
  })

  it('answers an unknown bank account with 404 not_found', async () => {
    bankAcct = { data: null, error: null }
    const res = await POST(req(valid))
    expect(res.status).toBe(404)
    expect((await json(res)).error.code).toBe('not_found')
    expect(inserts).toHaveLength(0)
  })

  it('answers a failed bank-account read with a generic 500, no raw text', async () => {
    bankAcct = { data: null, error: { code: 'XX000', message: `boom ${RAW}` } }
    const res = await POST(req(valid))
    expect(res.status).toBe(500)
    const body = await json(res)
    expect(body.error.code).toBe('internal')
    expectNoRaw(res, body)
  })

  it('answers a failed insert with non-2xx and no raw DB text, so the sender retries', async () => {
    insertResult = { data: null, error: { code: '23502', message: RAW } }
    const res = await POST(req(valid))
    expect(res.status).toBe(500)
    const body = await json(res)
    expect(body.error.code).toBe('internal')
    expectNoRaw(res, body)
    expect(execute).not.toHaveBeenCalled()
  })

  it('answers a failed idempotency read with a generic 500', async () => {
    existingTxn = { data: null, error: { code: 'XX000', message: RAW } }
    const res = await POST(req(valid))
    expect(res.status).toBe(500)
    expectNoRaw(res, await json(res))
    expect(inserts).toHaveLength(0)
  })

  it('treats a concurrent duplicate delivery (23505) as the existing transaction', async () => {
    insertResult = { data: null, error: { code: '23505', message: RAW } }
    existingAfterRace = { id: 'bt-existing' }
    const res = await POST(req(valid))
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.bankTransactionId).toBe('bt-existing')
    expect(execute).toHaveBeenCalledWith({ bankTransactionId: 'bt-existing' }, { organizationId: 'org-1' })
  })

  it('answers 409 when the transaction id belongs to another org', async () => {
    insertResult = { data: null, error: { code: '23505', message: RAW } }
    existingAfterRace = null // not visible in this org
    const res = await POST(req(valid))
    expect(res.status).toBe(409)
    const body = await json(res)
    expect(body.error.code).toBe('conflict')
    expect(body.error.reason).toBe('duplicate_transaction_id')
    expectNoRaw(res, body)
    expect(execute).not.toHaveBeenCalled()
  })

  it('scopes the idempotency lookup to the bank account org', async () => {
    await POST(req(valid))
    expect(txnEqs).toContainEqual(['organization_id', 'org-1'])
  })

  it('reuses an already-ingested transaction on a retry', async () => {
    existingTxn = { data: { id: 'bt-old' }, error: null }
    const res = await POST(req(valid))
    expect(res.status).toBe(200)
    expect((await json(res)).bankTransactionId).toBe('bt-old')
    expect(inserts).toHaveLength(0)
  })

  it('answers a workflow failure with a generic 500 carrying no raw error text', async () => {
    execute.mockRejectedValue(new Error(`boom ${RAW}`))
    const res = await POST(req(valid))
    expect(res.status).toBe(500)
    const body = await json(res)
    expect(body.error.code).toBe('internal')
    expect(body.error.bankTransactionId).toBe('bt-1')
    expect(body.ok).toBeUndefined()
    expectNoRaw(res, body)
  })

  it('stores integer cents as dollars and returns a camelCase body', async () => {
    const res = await POST(req(valid))
    expect(res.status).toBe(200)
    expect(inserts[0]).toMatchObject({
      organization_id: 'org-1',
      bank_account_id: ACCOUNT,
      amount: 123.45,
      posted_date: '2026-10-01',
      plaid_transaction_id: 'txn-1',
    })
    const body = await json(res)
    expect(body).toEqual({
      ok: true,
      bankTransactionId: 'bt-1',
      w18: { matchMethod: 'auto_exact', confidence: 1, notes: 'matched', runId: 'run-1', status: 'succeeded' },
    })
  })

  it('accepts a negative (outbound) amount', async () => {
    const res = await POST(req({ ...valid, amountCents: -500, plaidTransactionId: undefined }))
    expect(res.status).toBe(200)
    expect(inserts[0]).toMatchObject({ amount: -5, plaid_transaction_id: null })
  })
})
