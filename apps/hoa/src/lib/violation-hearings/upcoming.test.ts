import { describe, expect, it } from 'vitest'
import {
  hearingDayText,
  hearingExpectText,
  hearingStartsAt,
  hearingSummary,
  hearingTimeText,
  hearingToUpcoming,
  isUpcomingHearing,
  nextHearingsFirst,
  noticeIsOut,
  remoteAttendanceText,
  type UpcomingHearing,
} from './upcoming'
import type { ResidentHearingView } from './rules'

const ctx = { violationId: 'v1', summary: 'trash bins', associationName: 'Maple HOA', state: 'GA', timeZone: 'America/New_York' }
const view = (over: Partial<ResidentHearingView> = {}): ResidentHearingView => ({
  status: 'scheduled',
  requestedAt: null,
  hearingOn: '2026-11-20',
  hearingTime: '18:30',
  location: 'Clubhouse',
  outcome: null,
  decidedOn: null,
  paymentDueOn: null,
  ...over,
})
const h = (over: Partial<UpcomingHearing> = {}): UpcomingHearing => ({
  ...ctx,
  hearingOn: '2026-11-20',
  hearingTime: '18:30',
  location: 'Clubhouse',
  ...over,
})

describe('hearingToUpcoming', () => {
  it('keeps a scheduled hearing with a date', () => {
    expect(hearingToUpcoming(view(), ctx)?.hearingOn).toBe('2026-11-20')
  })
  it.each(['requested', 'held', 'cancelled'] as const)('hides a %s hearing', (status) => {
    expect(hearingToUpcoming(view({ status }), ctx)).toBeNull()
  })
  it('hides a hearing with no date (notice not sent yet)', () => {
    expect(hearingToUpcoming(view({ hearingOn: null }), ctx)).toBeNull()
    expect(hearingToUpcoming(null, ctx)).toBeNull()
  })
})

describe('isUpcomingHearing (association zone)', () => {
  const zone = 'America/New_York'
  it('a hearing later today is upcoming, one earlier today is not', () => {
    // 2026-11-20 18:30 EST = 23:30Z
    expect(isUpcomingHearing({ hearingOn: '2026-11-20', hearingTime: '18:30' }, zone, new Date('2026-11-20T22:00:00Z'))).toBe(true)
    expect(isUpcomingHearing({ hearingOn: '2026-11-20', hearingTime: '18:30' }, zone, new Date('2026-11-21T00:00:00Z'))).toBe(false)
  })
  it('uses the association day, not the UTC day', () => {
    // 02:00Z on the 21st is still the evening of the 20th in New York.
    const now = new Date('2026-11-21T02:00:00Z')
    expect(isUpcomingHearing({ hearingOn: '2026-11-20', hearingTime: null }, zone, now)).toBe(true)
    expect(isUpcomingHearing({ hearingOn: '2026-11-20', hearingTime: null }, 'Pacific/Auckland', now)).toBe(false)
  })
  it('yesterday is not upcoming', () => {
    expect(isUpcomingHearing({ hearingOn: '2026-11-19', hearingTime: null }, zone, new Date('2026-11-20T15:00:00Z'))).toBe(false)
  })
})

describe('hearingStartsAt', () => {
  it('converts wall time in the zone, across daylight saving', () => {
    expect(hearingStartsAt('2026-11-20', '18:30', 'America/New_York')?.toISOString()).toBe('2026-11-20T23:30:00.000Z')
    expect(hearingStartsAt('2026-07-20', '18:30', 'America/New_York')?.toISOString()).toBe('2026-07-20T22:30:00.000Z')
    expect(hearingStartsAt('2026-11-20', '09:00', 'America/Los_Angeles')?.toISOString()).toBe('2026-11-20T17:00:00.000Z')
  })
  it('is null without a valid time', () => {
    expect(hearingStartsAt('2026-11-20', null, 'America/New_York')).toBeNull()
    expect(hearingStartsAt('2026-11-20', '25:00', 'America/New_York')).toBeNull()
  })
})

describe('nextHearingsFirst', () => {
  const now = new Date('2026-11-10T15:00:00Z')
  it('drops past hearings and sorts soonest first', () => {
    const out = nextHearingsFirst(
      [
        h({ violationId: 'late', hearingOn: '2026-12-05' }),
        h({ violationId: 'past', hearingOn: '2026-11-01' }),
        h({ violationId: 'soon', hearingOn: '2026-11-12', hearingTime: '09:00' }),
        h({ violationId: 'soon-eve', hearingOn: '2026-11-12', hearingTime: '19:00' }),
      ],
      now,
    )
    expect(out.map((x) => x.violationId)).toEqual(['soon', 'soon-eve', 'late'])
  })
  it('puts a same-day hearing with no time after a timed one', () => {
    const out = nextHearingsFirst(
      [
        h({ violationId: 'notime', hearingOn: '2026-11-12', hearingTime: null }),
        h({ violationId: 'timed', hearingOn: '2026-11-12', hearingTime: '20:00' }),
      ],
      now,
    )
    expect(out.map((x) => x.violationId)).toEqual(['timed', 'notime'])
  })
})

describe('copy', () => {
  it('formats time and day', () => {
    expect(hearingTimeText('18:30')).toBe('6:30 PM')
    expect(hearingTimeText('00:05')).toBe('12:05 AM')
    expect(hearingTimeText('12:00')).toBe('12:00 PM')
    expect(hearingTimeText(null)).toBeNull()
    expect(hearingDayText('2026-11-17')).toBe('Tuesday, November 17')
  })
  it('summary is plain words', () => {
    expect(hearingSummary('trash_bins')).toBe('trash bins')
    expect(hearingSummary(null)).toBe('a notice on your home')
  })
  it('what to expect is plain, with no em dash and no legal conclusion', () => {
    const t = hearingExpectText('trash bins')
    expect(t).toBe(
      'The board will meet with you about trash bins. You can come in person and speak. If you can’t make it, contact the board.',
    )
    expect(t).not.toMatch(/—|–/)
  })
  it('mentions remote attendance for Florida only', () => {
    const fl = remoteAttendanceText('FL')
    expect(fl).toMatch(/phone or online/)
    expect(fl).not.toMatch(/—|–/)
    expect(remoteAttendanceText('GA')).toBeNull()
    expect(remoteAttendanceText(null)).toBeNull()
  })
})

describe('noticeIsOut (association zone)', () => {
  it('is out on or after the notice date, not before', () => {
    const now = new Date('2026-11-10T15:00:00Z')
    expect(noticeIsOut('2026-11-10', 'America/New_York', now)).toBe(true)
    expect(noticeIsOut('2026-11-09', 'America/New_York', now)).toBe(true)
    expect(noticeIsOut('2026-11-11', 'America/New_York', now)).toBe(false)
  })
  it('uses the association day: 02:00Z on the 11th is still the 10th in New York', () => {
    const now = new Date('2026-11-11T02:00:00Z')
    expect(noticeIsOut('2026-11-11', 'America/New_York', now)).toBe(false)
    expect(noticeIsOut('2026-11-11', 'Pacific/Auckland', now)).toBe(true)
  })
  it('a missing or bad date means not sent', () => {
    expect(noticeIsOut(null, 'America/New_York', new Date())).toBe(false)
    expect(noticeIsOut('soon', 'America/New_York', new Date())).toBe(false)
  })
})
