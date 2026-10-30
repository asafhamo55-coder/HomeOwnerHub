import { describe, expect, it } from 'vitest'
import { countByStatus, countPastDecideBy, oldestArcWaitDays } from './summary'

const r = (status: string, submitted_at: string, association_id = 'a1') => ({ status, association_id, submitted_at })
const settings = [{ associationId: 'a1', settings: { days: 30, dayKind: 'calendar' as const } }]

describe('countByStatus', () => {
  it('tallies per status', () => {
    expect(countByStatus([r('submitted', '2026-10-01T12:00:00Z'), r('submitted', '2026-10-02T12:00:00Z'), r('denied', '2026-10-02T12:00:00Z')])).toEqual({ submitted: 2, denied: 1 })
  })
})

describe('oldestArcWaitDays', () => {
  it('counts calendar days from the oldest waiting application, ignoring decided ones', () => {
    const now = new Date('2026-10-30T16:00:00Z')
    expect(oldestArcWaitDays([r('approved', '2026-01-01T12:00:00Z'), r('in_review', '2026-10-20T12:00:00Z'), r('submitted', '2026-10-25T12:00:00Z')], now)).toBe(10)
  })
  it('is null when nothing is waiting and 0 for today', () => {
    const now = new Date('2026-10-30T16:00:00Z')
    expect(oldestArcWaitDays([r('approved', '2026-10-01T12:00:00Z')], now)).toBeNull()
    expect(oldestArcWaitDays([r('submitted', '2026-10-30T14:00:00Z')], now)).toBe(0)
  })
  it('is not thrown off by a DST change', () => {
    // Submitted Sat Oct 31 21:00 EDT; Mon Nov 2 00:30 EST is 2 calendar days later, though only 28 hours.
    expect(oldestArcWaitDays([r('submitted', '2026-11-01T01:00:00Z')], new Date('2026-11-02T05:30:00Z'))).toBe(2)
  })
})

describe('countPastDecideBy', () => {
  it('counts waiting applications past the deadline, not the day it is due', () => {
    const rows = [r('submitted', '2026-09-30T16:00:00Z'), r('submitted', '2026-10-15T16:00:00Z'), r('denied', '2026-01-01T16:00:00Z')]
    // Sept 30 + 30 days = Oct 30. On Oct 30 it is due today, not late.
    expect(countPastDecideBy(rows, settings, new Date('2026-10-30T16:00:00Z'))).toBe(0)
    expect(countPastDecideBy(rows, settings, new Date('2026-10-31T16:00:00Z'))).toBe(1)
  })
})
