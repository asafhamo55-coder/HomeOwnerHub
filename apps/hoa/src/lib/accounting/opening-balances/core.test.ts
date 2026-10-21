import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  proposeApproval: vi.fn(),
  loadOpeningBooks: vi.fn(),
}))

vi.mock('@homeowner-portal/workflows', () => ({ proposeApproval: m.proposeApproval }))
vi.mock('./load', () => ({ loadOpeningBooks: m.loadOpeningBooks }))

import { checkExisting, openingSubjectId, periodFor, proposeOpeningCore } from './core'
import { OPENING_ACTION, readOpeningPayload } from './proposal'
import type { OpeningBooksData, OpeningProposalRow } from './load'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const ASSOC = '00000000-0000-4000-8000-0000000000bb'
const USER = '00000000-0000-4000-8000-0000000000cc'
const FUND = '10000000-0000-4000-8000-000000000001'
const CASH = '30000000-0000-4000-8000-000000001010'
const AR = '30000000-0000-4000-8000-000000001100'
const EQUITY = '30000000-0000-4000-8000-000000003000'
const UNIT_A = '20000000-0000-4000-8000-000000000001'
const UNIT_B = '20000000-0000-4000-8000-000000000002'
const PERIOD = '40000000-0000-4000-8000-000000000001'

