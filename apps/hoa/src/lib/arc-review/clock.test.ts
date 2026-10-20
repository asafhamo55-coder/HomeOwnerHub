import { describe, expect, it } from 'vitest'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import {
  ARC_CLOCK_KEY,
  DEFAULT_ARC_CLOCK,
  arcClock,
  arcClockSecret,
  arcDaysLeft,
  arcDigestCounts,
  arcDueDate,
  arcStateNote,
  localDate,
  pickArcClockSettings,
  readArcClockSettings,
  signArcClockSettings,
  withArcClockSettings,
  type ArcClockSettings,
} from './clock'

// BL-113: the ARC decision clock. 2026-10-16 is a Friday, 2026-10-20 a Tuesday.

const CAL30: ArcClockSettings = { days: 30, dayKind: 'calendar' }
const at = (ymd: string) => `${ymd}T16:00:00.000Z` // noon Eastern

describe('day math — calendar days', () => {
  it('is due N days after the submission date', () => {
    expect(arcDueDate('2026-10-16', CAL30)).toBe('2026-11-15')
    expect(arcDueDate('2026-12-20', { days: 15, dayKind: 'calendar' })).toBe('2027-01-04')
  })

  it('counts days left, 0 on the due date, negative after', () => {
    expect(arcDaysLeft('2026-10-20', '2026-10-23', 'calendar')).toBe(3)
    expect(arcDaysLeft('2026-10-23', '2026-10-23', 'calendar')).toBe(0)
    expect(arcDaysLeft('2026-10-26', '2026-10-23', 'calendar')).toBe(-3)
  })
})

describe('day math — business days', () => {
  it('skips weekends, so the due date is a weekday', () => {
    expect(arcDueDate('2026-10-16', { days: 5, dayKind: 'business' })).toBe('2026-10-23')
    expect(arcDueDate('2026-10-16', { days: 10, dayKind: 'business' })).toBe('2026-10-30')
  })

  it('starts counting on the first weekday after a weekend submission', () => {
    expect(arcDueDate('2026-10-24', { days: 1, dayKind: 'business' })).toBe('2026-10-26')
  })

  it('counts weekdays left and overdue', () => {
    expect(arcDaysLeft('2026-10-20', '2026-10-23', 'business')).toBe(3)
    // Friday → next Friday: 5 weekdays, not 7 days.
    expect(arcDaysLeft('2026-10-16', '2026-10-23', 'business')).toBe(5)
    expect(arcDaysLeft('2026-10-26', '2026-10-23', 'business')).toBe(-1)
    expect(arcDaysLeft('2026-10-27', '2026-10-23', 'business')).toBe(-2)
  })

  it('the Saturday after a Friday deadline is overdue, not "due today"', () => {
    expect(arcDaysLeft('2026-10-24', '2026-10-23', 'business')).toBe(-1)
  })

  it('a business-day window ends later on the calendar than the same calendar window', () => {
    const cal = arcDueDate('2026-10-16', { days: 10, dayKind: 'calendar' })
    const bus = arcDueDate('2026-10-16', { days: 10, dayKind: 'business' })
    expect(cal).toBe('2026-10-26')
    expect(bus > cal).toBe(true)
  })
})

describe('localDate', () => {
  it('uses the Eastern calendar date, not UTC', () => {
    // 02:00 UTC on the 17th is 22:00 Eastern on the 16th.
    expect(localDate('2026-10-17T02:00:00.000Z')).toBe('2026-10-16')
  })
})

