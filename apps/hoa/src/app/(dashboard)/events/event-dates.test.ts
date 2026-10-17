import { describe, expect, it } from 'vitest'
import type { RecurringEvent } from '@/lib/events'
import { alertState, daysUntilDate } from './event-dates'

// BL-065: the events pages judge "today" on the event's association day,
// passed in explicitly — never the UTC day, never the machine clock.

const event = (over: Partial<RecurringEvent> = {}): RecurringEvent => ({
  id: 'evt-1',
  title: 'Annual meeting',
  description: null,
  event_date: '2026-10-20',
  recurrence: 'annual',
  alert_days_before: 7,
  notify_channels: ['email'],
  notify_audience: { kind: 'board' },
  last_alert_sent_at: null,
  last_alert_sent_for: null,
  is_active: true,
  association_id: null,
  created_at: '2025-01-01T00:00:00Z',
  ...over,
})

describe('daysUntilDate', () => {
  it('counts calendar days from the given today', () => {
    expect(daysUntilDate('2026-10-20', '2026-10-13')).toBe(7)
    expect(daysUntilDate('2026-10-13', '2026-10-13')).toBe(0)
    expect(daysUntilDate('2026-10-12', '2026-10-13')).toBe(-1)
    // Across the DST change (Nov 1 2026): still whole days.
    expect(daysUntilDate('2026-11-02', '2026-10-31')).toBe(2)
  })
})

describe('alertState', () => {
  it('opens the window on event_date − alert_days_before of the given day', () => {
    // 23:30 Eastern on Oct 12: the UTC day is already Oct 13, the association's is not.
    expect(alertState(event(), '2026-10-12')).toEqual({ kind: 'scheduled', on: '2026-10-13' })
    expect(alertState(event(), '2026-10-13').kind).toBe('due')
  })

  it('a passed date with no alert is none', () => {
    expect(alertState(event({ event_date: '2026-10-12' }), '2026-10-13').kind).toBe('none')
  })

  it('"sent on" is the day the send happened in the association zone', () => {
    // Sent 2026-10-14T02:00Z = Oct 13 22:00 EDT.
    const e = event({ last_alert_sent_for: '2026-10-20', last_alert_sent_at: '2026-10-14T02:00:00Z' })
    expect(alertState(e, '2026-10-14', 'America/New_York')).toEqual({ kind: 'sent', on: '2026-10-13' })
    expect(alertState(e, '2026-10-14', 'UTC')).toEqual({ kind: 'sent', on: '2026-10-14' })
  })

  it('paused wins', () => {
    expect(alertState(event({ is_active: false }), '2026-10-13').kind).toBe('paused')
  })
})
