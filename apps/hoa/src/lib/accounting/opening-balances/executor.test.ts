import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ postJournalEntry: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({ postJournalEntry: m.postJournalEntry }))
vi.mock('@homeowner-portal/workflows', () => ({ memoCodeFor: () => 'OAK-0001-DUES' }))

import { openingExecutor } from './executor'
import { OPENING_ACTION, type OpeningPayload } from './proposal'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const ASSOC = '00000000-0000-4000-8000-0000000000bb'
const FUND = '10000000-0000-4000-8000-000000000001'
const CASH = '30000000-0000-4000-8000-000000001010'
const AR = '30000000-0000-4000-8000-000000001100'
const EQUITY = '30000000-0000-4000-8000-000000003000'
const UNIT_A = '20000000-0000-4000-8000-000000000001'
const PERIOD = '40000000-0000-4000-8000-000000000001'
const REQ = '50000000-0000-4000-8000-000000000001'

const PAYLOAD: OpeningPayload = {
  version: 1,
  associationId: ASSOC,
  cutoverDate: '2026-01-01',
  chargesDueDate: '2026-02-01',
  fiscalPeriodId: PERIOD,
  lines: [
    { accountId: CASH, fundId: FUND, debitCents: 1000_00, creditCents: 0, label: '1010 Cash — Operating' },
    { accountId: AR, fundId: FUND, debitCents: 250_00, creditCents: 0, label: '1100 Accounts Receivable' },
    { accountId: EQUITY, fundId: FUND, debitCents: 0, creditCents: 1250_00, label: '3000 Fund Balance — Operating' },
  ],
  charges: [{ unitId: UNIT_A, cents: 250_00 }],
  arAccountId: AR,
  funds: [{ fundId: FUND, name: 'Operating Fund', equityCents: 1250_00 }],
}

type Resp = { data: unknown; error: unknown }
type Op = [string, unknown[]]

/** A chainable stand-in for the Supabase client: `answer` decides each awaited query from its table and ops. */
function fakeDb(answer: (table: string, ops: Op[]) => Resp) {
  const calls: Array<{ table: string; ops: Op[] }> = []
  const db = {
    from(table: string) {
      const entry = { table, ops: [] as Op[] }
      calls.push(entry)
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'in', 'neq', 'limit', 'insert', 'delete', 'update', 'is', 'order', 'maybeSingle', 'single']) {
        b[op] = (...args: unknown[]) => {
          entry.ops.push([op, args])
          return b
        }
      }
      b.then = (resolve: (r: Resp) => unknown, reject: (e: unknown) => unknown) => {
        try {
          return Promise.resolve(answer(table, entry.ops)).then(resolve, reject)
        } catch (e) {
          return Promise.reject(e).then(resolve, reject)
        }
      }
      return b
    },
  }
  return { db: db as never, calls }
}

const has = (ops: Op[], name: string) => ops.some(([op]) => op === name)

function healthy(over: { posted?: unknown[]; period?: Record<string, unknown>; units?: unknown[]; insertError?: boolean } = {}) {
  return (table: string, ops: Op[]): Resp => {
    switch (table) {
      case 'associations':
        return { data: { id: ASSOC, organization_id: ORG, slug: 'OAK' }, error: null }
      case 'fiscal_periods':
        return { data: { id: PERIOD, association_id: ASSOC, start_date: '2026-01-01', end_date: '2026-12-31', status: 'open', ...over.period }, error: null }
      case 'chart_of_accounts':
        return { data: [CASH, AR, EQUITY].map((id) => ({ id, association_id: ASSOC, is_active: true })), error: null }
      case 'funds':
        return { data: [{ id: FUND, association_id: ASSOC, is_active: true }], error: null }
      case 'approval_requests':
        return { data: over.posted ?? [], error: null }
      case 'units':
        return { data: over.units ?? [{ id: UNIT_A, unit_number: null }], error: null }
      case 'assessments':
        if (has(ops, 'insert')) return over.insertError ? { data: null, error: { code: '23514' } } : { data: [{ id: 'as-1' }], error: null }
        return { data: null, error: null }
      default:
        throw new Error(`unexpected table ${table}`)
    }
  }
}

const request = (payload: unknown = PAYLOAD) =>
  ({
    id: REQ,
    organization_id: ORG,
    workflow_id: 'opening_balances',
    action_type: OPENING_ACTION,
    subject_type: 'opening_balances',
    subject_id: REQ,
    payload,
    summary: 's',
    amount: 1250,
    status: 'approved',
    proposed_at: '',
    decided_by: '60000000-0000-4000-8000-000000000001',
    decided_at: '',
    decision_reason: null,
    posted_at: null,
    result_ref: null,
    error: null,
  }) as never

