import { describe, expect, it } from 'vitest'
import { buildLedger, statementWindow, type LedgerAssessment, type LedgerPayment } from './resident-ledger'

const U1 = 'unit-1'

function charge(p: Partial<LedgerAssessment> & { id: string; due_date: string; amount: number }): LedgerAssessment {
  return {
    unit_id: U1,
    status: 'open',
    assessment_type: 'regular',
    memo_code: null,
    ...p,
  }
}

function pay(p: Partial<LedgerPayment> & { id: string; paid_at: string; amount: number }): LedgerPayment {
  return { unit_id: U1, assessment_id: null, payment_method: 'zelle_assisted', ...p }
}

describe('buildLedger', () => {
  it('orders by date and carries a running balance', () => {
    const { entries, totals } = buildLedger(
      [
        charge({ id: 'a2', due_date: '2026-09-01', amount: 325, status: 'paid' }),
        charge({ id: 'a1', due_date: '2026-08-01', amount: 325, status: 'paid' }),
        charge({ id: 'a3', due_date: '2026-10-01', amount: 325 }),
      ],
      [
        pay({ id: 'p1', paid_at: '2026-08-03T15:00:00Z', amount: 325, assessment_id: 'a1' }),
        pay({ id: 'p2', paid_at: '2026-09-02T09:00:00Z', amount: 325, assessment_id: 'a2', payment_method: 'check' }),
      ],
    )
    expect(entries.map((e) => [e.id, e.date, e.charge, e.payment, e.balance])).toEqual([
      ['a1', '2026-08-01', 325, null, 325],
      ['p1', '2026-08-03', null, 325, 0],
      ['a2', '2026-09-01', 325, null, 325],
      ['p2', '2026-09-02', null, 325, 0],
      ['a3', '2026-10-01', 325, null, 325],
    ])
    expect(entries.map((e) => e.description)).toEqual([
      'Regular dues',
      'Payment · Zelle',
      'Regular dues',
      'Payment · Check',
      'Regular dues',
    ])
    expect(totals).toEqual({ charges: 975, payments: 650, credits: 0, balance: 325 })
  })

  it('puts a charge before a payment on the same day', () => {
    const { entries } = buildLedger(
      [charge({ id: 'a1', due_date: '2026-10-01', amount: 100 })],
      [pay({ id: 'p1', paid_at: '2026-10-01T00:00:00Z', amount: 100, assessment_id: 'a1' })],
    )
    expect(entries.map((e) => e.id)).toEqual(['a1', 'p1'])
    expect(entries[1]!.balance).toBe(0)
  })

  it('credits the unpaid remainder of a waived or written-off charge, so the balance stays true', () => {
    const { entries, totals } = buildLedger(
      [
        charge({ id: 'fee', due_date: '2026-09-20', amount: 25, assessment_type: 'late_fee', status: 'waived' }),
        charge({ id: 'old', due_date: '2026-01-01', amount: 300, status: 'written_off' }),
      ],
      [pay({ id: 'p', paid_at: '2026-02-01T00:00:00Z', amount: 100, assessment_id: 'old' })],
    )
    const credits = entries.filter((e) => e.kind === 'credit')
    expect(credits.map((c) => [c.description, c.payment])).toEqual([
      ['Written off · Regular dues', 200],
      ['Waived · Late fee', 25],
    ])
    expect(totals).toEqual({ charges: 325, payments: 100, credits: 225, balance: 0 })
    expect(entries.at(-1)!.balance).toBe(0)
  })

  it('evens out a charge W18 marked paid within its $0.50 tolerance', () => {
    const { totals, entries } = buildLedger(
      [charge({ id: 'a', due_date: '2026-10-01', amount: 300, status: 'paid' })],
      [pay({ id: 'p', paid_at: '2026-10-02T00:00:00Z', amount: 299.6, assessment_id: 'a' })],
    )
    expect(entries.find((e) => e.kind === 'credit')).toMatchObject({ description: 'Adjustment · Regular dues', payment: 0.4 })
    expect(totals.balance).toBe(0)
  })

  it('shows an overpayment as a credit balance and does not invent an adjustment for it', () => {
    const { totals, entries } = buildLedger(
      [charge({ id: 'a', due_date: '2026-10-01', amount: 300, status: 'paid' })],
      [pay({ id: 'p', paid_at: '2026-10-02T00:00:00Z', amount: 350, assessment_id: 'a' })],
    )
    expect(entries.filter((e) => e.kind === 'credit')).toEqual([])
    expect(totals.balance).toBe(-50)
  })

  it('avoids floating-point drift across many cents', () => {
    const assessments = Array.from({ length: 10 }, (_, i) =>
      charge({ id: `a${i}`, due_date: `2026-01-${String(i + 10)}`, amount: 0.1, status: 'paid' }),
    )
    const payments = assessments.map((a, i) =>
      pay({ id: `p${i}`, paid_at: `${a.due_date}T12:00:00Z`, amount: 0.1, assessment_id: a.id }),
    )
    const { totals } = buildLedger(assessments, payments)
    expect(totals).toEqual({ charges: 1, payments: 1, credits: 0, balance: 0 })
  })

  it('tags each entry with its unit so a multi-unit owner can tell rows apart', () => {
    const { entries } = buildLedger(
      [charge({ id: 'a', due_date: '2026-10-01', amount: 10, unit_id: 'unit-2' })],
      [pay({ id: 'p', paid_at: '2026-10-02T00:00:00Z', amount: 10, unit_id: null, assessment_id: 'a' })],
    )
    expect(entries.map((e) => e.unitId)).toEqual(['unit-2', 'unit-2'])
  })
})

describe('statementWindow', () => {
  const ledger = buildLedger(
    [
      charge({ id: 'a1', due_date: '2025-06-01', amount: 300, status: 'partial' }),
      charge({ id: 'a2', due_date: '2026-09-01', amount: 325 }),
    ],
    [
      pay({ id: 'p1', paid_at: '2025-06-05T00:00:00Z', amount: 100, assessment_id: 'a1' }),
      pay({ id: 'p2', paid_at: '2026-09-03T00:00:00Z', amount: 25, assessment_id: 'a2' }),
    ],
  )

  it('carries everything before the start date forward as one opening balance', () => {
    const w = statementWindow(ledger, '2026-01-01')
    expect(w.openingBalance).toBe(200)
    expect(w.entries.map((e) => e.id)).toEqual(['a2', 'p2'])
    expect(w.closingBalance).toBe(500)
    expect(w.closingBalance).toBe(ledger.totals.balance)
    expect(w.totals).toEqual({ charges: 325, payments: 25, credits: 0 })
  })

  it('with no earlier history opens at zero', () => {
    const w = statementWindow(ledger, '2000-01-01')
    expect(w.openingBalance).toBe(0)
    expect(w.entries).toHaveLength(4)
  })

  it('a window after the last entry shows only the balance forward', () => {
    const w = statementWindow(ledger, '2027-01-01')
    expect(w).toMatchObject({ openingBalance: 500, entries: [], closingBalance: 500 })
  })
})
