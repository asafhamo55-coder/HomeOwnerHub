import { describe, expect, it } from 'vitest'
import { summarizeDelinquency, type OverdueChargeRow } from './delinquency'

const row = (o: Partial<OverdueChargeRow> & Pick<OverdueChargeRow, 'amount' | 'due_date'>): OverdueChargeRow => ({
  unit_id: 'u1',
  payments: [],
  unit: { unit_number: 'Unit 1', address_line1: '1 Demo Way' },
  ...o,
})

describe('summarizeDelinquency', () => {
  const asOf = '2026-10-16'

  it('a charge due today is not late; due yesterday is', () => {
    const s = summarizeDelinquency([row({ amount: 100, due_date: asOf }), row({ amount: 50, due_date: '2026-10-15' })], asOf)
    expect(s.totalOverdue).toBe(50)
    expect(s.chargeCount).toBe(1)
  })

  it('subtracts partial payments and drops charges paid in full', () => {
    const s = summarizeDelinquency(
      [
        row({ amount: '300.00', due_date: '2026-09-01', payments: [{ amount: '100.00' }] }),
        row({ amount: 200, due_date: '2026-09-01', payments: [{ amount: 200 }], unit_id: 'u2' }),
      ],
      asOf,
    )
    expect(s.totalOverdue).toBe(200)
    expect(s.unitCount).toBe(1)
  })

  it('groups by unit, keeps the oldest due date, and sorts largest balance first', () => {
    const s = summarizeDelinquency(
      [
        row({ amount: 100, due_date: '2026-09-01', unit_id: 'a', unit: { unit_number: 'A', address_line1: null } }),
        row({ amount: 100, due_date: '2026-07-01', unit_id: 'a', unit: { unit_number: 'A', address_line1: null } }),
        row({ amount: 500, due_date: '2026-10-01', unit_id: 'b', unit: { unit_number: 'B', address_line1: '2 Demo Way' } }),
      ],
      asOf,
    )
    expect(s.units.map((u) => [u.label, u.amount, u.charges, u.oldestDue])).toEqual([
      ['B · 2 Demo Way', 500, 1, '2026-10-01'],
      ['A', 200, 2, '2026-07-01'],
    ])
    expect(s.units[1]!.daysOverdue).toBe(107)
  })

  it('buckets by age: 1–30, 31–60, 61–90, over 90', () => {
    const s = summarizeDelinquency(
      [
        row({ amount: 1, due_date: '2026-09-16' }), // 30 days
        row({ amount: 2, due_date: '2026-09-15' }), // 31
        row({ amount: 4, due_date: '2026-07-18' }), // 90
        row({ amount: 8, due_date: '2026-07-17' }), // 91
      ],
      asOf,
    )
    expect(s.aging).toEqual({ d1_30: 1, d31_60: 2, d61_90: 4, d90_plus: 8 })
    expect(s.totalOverdue).toBe(15)
  })

  it('a charge with no unit is listed on its own, never merged into another', () => {
    const s = summarizeDelinquency(
      [row({ amount: 10, due_date: '2026-09-01', unit_id: null, unit: null }), row({ amount: 20, due_date: '2026-09-01', unit_id: null, unit: null })],
      asOf,
    )
    expect(s.unitCount).toBe(2)
    expect(s.units[0]!.label).toBe('Unit not recorded')
  })

  it('nothing overdue is a real zero, with an empty unit list', () => {
    expect(summarizeDelinquency([], asOf)).toEqual({
      asOf,
      totalOverdue: 0,
      unitCount: 0,
      chargeCount: 0,
      aging: { d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 },
      units: [],
    })
  })
})
