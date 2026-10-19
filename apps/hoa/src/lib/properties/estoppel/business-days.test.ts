import { describe, expect, it } from 'vitest'
import { addBusinessDays, addCalendarDays, addMonths, holidayOn, holidaysBetween, isBusinessDay, isIsoDay, usFederalHolidays } from './business-days'

describe('usFederalHolidays', () => {
  it('lists the 2026 holidays on their observed days', () => {
    expect(usFederalHolidays(2026).map((h) => h.day)).toEqual([
      '2026-01-01',
      '2026-01-19', // MLK: 3rd Monday
      '2026-02-16', // Washington's Birthday: 3rd Monday
      '2026-05-25', // Memorial Day: last Monday
      '2026-06-19',
      '2026-07-03', // July 4 is a Saturday: observed Friday
      '2026-09-07', // Labor Day: 1st Monday
      '2026-10-12', // Columbus Day: 2nd Monday
      '2026-11-11',
      '2026-11-26', // Thanksgiving: 4th Thursday
      '2026-12-25',
    ])
  })

  it('moves a Sunday holiday to Monday and a Saturday New Year to Dec 31 of the year before', () => {
    expect(holidayOn('2027-07-05')?.name).toBe('Independence Day') // Jul 4 2027 is a Sunday
    expect(holidayOn('2027-12-24')?.name).toBe('Christmas Day') // Dec 25 2027 is a Saturday
    expect(holidayOn('2027-12-31')?.name).toBe('New Year’s Day (observed)') // Jan 1 2028 is a Saturday
    expect(usFederalHolidays(2028).some((h) => h.day === '2028-01-01')).toBe(false)
  })
})

describe('isBusinessDay', () => {
  it('skips weekends and federal holidays', () => {
    expect(isBusinessDay('2026-10-09')).toBe(true) // Friday
    expect(isBusinessDay('2026-10-10')).toBe(false) // Saturday
    expect(isBusinessDay('2026-10-11')).toBe(false) // Sunday
    expect(isBusinessDay('2026-10-12')).toBe(false) // Columbus Day
    expect(isBusinessDay('2026-10-13')).toBe(true)
  })
})

describe('addBusinessDays', () => {
  it('counts 10 business days across a weekend and Columbus Day', () => {
    // Fri Oct 9 request. Sat, Sun and Mon Oct 12 (holiday) don't count:
    // Oct 13,14,15,16, 19,20,21,22,23, 26.
    expect(addBusinessDays('2026-10-09', 10)).toBe('2026-10-26')
    expect(holidaysBetween('2026-10-09', '2026-10-26').map((h) => h.name)).toEqual(['Columbus Day'])
  })

  it('counts 3 business days across Thanksgiving and a weekend', () => {
    // Wed Nov 25: Thu 26 is Thanksgiving; Fri 27 (1), Mon 30 (2), Tue Dec 1 (3).
    expect(addBusinessDays('2026-11-25', 3)).toBe('2026-12-01')
  })

  it('skips an observed holiday (July 4 on a Saturday is observed Friday July 3)', () => {
    expect(addBusinessDays('2026-07-02', 1)).toBe('2026-07-06')
  })

  it('never counts the start day, and 0 is the start day', () => {
    expect(addBusinessDays('2026-10-19', 1)).toBe('2026-10-20')
    expect(addBusinessDays('2026-10-17', 1)).toBe('2026-10-19') // a Saturday request
    expect(addBusinessDays('2026-10-19', 0)).toBe('2026-10-19')
    expect(() => addBusinessDays('2026-10-19', -1)).toThrow()
  })

  it('crosses a year end with Christmas and New Year', () => {
    // Thu Dec 24 2026: Fri 25 holiday; Mon 28 (1), 29, 30, 31 (4), Fri Jan 1 holiday, Mon Jan 4 (5).
    expect(addBusinessDays('2026-12-24', 5)).toBe('2027-01-04')
  })
})

describe('calendar helpers', () => {
  it('adds days and months without zone drift', () => {
    expect(addCalendarDays('2026-10-19', 30)).toBe('2026-11-18')
    expect(addCalendarDays('2026-10-19', 35)).toBe('2026-11-23')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-11-01', 3)).toBe('2027-02-01')
  })

  it('validates days', () => {
    expect(isIsoDay('2026-02-29')).toBe(false)
    expect(isIsoDay('2028-02-29')).toBe(true)
    expect(isIsoDay('10/19/2026')).toBe(false)
  })
})
