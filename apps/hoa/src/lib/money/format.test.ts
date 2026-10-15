import { describe, expect, it } from 'vitest'
import { daysSince, formatDay, formatDayRange, periodLabel, usd, usdSigned } from './format'

describe('money format', () => {
  it('formats USD with and without cents', () => {
    expect(usd(1234.5)).toBe('$1,234.50')
    expect(usd(1234.5, { whole: true })).toBe('$1,235')
    expect(usd(-12)).toBe('-$12.00')
    expect(usd(-0.0000001)).toBe('$0.00')
    expect(usd(null)).toBe('—')
    expect(usdSigned(12)).toBe('+$12.00')
    expect(usdSigned(-12)).toBe('-$12.00')
    expect(usdSigned(0)).toBe('$0.00')
  })

  it('formats calendar dates without a time-zone shift', () => {
    // new Date('2026-01-01') is Dec 31 in every US zone; formatDay must not be.
    expect(formatDay('2026-01-01')).toBe('Jan 1, 2026')
    expect(formatDay('2026-12-31', 'year')).toBe('2026')
    expect(formatDay('2026-10-01', 'month')).toBe('October 2026')
    expect(formatDay(null)).toBe('—')
    expect(formatDay('garbage')).toBe('—')
  })

  it('names periods', () => {
    expect(periodLabel({ start_date: '2026-01-01', end_date: '2026-12-31' })).toBe('FY 2026')
    expect(periodLabel({ start_date: '2026-07-01', end_date: '2027-06-30' })).toBe('Jul 1, 2026 – Jun 30, 2027')
    expect(formatDayRange('2026-01-01', '2026-03-31')).toBe('Jan 1 – Mar 31, 2026')
  })

  it('counts days between calendar dates', () => {
    expect(daysSince('2026-10-01', '2026-10-15')).toBe(14)
    expect(daysSince('2026-10-15', '2026-10-15')).toBe(0)
  })
})
