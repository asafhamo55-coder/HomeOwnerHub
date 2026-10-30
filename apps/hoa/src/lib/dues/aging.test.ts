import { describe, it, expect } from 'vitest'
import { agingForCharges, bucketForDaysPastDue, parseAgingParam, summarizeAging } from './aging'

describe('bucketForDaysPastDue', () => {
  it.each([
    [0, 'current'],
    [1, '1-30'],
    [30, '1-30'],
    [31, '31-60'],
    [60, '31-60'],
    [61, '61-90'],
    [90, '61-90'],
    [91, '90+'],
    [-5, 'current'],
  ])('%i days is %s', (days, bucket) => {
    expect(bucketForDaysPastDue(days)).toBe(bucket)
  })
})

describe('agingForCharges', () => {
  it('uses the oldest unpaid charge', () => {
    const r = agingForCharges(
      [
        { dueDate: '2026-09-01', balance: 100 },
        { dueDate: '2026-06-01', balance: 50 },
      ],
      '2026-10-30',
    )
    expect(r).toEqual({ bucket: '90+', daysPastDue: 151 })
  })

  it('counts calendar days across the spring DST change', () => {
    // US clocks jump forward on 2026-03-08; that day is 23 hours long.
    expect(agingForCharges([{ dueDate: '2026-03-07', balance: 10 }], '2026-04-06')).toEqual({
      bucket: '1-30',
      daysPastDue: 30,
    })
    expect(agingForCharges([{ dueDate: '2026-03-07', balance: 10 }], '2026-04-07')?.bucket).toBe('31-60')
  })

  it('counts calendar days across the fall DST change', () => {
    // 2026-11-01 is 25 hours long.
    expect(agingForCharges([{ dueDate: '2026-10-31', balance: 10 }], '2026-11-30')?.daysPastDue).toBe(30)
    expect(agingForCharges([{ dueDate: '2026-10-31', balance: 10 }], '2026-12-01')?.bucket).toBe('31-60')
  })

  it('a charge due today is current, a future one too', () => {
    expect(agingForCharges([{ dueDate: '2026-10-30', balance: 10 }], '2026-10-30')?.bucket).toBe('current')
    expect(agingForCharges([{ dueDate: '2026-11-15', balance: 10 }], '2026-10-30')).toEqual({
      bucket: 'current',
      daysPastDue: 0,
    })
  })

  it('returns null for a unit with credit only', () => {
    expect(agingForCharges([{ dueDate: '2026-01-01', balance: -40 }], '2026-10-30')).toBeNull()
  })

  it('returns null when everything is paid', () => {
    expect(agingForCharges([{ dueDate: '2026-01-01', balance: 0 }], '2026-10-30')).toBeNull()
    expect(agingForCharges([], '2026-10-30')).toBeNull()
  })

  it('ignores a credit line when a real charge is open', () => {
    expect(
      agingForCharges(
        [
          { dueDate: '2026-01-01', balance: -40 },
          { dueDate: '2026-10-20', balance: 25 },
        ],
        '2026-10-30',
      ),
    ).toEqual({ bucket: '1-30', daysPastDue: 10 })
  })
})

describe('summarizeAging', () => {
  it('has every bucket, zero when empty', () => {
    const s = summarizeAging([])
    expect(Object.keys(s)).toEqual(['current', '1-30', '31-60', '61-90', '90+'])
    expect(s['90+']).toEqual({ count: 0, total: 0 })
  })
  it('sums counts and dollars', () => {
    const s = summarizeAging([
      { bucket: '1-30', amount: 100.1 },
      { bucket: '1-30', amount: 200.2 },
      { bucket: 'current', amount: 50 },
    ])
    expect(s['1-30']).toEqual({ count: 2, total: 300.3 })
    expect(s.current.count).toBe(1)
  })
})

describe('parseAgingParam', () => {
  it('accepts known buckets only', () => {
    expect(parseAgingParam('31-60')).toBe('31-60')
    expect(parseAgingParam(['90+', 'x'])).toBe('90+')
    expect(parseAgingParam('bogus')).toBeNull()
    expect(parseAgingParam(undefined)).toBeNull()
  })
})