function books(over: Partial<OpeningBooksData> = {}): OpeningBooksData {
  return {
    funds: [{ id: FUND, code: 'OPERATING', name: 'Operating Fund', fund_type: 'operating', is_active: true }],
    accounts: [
      { id: CASH, account_number: '1010', account_name: 'Cash — Operating', account_type: 'asset', fund_id: FUND, is_active: true },
      { id: AR, account_number: '1100', account_name: 'Accounts Receivable', account_type: 'asset', fund_id: null, is_active: true },
      { id: EQUITY, account_number: '3000', account_name: 'Fund Balance — Operating', account_type: 'equity', fund_id: FUND, is_active: true },
    ],
    units: [
      { id: UNIT_A, address_line1: '1 A St', unit_number: null, lot_number: null },
      { id: UNIT_B, address_line1: '2 B St', unit_number: null, lot_number: null },
    ],
    periods: [{ id: PERIOD, start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' }],
    proposals: [],
    openCharges: 0,
    postedEntries: 0,
    ...over,
  }
}

const INPUT = {
  cutoverDate: '2026-01-01',
  chargesDueDate: '2026-02-01',
  cash: [{ fundId: FUND, cents: 1_000_00 }],
  homes: [
    { unitId: UNIT_A, cents: 250_00 },
    { unitId: UNIT_B, cents: 75_50 },
  ],
  prepaidCents: 0,
  payables: [],
}

function userDb() {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = []
  const db = {
    from(table: string) {
      return {
        insert: async (row: Record<string, unknown>) => {
          inserts.push({ table, row })
          return { error: null }
        },
      }
    },
  }
  return { db: db as never, inserts }
}

const adminDb = {} as never
const ctx = { orgId: ORG, associationId: ASSOC, userId: USER }

function proposal(over: Partial<OpeningProposalRow> & { cutoverDate?: string }): OpeningProposalRow {
  const { cutoverDate = '2026-01-01', ...rest } = over
  return {
    id: 'p-1',
    status: 'proposed',
    proposedAt: '2026-10-01T00:00:00Z',
    decidedAt: null,
    postedAt: null,
    journalEntryId: null,
    reason: null,
    failed: false,
    payload: { cutoverDate } as never,
    ...rest,
  }
}

beforeEach(() => {
  m.proposeApproval.mockReset()
  m.loadOpeningBooks.mockReset()
})

describe('openingSubjectId (the idempotency key)', () => {
  it('is a stable uuid per association, whatever the start date (SEC-N3: one live proposal per association)', () => {
    const a = openingSubjectId(ASSOC)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(openingSubjectId(ASSOC)).toBe(a)
    expect(openingSubjectId(ORG)).not.toBe(a)
    // the date is not an input: proposals for two dates collide on the live-subject index
    expect(openingSubjectId.length).toBe(1)
  })
})

describe('periodFor', () => {
  const periods = [
    { id: 'p25', start_date: '2025-01-01', end_date: '2025-12-31', status: 'closed' },
    { id: 'p26', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' },
  ]
  it('takes the open period the date falls in, never a closed one', () => {
    expect(periodFor(periods, '2026-03-01')?.id).toBe('p26')
    expect(periodFor(periods, '2025-06-01')).toBeNull()
    expect(periodFor(periods, '2027-01-01')).toBeNull()
  })
})

describe('checkExisting', () => {
  it('nothing earlier → none; rejected and failed ones don’t count', () => {
    expect(checkExisting([], '2026-01-01')).toEqual({ kind: 'none' })
    expect(checkExisting([proposal({ status: 'rejected' }), proposal({ status: 'failed' })], '2026-01-01')).toEqual({ kind: 'none' })
  })
  it('a live one for the same date is found, not duplicated', () => {
    expect(checkExisting([proposal({})], '2026-01-01').kind).toBe('same')
  })
  it('a live one for another date blocks', () => {
    const r = checkExisting([proposal({ cutoverDate: '2025-07-01' })], '2026-01-01')
    expect(r).toMatchObject({ kind: 'blocked' })
    if (r.kind === 'blocked') expect(r.error).toMatch(/as of 2025-07-01 are already waiting in Approvals/)
  })
  it('anything posted blocks, whatever the date', () => {
    const r = checkExisting([proposal({ status: 'posted' })], '2026-01-01')
    expect(r).toMatchObject({ kind: 'blocked' })
    if (r.kind === 'blocked') expect(r.error).toMatch(/already posted/)
  })
})

describe('proposeOpeningCore', () => {
  it('files ONE approval request with the server-built, balanced entry — and never posts', async () => {
    m.loadOpeningBooks.mockResolvedValue({ ok: true, data: books() })
    m.proposeApproval.mockResolvedValue({ id: 'req-1', status: 'proposed', created: true })
    const u = userDb()
    const r = await proposeOpeningCore(u.db, adminDb, ctx, INPUT)
    expect(r).toMatchObject({ ok: true, created: true, approvalRequestId: 'req-1' })

    expect(m.proposeApproval).toHaveBeenCalledTimes(1)
    const [db, filed] = m.proposeApproval.mock.calls[0]
    expect(db).toBe(adminDb)
    expect(filed).toMatchObject({
      organizationId: ORG,
      actionType: OPENING_ACTION,
      subjectId: openingSubjectId(ASSOC),
      amount: 1_325.5,
    })
    const payload = readOpeningPayload(filed.payload)
    expect(payload).not.toBeNull()
    expect(payload!.fiscalPeriodId).toBe(PERIOD)
    expect(payload!.lines.map((l) => [l.accountId, l.debitCents, l.creditCents])).toEqual([
      [CASH, 1_000_00, 0],
      [AR, 325_50, 0],
      [EQUITY, 0, 1_325_50],
    ])
    expect(payload!.charges).toEqual(INPUT.homes)
    expect(filed.summary).toBe('Opening balances as of 2026-01-01 — 1 fund, 2 homes owe $325.50')
  })

  it('audits counts only — no amounts, homes or addresses', async () => {
    m.loadOpeningBooks.mockResolvedValue({ ok: true, data: books() })
    m.proposeApproval.mockResolvedValue({ id: 'req-1', status: 'proposed', created: true })
    const u = userDb()
    await proposeOpeningCore(u.db, adminDb, ctx, INPUT)
    expect(u.inserts).toHaveLength(1)
    const { table, row } = u.inserts[0]
    expect(table).toBe('audit_log')
    expect(row).toMatchObject({ action: 'opening_balances_proposed', org_id: ORG, user_id: USER, entity_id: 'req-1' })
    expect(row.metadata).toEqual({ created: true, fund_count: 1, line_count: 3, home_count: 2 })
    expect(JSON.stringify(row)).not.toMatch(/1 A St|325|1000|UNIT|20000000-/)
  })

  it('re-running for the same date finds the live proposal and files nothing', async () => {
    m.loadOpeningBooks.mockResolvedValue({ ok: true, data: books({ proposals: [proposal({ id: 'req-1' })] }) })
    const r = await proposeOpeningCore(userDb().db, adminDb, ctx, INPUT)
    expect(r).toMatchObject({ ok: true, created: false, approvalRequestId: 'req-1', status: 'proposed' })
    expect(m.proposeApproval).not.toHaveBeenCalled()
  })

  it('a concurrent duplicate lands on the approval layer’s unique index and reads as not created', async () => {
    m.loadOpeningBooks.mockResolvedValue({ ok: true, data: books() })
    m.proposeApproval.mockResolvedValue({ id: 'req-1', status: 'proposed', created: false })
    const r = await proposeOpeningCore(userDb().db, adminDb, ctx, INPUT)
    expect(r).toMatchObject({ ok: true, created: false })
    if (r.ok) expect(r.message).toMatch(/already proposed/)
  })

  it('refuses once opening balances are posted', async () => {
    m.loadOpeningBooks.mockResolvedValue({ ok: true, data: books({ proposals: [proposal({ status: 'posted', cutoverDate: '2025-01-01' })] }) })
    const r = await proposeOpeningCore(userDb().db, adminDb, ctx, INPUT)
    expect(r.ok).toBe(false)
    expect(m.proposeApproval).not.toHaveBeenCalled()
  })

  it('refuses a home outside the association — the browser’s list is not trusted', async () => {
    m.loadOpeningBooks.mockResolvedValue({ ok: true, data: books({ units: [books().units[0]] }) })
    const r = await proposeOpeningCore(userDb().db, adminDb, ctx, INPUT)
    expect(r).toMatchObject({ ok: false })
    expect(m.proposeApproval).not.toHaveBeenCalled()
  })

  it('refuses a start date outside every open fiscal year', async () => {
    m.loadOpeningBooks.mockResolvedValue({ ok: true, data: books() })
    const r = await proposeOpeningCore(userDb().db, adminDb, ctx, { ...INPUT, cutoverDate: '2025-06-30', chargesDueDate: '2025-07-01' })
    expect(r).toMatchObject({ ok: false })
    if (!r.ok) expect(r.error).toMatch(/No open fiscal year/)
    expect(m.proposeApproval).not.toHaveBeenCalled()
  })

  it('refuses malformed input and a failed read without filing', async () => {
    expect((await proposeOpeningCore(userDb().db, adminDb, ctx, { cutoverDate: 'soon' })).ok).toBe(false)
    expect((await proposeOpeningCore(userDb().db, adminDb, ctx, { ...INPUT, cash: [{ fundId: FUND, cents: -5 }] })).ok).toBe(false)
    m.loadOpeningBooks.mockResolvedValue({ ok: false })
    expect((await proposeOpeningCore(userDb().db, adminDb, ctx, INPUT)).ok).toBe(false)
    expect(m.proposeApproval).not.toHaveBeenCalled()
  })
})
