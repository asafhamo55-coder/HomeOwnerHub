import { describe, expect, it } from 'vitest'
import {
  buildLedger,
  loadLedgerRows,
  paymentDay,
  statementWindow,
  type LedgerAssessment,
  type LedgerPayment,
} from './resident-ledger'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'

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

describe('loadLedgerRows — server row cap (BL-047)', () => {
  it('flags a ledger the server capped at 1000 rows as truncated', async () => {
    const assessments = Array.from({ length: 1200 }, (_, i) => ({
      id: `a${String(i).padStart(5, '0')}`,
      unit_id: 'u1',
      deleted_at: null,
      amount: 10,
      due_date: '2026-01-01',
      status: 'open',
      assessment_type: 'regular',
      memo_code: null,
    }))
    const { db } = cappedFakeDb({ assessments, payments: [] })
    const r = await loadLedgerRows(db as never, ['u1'])
    expect(r.ok && r.truncated).toBe(true)
  })

  it('a ledger under the cap is not truncated', async () => {
    const { db } = cappedFakeDb({ assessments: [], payments: [] })
    const r = await loadLedgerRows(db as never, ['u1'])
    expect(r.ok && !r.truncated).toBe(true)
  })
})

describe('buildLedger — payments dated on the association day (BL-043)', () => {
  it('a 22:15 Eastern payment posts to that day, not the next UTC day', () => {
    const { entries } = buildLedger(
      [charge({ id: 'a1', due_date: '2026-10-01', amount: 325 })],
      [pay({ id: 'p1', paid_at: '2026-10-02T02:15:00+00:00', amount: 325, assessment_id: 'a1' })],
      'America/New_York',
    )
    expect(entries.find((e) => e.id === 'p1')?.date).toBe('2026-10-01')
  })

  it('a 23:30 Eastern payment on the fall-back night stays on Nov 1', () => {
    const { entries } = buildLedger(
      [],
      [pay({ id: 'p1', paid_at: '2026-11-02T04:30:00Z', amount: 10 })],
      'America/New_York',
    )
    expect(entries[0].date).toBe('2026-11-01')
  })

  it('the same instant is a different day for a Pacific association', () => {
    const paid = [pay({ id: 'p1', paid_at: '2026-10-02T06:30:00Z', amount: 10 })] // 02:30 EDT / 23:30 PDT
    expect(buildLedger([], paid, 'America/New_York').entries[0].date).toBe('2026-10-02')
    expect(buildLedger([], paid, 'America/Los_Angeles').entries[0].date).toBe('2026-10-01')
  })

  it('a legacy bank-matched paid_at at exact UTC midnight keeps its face date', () => {
    // bank-rec / W18 wrote posted_date as UTC midnight before BL-043.
    expect(paymentDay('2026-10-01T00:00:00+00:00', 'America/New_York')).toBe('2026-10-01')
    expect(paymentDay('2026-10-01T00:00:00.000Z', 'America/Los_Angeles')).toBe('2026-10-01')
    expect(paymentDay('2026-10-01 00:00:00+00', 'America/New_York')).toBe('2026-10-01')
    // …and the noon-UTC form they write now is the same day everywhere in the US.
    expect(paymentDay('2026-10-01T12:00:00Z', 'Pacific/Honolulu')).toBe('2026-10-01')
    expect(paymentDay('2026-10-01T12:00:00Z', 'America/New_York')).toBe('2026-10-01')
    // One second later is an instant again.
    expect(paymentDay('2026-10-01T00:00:01Z', 'America/New_York')).toBe('2026-09-30')
  })

  it('a date-only paid_at is a calendar date and is kept as-is', () => {
    const { entries } = buildLedger([], [pay({ id: 'p1', paid_at: '2026-10-01', amount: 10 })], 'Pacific/Honolulu')
    expect(entries[0].date).toBe('2026-10-01')
  })
})

describe('buildLedger: unapplied credit (BL-177)', () => {
  const credit = { id: 'c1', unit_id: U1, remaining: 25, received_on: '2026-10-05', payment_method: 'check' }

  it('shows the credit as money in and takes it off the balance', () => {
    const { entries, totals } = buildLedger([charge({ id: 'a1', due_date: '2026-10-01', amount: 100, status: 'paid' })], [pay({ id: 'p1', paid_at: '2026-10-05T15:00:00Z', amount: 100, assessment_id: 'a1' })], 'America/New_York', [credit])
    const c = entries.find((e) => e.kind === 'credit')!
    expect(c).toMatchObject({ description: 'Unapplied credit · Check', payment: 25 })
    expect(entries.at(-1)!.balance).toBe(-25)
    expect(totals).toMatchObject({ credits: 25, balance: -25 })
  })
  it('ignores a used-up credit, and without credits the ledger is unchanged', () => {
    const a = [charge({ id: 'a1', due_date: '2026-10-01', amount: 100 })]
    expect(buildLedger(a, [], 'America/New_York', [{ ...credit, remaining: 0 }])).toEqual(buildLedger(a, [], 'America/New_York'))
  })
})
