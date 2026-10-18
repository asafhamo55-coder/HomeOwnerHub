import { describe, expect, it } from 'vitest'
import { buildLedger } from './resident-ledger'
import { summarizeResidentDues } from './resident-dues'
import { chargeWindow, chargesFromForOwnership, scopeAssessments, scopeLedgerRows } from './resident-sale-window'

// A buyer must not see the seller's charges or payments; everyone else's
// view is unchanged. Synthetic ids.

const ZONE = 'America/New_York'
const charge = (id: string, unit_id: string, due_date: string, amount = 300, status = 'open') => ({
  id,
  unit_id,
  due_date,
  amount,
  status,
  assessment_type: 'regular',
  memo_code: null,
})
const pay = (id: string, over: { unit_id?: string | null; assessment_id?: string | null; paid_at: string; amount?: number }) => ({
  id,
  unit_id: over.unit_id ?? null,
  assessment_id: over.assessment_id ?? null,
  amount: over.amount ?? 300,
  paid_at: over.paid_at,
  payment_method: 'check',
})

// u1 was sold on 2026-10-15. Seller: Aug and Sep charges (Aug paid, Sep
// unpaid — the balance stays with the lot). Buyer: Nov charge.
const ASSESSMENTS = [charge('aug', 'u1', '2026-08-01', 300, 'paid'), charge('sep', 'u1', '2026-09-01'), charge('nov', 'u1', '2026-11-01')]
const PAYMENTS = [
  pay('p-aug', { assessment_id: 'aug', unit_id: 'u1', paid_at: '2026-08-03T15:00:00Z' }),
  pay('p-loose-seller', { unit_id: 'u1', paid_at: '2026-10-14T15:00:00Z', amount: 50 }),
  pay('p-loose-buyer', { unit_id: 'u1', paid_at: '2026-10-16T15:00:00Z', amount: 20 }),
]

describe('chargesFromForOwnership', () => {
  it('only a sale ownership sets a window; imports, invites and manual entries do not', () => {
    expect(chargesFromForOwnership({ valid_from: '2026-10-15', source: 'sale' })).toBe('2026-10-15')
    for (const source of ['csv_import', 'member_invite', 'manual', null, undefined]) {
      expect(chargesFromForOwnership({ valid_from: '2026-10-15', source })).toBeNull()
    }
  })

  it('units without a window are not in the map', () => {
    const w = chargeWindow([
      { unit_id: 'u1', charges_from: '2026-10-15' },
      { unit_id: 'u2', charges_from: null },
      { unit_id: 'u3' },
    ])
    expect([...w]).toEqual([['u1', '2026-10-15']])
  })
})

describe('the buyer cannot see seller-era charges', () => {
  const buyerWindow = chargeWindow([{ unit_id: 'u1', charges_from: '2026-10-15' }])

  it('dues: the seller’s unpaid September charge is not the buyer’s to see or pay', () => {
    const open = ASSESSMENTS.filter((a) => a.status === 'open')
    const dues = summarizeResidentDues(scopeAssessments(open, buyerWindow), new Map(), '2026-10-17')
    expect(dues.charges.map((c) => c.id)).toEqual(['nov'])
    expect(dues.balance).toBe(300)
  })

  it('ledger: only charges and payments from the settlement date on; the running balance starts at zero', () => {
    const scoped = scopeLedgerRows(ASSESSMENTS, PAYMENTS, buyerWindow, ZONE)
    expect(scoped.assessments.map((a) => a.id)).toEqual(['nov'])
    expect(scoped.payments.map((p) => p.id)).toEqual(['p-loose-buyer'])
    const ledger = buildLedger(scoped.assessments, scoped.payments, ZONE)
    expect(ledger.entries.map((e) => e.id)).toEqual(['p-loose-buyer', 'nov'])
    expect(ledger.totals).toEqual({ charges: 300, payments: 20, credits: 0, balance: 280 })
  })

  it('a payment follows its charge: one on a pre-sale charge stays hidden even if made after the sale', () => {
    const late = pay('p-sep-late', { assessment_id: 'sep', unit_id: 'u1', paid_at: '2026-10-20T15:00:00Z' })
    expect(scopeLedgerRows(ASSESSMENTS, [late], buyerWindow, ZONE).payments).toEqual([])
  })

  it('the payment day is the association’s, not UTC’s (10pm Eastern on the 14th is the 14th)', () => {
    const p = pay('p-edge', { unit_id: 'u1', paid_at: '2026-10-15T02:00:00Z' })
    expect(scopeLedgerRows([], [p], buyerWindow, ZONE).payments).toEqual([])
  })

  it('only the sold unit is windowed: the buyer’s other home shows its whole history', () => {
    const other = [charge('u2-old', 'u2', '2020-01-01')]
    expect(scopeAssessments([...ASSESSMENTS, ...other], buyerWindow).map((a) => a.id)).toEqual(['nov', 'u2-old'])
  })
})

describe('everyone else sees what they saw before', () => {
  it('no window → every row, unchanged', () => {
    const none = chargeWindow([{ unit_id: 'u1', charges_from: null }])
    const scoped = scopeLedgerRows(ASSESSMENTS, PAYMENTS, none, ZONE)
    expect(scoped.assessments).toEqual(ASSESSMENTS)
    expect(scoped.payments).toEqual(PAYMENTS)
    expect(scopeAssessments(ASSESSMENTS, none)).toEqual(ASSESSMENTS)
  })
})
