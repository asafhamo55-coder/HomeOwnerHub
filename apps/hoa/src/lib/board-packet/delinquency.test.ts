import { describe, expect, it } from 'vitest'
import { summarizeDelinquency, type OverdueChargeRow } from './delinquency'

const ET = 'America/New_York'
const PT = 'America/Los_Angeles'

const row = (o: Partial<OverdueChargeRow> & Pick<OverdueChargeRow, 'amount' | 'due_date'>): OverdueChargeRow => ({
  unit_id: 'u1',
  status: 'open',
  payments: [],
  unit: { unit_number: 'Unit 1', address_line1: '1 Demo Way' },
  ...o,
})

const paid = (amount: number | string, paid_at = '2026-09-10T15:00:00Z') => ({ amount, paid_at })

describe('summarizeDelinquency', () => {
  const asOf = '2026-10-16'

  it('a charge due on the as-of day is not late; due the day before is', () => {
    const s = summarizeDelinquency([row({ amount: 100, due_date: asOf }), row({ amount: 50, due_date: '2026-10-15' })], asOf, ET)
    expect(s.totalOverdue).toBe(50)
    expect(s.chargeCount).toBe(1)
  })

  it('subtracts partial payments and drops charges paid in full', () => {
    const s = summarizeDelinquency(
      [
        row({ amount: '300.00', due_date: '2026-09-01', status: 'partial', payments: [paid('100.00')] }),
        row({ amount: 200, due_date: '2026-09-01', status: 'paid', payments: [paid(200)], unit_id: 'u2' }),
      ],
      asOf,
      ET,
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
      ET,
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
      ET,
    )
    expect(s.aging).toEqual({ d1_30: 1, d31_60: 2, d61_90: 4, d90_plus: 8 })
    expect(s.totalOverdue).toBe(15)
  })

  it('a charge with no unit is listed on its own, never merged into another', () => {
    const s = summarizeDelinquency(
      [row({ amount: 10, due_date: '2026-09-01', unit_id: null, unit: null }), row({ amount: 20, due_date: '2026-09-01', unit_id: null, unit: null })],
      asOf,
      ET,
    )
    expect(s.unitCount).toBe(2)
    expect(s.units[0]!.label).toBe('Unit not recorded')
  })

  it('nothing overdue is a real zero, with an empty unit list', () => {
    expect(summarizeDelinquency([], asOf, ET)).toEqual({
      asOf,
      totalOverdue: 0,
      unitCount: 0,
      chargeCount: 0,
      aging: { d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 },
      units: [],
    })
  })
})

/**
 * BL-051: the packet reports delinquency at the close of the packet month
 * (September 2026 → measured at the start of Oct 1), not today. Every
 * fixture here has activity AFTER Sep 30 that a "current balance" would
 * pick up.
 */
describe('summarizeDelinquency — as of the close of the packet month', () => {
  const after = '2026-10-01' // packetPeriod('2026-10-14').after

  it('charges due after month-end are left out; one due on the last day is in', () => {
    const s = summarizeDelinquency(
      [
        row({ amount: 40, due_date: '2026-09-30' }),
        row({ amount: 300, due_date: '2026-10-01' }),
        row({ amount: 500, due_date: '2026-10-10' }),
      ],
      after,
      ET,
    )
    expect(s.totalOverdue).toBe(40)
    expect(s.chargeCount).toBe(1)
    expect(s.units[0]!.daysOverdue).toBe(1)
  })

  it('a payment made after month-end does not reduce the month-end balance', () => {
    const s = summarizeDelinquency(
      [row({ amount: 300, due_date: '2026-09-01', status: 'partial', payments: [paid(100, '2026-09-20T16:00:00Z'), paid(150, '2026-10-05T16:00:00Z')] })],
      after,
      ET,
    )
    expect(s.totalOverdue).toBe(200)
  })

  it('a charge paid in full after month-end was still delinquent at month-end', () => {
    const s = summarizeDelinquency(
      [row({ amount: 325, due_date: '2026-08-01', status: 'paid', payments: [paid(325, '2026-10-12T14:00:00Z')] })],
      after,
      ET,
    )
    expect(s.totalOverdue).toBe(325)
    expect(s.aging.d61_90).toBe(325)
  })

  it('a "paid" charge with no recorded payment is treated as settled (date unknown)', () => {
    // Imported books mark old charges paid with no payments row.
    const s = summarizeDelinquency([row({ amount: 49.5, due_date: '2024-01-01', status: 'paid', payments: [] })], after, ET)
    expect(s.totalOverdue).toBe(0)
  })

  it('a "paid" charge settled partly before and partly after month-end owes only the later part', () => {
    const s = summarizeDelinquency(
      [row({ amount: 300, due_date: '2026-09-01', status: 'paid', payments: [paid(100, '2026-09-15T16:00:00Z'), paid(200, '2026-10-03T16:00:00Z')] })],
      after,
      ET,
    )
    expect(s.totalOverdue).toBe(200)
  })

  it('which day a payment falls on is the association’s day, not UTC', () => {
    // 2026-10-01T02:30Z is 10:30pm Sep 30 in New York and 7:30pm in LA:
    // it counts toward September in both. 2026-10-01T05:30Z is 1:30am Oct 1
    // in New York (too late) but still 10:30pm Sep 30 in LA.
    const late = row({ amount: 100, due_date: '2026-09-01', payments: [paid(100, '2026-10-01T02:30:00Z')] })
    const later = row({ amount: 100, due_date: '2026-09-01', unit_id: 'u2', payments: [paid(100, '2026-10-01T05:30:00Z')] })
    expect(summarizeDelinquency([late, later], after, ET).totalOverdue).toBe(100)
    expect(summarizeDelinquency([late, later], after, PT).totalOverdue).toBe(0)
  })

  it('does not depend on the process time zone', () => {
    const tz = process.env.TZ
    const rows = [
      row({ amount: 100, due_date: '2026-09-30', payments: [paid(60, '2026-10-01T03:59:00Z')] }), // 11:59pm Sep 30 ET
      row({ amount: 100, due_date: '2026-09-30', unit_id: 'u2', payments: [paid(60, '2026-10-01T04:00:00Z')] }), // midnight Oct 1 ET
    ]
    try {
      for (const zone of ['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
        process.env.TZ = zone
        expect(summarizeDelinquency(rows, after, ET).totalOverdue).toBe(140)
      }
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })
})