describe('arcClock — chip states', () => {
  const now = at('2026-10-20')

  it('is null once decided or withdrawn', () => {
    for (const status of ['approved', 'denied', 'withdrawn']) {
      expect(arcClock({ status, submittedAt: at('2026-10-01'), settings: CAL30, now })).toBeNull()
    }
  })

  it('runs for submitted and in review', () => {
    expect(arcClock({ status: 'submitted', submittedAt: at('2026-10-01'), settings: CAL30, now })).not.toBeNull()
    expect(arcClock({ status: 'in_review', submittedAt: at('2026-10-01'), settings: CAL30, now })).not.toBeNull()
  })

  it('neutral above 7 days left', () => {
    const c = arcClock({ status: 'submitted', submittedAt: at('2026-09-27'), settings: CAL30, now })!
    expect(c).toMatchObject({ dueDate: '2026-10-27', daysLeft: 7, tone: 'soon' })
    const ok = arcClock({ status: 'submitted', submittedAt: at('2026-09-28'), settings: CAL30, now })!
    expect(ok).toMatchObject({ daysLeft: 8, tone: 'ok', label: '8 days left' })
  })

  it('amber at 7 days or fewer, including due today', () => {
    const today = arcClock({ status: 'submitted', submittedAt: at('2026-09-20'), settings: CAL30, now })!
    expect(today).toMatchObject({ daysLeft: 0, tone: 'soon', label: 'Due today' })
    const one = arcClock({ status: 'submitted', submittedAt: at('2026-09-21'), settings: CAL30, now })!
    expect(one).toMatchObject({ daysLeft: 1, tone: 'soon', label: '1 day left' })
  })

  it('red once overdue', () => {
    const c = arcClock({ status: 'in_review', submittedAt: at('2026-09-17'), settings: CAL30, now })!
    expect(c).toMatchObject({ daysLeft: -3, tone: 'overdue', label: '3 days overdue' })
    const one = arcClock({ status: 'in_review', submittedAt: at('2026-09-19'), settings: CAL30, now })!
    expect(one.label).toBe('1 day overdue')
  })

  it('says "business days" when counting business days', () => {
    const c = arcClock({
      status: 'submitted',
      submittedAt: at('2026-10-16'),
      settings: { days: 5, dayKind: 'business' },
      now,
    })!
    expect(c).toMatchObject({ dueDate: '2026-10-23', daysLeft: 3, label: '3 business days left', tone: 'soon' })
  })
})

describe('arcDigestCounts — digest inclusion', () => {
  const now = at('2026-10-20')
  const row = (submitted: string, status = 'submitted') => ({ status, submittedAt: at(submitted), settings: CAL30 })

  it('counts overdue and due within 3 days (today included); skips later and decided', () => {
    expect(
      arcDigestCounts(
        [
          row('2026-09-15'), // overdue 5
          row('2026-09-19'), // overdue 1
          row('2026-09-20'), // due today
          row('2026-09-23'), // 3 days left
          row('2026-09-24'), // 4 days left: not yet
          row('2026-09-01', 'approved'),
          row('2026-09-01', 'withdrawn'),
        ],
        now,
      ),
    ).toEqual({ overdue: 2, dueSoon: 2 })
  })

  it('nothing open: zero', () => {
    expect(arcDigestCounts([], now)).toEqual({ overdue: 0, dueSoon: 0 })
  })
})

