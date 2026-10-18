import { describe, expect, it } from 'vitest'
import { MONTHLY_REPORT_CRON, isCompleteMonth, previousMonthIn, reportMonthOf } from './period'

/**
 * BL-073: the month-end report covers the previous CALENDAR month in the
 * association's own zone. Every instant here is pinned; nothing reads the
 * clock or the process zone.
 */

describe('MONTHLY_REPORT_CRON', () => {
  it('fires at 08:00 Eastern on the 1st of every month', () => {
    expect(MONTHLY_REPORT_CRON).toBe('TZ=America/New_York 0 8 1 * *')
  })
})

describe('reportMonthOf', () => {
  it('spells out a month: first day, last day, the day after, and a label', () => {
    expect(reportMonthOf('2026-09')).toEqual({
      month: '2026-09',
      start: '2026-09-01',
      end: '2026-09-30',
      after: '2026-10-01',
      label: 'September 2026',
    })
  })

  it('rolls December into the next year', () => {
    expect(reportMonthOf('2026-12')).toMatchObject({ end: '2026-12-31', after: '2027-01-01' })
  })

  it('knows leap Februaries', () => {
    expect(reportMonthOf('2028-02')?.end).toBe('2028-02-29')
    expect(reportMonthOf('2027-02')?.end).toBe('2027-02-28')
    expect(reportMonthOf('2100-02')?.end).toBe('2100-02-28')
  })

  it('rejects anything that is not YYYY-MM', () => {
    for (const bad of ['2026-13', '2026-00', '2026-9', '202609', '', 'September', '2026-09-01', null, undefined]) {
      expect(reportMonthOf(bad as string)).toBeNull()
    }
  })
})

describe('previousMonthIn', () => {
  // The cron instant: 08:00 EDT on Oct 1 2026 = 12:00Z.
  const cronOct = new Date('2026-10-01T12:00:00Z')

  it('at the cron instant, every US zone is already on the 1st and reports the month before', () => {
    for (const tz of ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu']) {
      expect(previousMonthIn(tz, cronOct).month).toBe('2026-09')
    }
  })

  it("uses the association's day, not the UTC day", () => {
    // 03:00Z on Oct 1 is still Sep 30 (20:00) in Los Angeles: the month
    // before LA's today is August, while New York (23:00 Sep 30) agrees.
    const instant = new Date('2026-10-01T03:00:00Z')
    expect(previousMonthIn('America/Los_Angeles', instant).month).toBe('2026-08')
    expect(previousMonthIn('America/New_York', instant).month).toBe('2026-08')
    // An hour after midnight Eastern, New York has rolled over; LA has not.
    const later = new Date('2026-10-01T05:00:00Z')
    expect(previousMonthIn('America/New_York', later).month).toBe('2026-09')
    expect(previousMonthIn('America/Los_Angeles', later).month).toBe('2026-08')
  })

  it('reports December of last year in January', () => {
    // 08:00 EST on Jan 1 2027 = 13:00Z.
    expect(previousMonthIn('America/New_York', new Date('2027-01-01T13:00:00Z'))).toMatchObject({
      month: '2026-12',
      start: '2026-12-01',
      end: '2026-12-31',
      after: '2027-01-01',
    })
  })

  it('is unaffected by the DST change at the start of November', () => {
    // 08:00 EST on Nov 1 2026 (DST ended that night) = 13:00Z.
    expect(previousMonthIn('America/New_York', new Date('2026-11-01T13:00:00Z')).month).toBe('2026-10')
  })
})

describe('isCompleteMonth', () => {
  const sept = reportMonthOf('2026-09')!

  it('is complete once the association has reached the 1st of the next month', () => {
    expect(isCompleteMonth(sept, 'America/New_York', new Date('2026-10-01T04:30:00Z'))).toBe(true)
  })

  it('is not complete while the month is still running there', () => {
    // 23:00 Sep 30 in Los Angeles.
    expect(isCompleteMonth(sept, 'America/Los_Angeles', new Date('2026-10-01T06:00:00Z'))).toBe(false)
    expect(isCompleteMonth(reportMonthOf('2026-10')!, 'America/New_York', new Date('2026-10-17T12:00:00Z'))).toBe(false)
  })
})
