import { describe, expect, it } from 'vitest'
import { buildHeatMapMonths, formatCalendarDay } from './heat-map-grid'

// BL-065: the grid is built from calendar dates only. Nothing here reads the
// machine's clock or zone, so it answers the same under TZ=UTC and
// TZ=Pacific/Kiritimati (UTC+14, where a UTC-midnight Date is 2pm local and
// date-fns' local getters would have pushed every cell to the next day).

describe('buildHeatMapMonths', () => {
  it('starts on the month of the association today and spans three months', () => {
    const grid = buildHeatMapMonths('2026-10-01', [])
    expect(grid.months.map((m) => m.label)).toEqual(['October 2026', 'November 2026', 'December 2026'])
    expect(grid.start).toBe('2026-10-01')
    expect(grid.end).toBe('2026-12-31')
    expect(grid.months.map((m) => m.days.length)).toEqual([31, 30, 31])
  })

  it('rolls over the year end', () => {
    const grid = buildHeatMapMonths('2026-12-31', [], 3)
    expect(grid.months.map((m) => m.label)).toEqual(['December 2026', 'January 2027', 'February 2027'])
    expect(grid.end).toBe('2027-02-28')
  })

  it('pads to the weekday of the 1st (Sun = 0)', () => {
    // Oct 1 2026 is a Thursday; Nov 1 2026 a Sunday; Feb 1 2026 a Sunday.
    const grid = buildHeatMapMonths('2026-10-17', [])
    expect(grid.months.map((m) => m.leadingBlanks)).toEqual([4, 0, 2])
  })

  it('places each cell on its own calendar day and marks today', () => {
    const grid = buildHeatMapMonths('2026-10-01', [
      { day: '2026-10-01', level: 'yellow', notes: ['dues due within 3 days'] },
      { day: '2026-11-30', level: 'red', notes: ['x'] },
    ])
    const oct = grid.months[0]!.days
    expect(oct[0]).toMatchObject({ day: '2026-10-01', dayOfMonth: 1, level: 'yellow', isToday: true })
    expect(oct[1]).toMatchObject({ day: '2026-10-02', level: 'grey', isToday: false })
    expect(oct.filter((d) => d.isToday)).toHaveLength(1)
    const nov = grid.months[1]!.days
    expect(nov[29]).toMatchObject({ day: '2026-11-30', dayOfMonth: 30, level: 'red' })
  })
})

describe('formatCalendarDay', () => {
  it('formats the calendar date, never shifted by a zone', () => {
    expect(formatCalendarDay('2026-10-01', 'medium')).toBe('Oct 1, 2026')
    expect(formatCalendarDay('2026-12-31', 'month')).toBe('Dec')
    expect(formatCalendarDay('2027-02-28', 'monthYear')).toBe('Feb 2027')
  })
})