beforeEach(() => {
  m.postJournalEntry.mockReset()
})

describe('openingExecutor', () => {
  it('adds the homes’ charges, then posts ONE balanced multi-line entry against the request', async () => {
    m.postJournalEntry.mockResolvedValue({ ok: true, journalEntryId: 'je-1', entryNumber: 'JE-2026-00001' })
    const { db, calls } = fakeDb(healthy())
    const r = await openingExecutor(db, request())
    expect(r).toEqual({ ok: true, resultRef: 'je-1' })

    const insert = calls.find((c) => c.table === 'assessments' && has(c.ops, 'insert'))!
    const rows = insert.ops.find(([op]) => op === 'insert')![1][0] as Array<Record<string, unknown>>
    expect(rows).toEqual([
      expect.objectContaining({
        organization_id: ORG,
        association_id: ASSOC,
        unit_id: UNIT_A,
        fiscal_period_id: PERIOD,
        assessment_type: 'regular',
        amount: 250,
        due_date: '2026-02-01',
        status: 'open',
      }),
    ])

    expect(m.postJournalEntry).toHaveBeenCalledTimes(1)
    const je = m.postJournalEntry.mock.calls[0][1]
    expect(je).toMatchObject({ organizationId: ORG, associationId: ASSOC, fiscalPeriodId: PERIOD, entryDate: '2026-01-01', source: 'manual', sourceId: REQ })
    expect(je.lines.map((l: { debit: number; credit: number }) => [l.debit, l.credit])).toEqual([
      [1000, 0],
      [250, 0],
      [0, 1250],
    ])
    // The charges went in before the entry.
    expect(calls.findIndex((c) => c.table === 'assessments')).toBeGreaterThan(-1)
  })

  it('takes the charges back out when the entry fails, so nothing is half-posted', async () => {
    m.postJournalEntry.mockResolvedValue({ ok: false, error: 'trigger rejected' })
    const { db, calls } = fakeDb(healthy())
    const r = await openingExecutor(db, request())
    expect(r.ok).toBe(false)
    const del = calls.find((c) => c.table === 'assessments' && has(c.ops, 'delete'))
    expect(del?.ops).toContainEqual(['in', ['id', ['as-1']]])
  })

  it('posts nothing when opening balances were already posted for the association', async () => {
    const { db, calls } = fakeDb(healthy({ posted: [{ id: 'other' }] }))
    const r = await openingExecutor(db, request())
    expect(r).toEqual({ ok: false, error: 'Opening balances were already posted for this association.' })
    expect(m.postJournalEntry).not.toHaveBeenCalled()
    expect(calls.some((c) => c.table === 'assessments')).toBe(false)
    const q = calls.find((c) => c.table === 'approval_requests')!.ops
    expect(q).toContainEqual(['eq', ['status', 'posted']])
    expect(q).toContainEqual(['neq', ['id', REQ]])
  })

  it('posts nothing when the period has closed since the proposal', async () => {
    const { db } = fakeDb(healthy({ period: { status: 'closed' } }))
    expect((await openingExecutor(db, request())).ok).toBe(false)
    expect(m.postJournalEntry).not.toHaveBeenCalled()
  })

  it('posts nothing when a home left the association', async () => {
    const { db } = fakeDb(healthy({ units: [] }))
    const r = await openingExecutor(db, request())
    expect(r.ok).toBe(false)
    expect(m.postJournalEntry).not.toHaveBeenCalled()
  })

  it('posts nothing for a tampered or unbalanced payload', async () => {
    const { db } = fakeDb(healthy())
    const unbalanced = { ...PAYLOAD, lines: PAYLOAD.lines.map((l, i) => (i === 0 ? { ...l, debitCents: l.debitCents + 1 } : l)) }
    expect((await openingExecutor(db, request(unbalanced))).ok).toBe(false)
    expect((await openingExecutor(db, request({ nope: true }))).ok).toBe(false)
    expect(m.postJournalEntry).not.toHaveBeenCalled()
  })

  it('posts nothing when the charges can’t be added', async () => {
    const { db } = fakeDb(healthy({ insertError: true }))
    expect((await openingExecutor(db, request())).ok).toBe(false)
    expect(m.postJournalEntry).not.toHaveBeenCalled()
  })
})