describe('settings signature', () => {
  const ASSOC = '11111111-1111-4111-8111-111111111111'
  const OTHER = '22222222-2222-4222-8222-222222222222'
  const SECRET = 'test-secret'
  const stamp = { updatedAt: '2026-10-20T12:00:00.000Z', updatedBy: 'u-board' }

  it('reads back what the board saved', () => {
    const stored = signArcClockSettings(ASSOC, { days: 45, dayKind: 'business' }, stamp, SECRET)
    const cs = withArcClockSettings({}, stored)
    expect(readArcClockSettings(ASSOC, cs, SECRET)).toMatchObject({
      state: 'configured',
      days: 45,
      dayKind: 'business',
      updatedBy: 'u-board',
    })
  })

  it('missing → not configured, 30 calendar days', () => {
    expect(readArcClockSettings(ASSOC, {}, SECRET)).toEqual({ state: 'not_configured', ...DEFAULT_ARC_CLOCK })
    expect(readArcClockSettings(ASSOC, null, SECRET)).toEqual({ state: 'not_configured', ...DEFAULT_ARC_CLOCK })
  })

  it('a value changed outside the signed save is unverified and uses the default', () => {
    const stored = signArcClockSettings(ASSOC, { days: 45, dayKind: 'calendar' }, stamp, SECRET)
    const forged = withArcClockSettings({}, { ...stored, days: 365 })
    expect(readArcClockSettings(ASSOC, forged, SECRET)).toEqual({ state: 'unverified', ...DEFAULT_ARC_CLOCK })
    const kind = withArcClockSettings({}, { ...stored, day_kind: 'business' })
    expect(readArcClockSettings(ASSOC, kind, SECRET).state).toBe('unverified')
  })

  it('is bound to its association and the secret', () => {
    const cs = withArcClockSettings({}, signArcClockSettings(ASSOC, CAL30, stamp, SECRET))
    expect(readArcClockSettings(OTHER, cs, SECRET).state).toBe('unverified')
    expect(readArcClockSettings(ASSOC, cs, 'another-secret').state).toBe('unverified')
    expect(readArcClockSettings(ASSOC, cs, null).state).toBe('unverified')
  })

  it('malformed values are unverified', () => {
    expect(readArcClockSettings(ASSOC, { [ARC_CLOCK_KEY]: 'thirty' }, SECRET).state).toBe('unverified')
    expect(readArcClockSettings(ASSOC, { [ARC_CLOCK_KEY]: { days: 0, day_kind: 'calendar' } }, SECRET).state).toBe(
      'unverified',
    )
  })

  it('refuses out-of-range days when signing', () => {
    for (const days of [0, 366, 1.5, Number.NaN]) {
      expect(() => signArcClockSettings(ASSOC, { days, dayKind: 'calendar' }, stamp, SECRET)).toThrow(RangeError)
    }
  })

  it('keeps every other compliance_settings key', () => {
    const stored = signArcClockSettings(ASSOC, CAL30, stamp, SECRET)
    const out = withArcClockSettings({ pay_by_zelle: { x: 1 }, inbox_sla_hours: { warn: 24 } }, stored)
    expect(out).toMatchObject({ pay_by_zelle: { x: 1 }, inbox_sla_hours: { warn: 24 }, [ARC_CLOCK_KEY]: stored })
  })

  it('uses the same secret as the other signed settings', () => {
    const env = { PAY_SETTINGS_SECRET: undefined, SUPABASE_SERVICE_ROLE_KEY: 'srk', SUPABASE_SECRET_KEY: 'sk' }
    expect(arcClockSecret(env)).toBe('srk')
    expect(arcClockSecret({ PAY_SETTINGS_SECRET: 'pss', SUPABASE_SERVICE_ROLE_KEY: 'srk' })).toBe('pss')
    expect(arcClockSecret({})).toBeNull()
    expect(arcClockSecret()).toBe(paySettingsSecret())
  })
})

describe('pickArcClockSettings', () => {
  const A = { associationId: 'a', settings: { days: 10, dayKind: 'business' as const } }
  const B = { associationId: 'b', settings: { days: 60, dayKind: 'calendar' as const } }

  it("uses the application's association", () => {
    expect(pickArcClockSettings([A, B], 'b')).toEqual(B.settings)
  })
  it('an older row with no association uses the only association, else the default', () => {
    expect(pickArcClockSettings([A], null)).toEqual(A.settings)
    expect(pickArcClockSettings([A, B], null)).toEqual(DEFAULT_ARC_CLOCK)
    expect(pickArcClockSettings([A, B], 'zzz')).toEqual(DEFAULT_ARC_CLOCK)
  })
})

describe('arcStateNote', () => {
  it('cites Florida § 720.3035(4)(a), whose text is in our statute fixtures', () => {
    expect(arcStateNote('FL')).toContain('720.3035(4)(a)')
  })
  it('no note where we hold no statute text', () => {
    expect(arcStateNote('TX')).toBeNull()
    expect(arcStateNote(null)).toBeNull()
  })
})
