import { describe, expect, it } from 'vitest'
import { cureDueDay, isCurePassed, summarizeViolations } from './violation-summary'

const NY = 'America/New_York'
const row = (id: string, status: string, sent: string | null = null, days: number | null = null) => ({ id, status, notice_sent_at: sent, cure_period_days: days })

describe('cure date', () => {
  it('is the notice day plus the cure days, in the association timezone', () => {
    // 01:00Z on Oct 2 is still Oct 1 in New York.
    expect(cureDueDay(row('a', 'notice_sent', '2026-10-02T01:00:00Z', 10), NY)).toBe('2026-10-11')
  })
  it('is unknown without a live notice, a date or cure days', () => {
    expect(cureDueDay(row('a', 'open', '2026-10-01T12:00:00Z', 10), NY)).toBeNull()
    expect(cureDueDay(row('a', 'notice_sent', null, 10), NY)).toBeNull()
    expect(cureDueDay(row('a', 'notice_sent', '2026-10-01T12:00:00Z', null), NY)).toBeNull()
  })
  it('is still in time on the last day and passed the next day', () => {
    const v = row('a', 'notice_sent', '2026-10-01T16:00:00Z', 10)
    expect(isCurePassed(v, NY, new Date('2026-10-12T03:59:00Z'))).toBe(false) // Oct 11, 23:59 local
    expect(isCurePassed(v, NY, new Date('2026-10-12T04:00:00Z'))).toBe(true) // Oct 12, 00:00 local
  })
  it('holds across the spring DST change', () => {
    // Sent Feb 28 23:30 EST, 14 days: due Mar 14, though the clocks change on Mar 8.
    const v = row('a', 'notice_sent', '2026-03-01T04:30:00Z', 14)
    expect(cureDueDay(v, NY)).toBe('2026-03-14')
    expect(isCurePassed(v, NY, new Date('2026-03-15T03:30:00Z'))).toBe(false) // Mar 14, 23:30 EDT
    expect(isCurePassed(v, NY, new Date('2026-03-15T04:00:00Z'))).toBe(true) // Mar 15, 00:00 EDT
  })
  it('holds across the fall DST change', () => {
    // Sent Oct 31 20:00 EDT, 7 days: due Nov 7, though the clocks change on Nov 1.
    const v = row('a', 'notice_sent', '2026-11-01T00:00:00Z', 7)
    expect(cureDueDay(v, NY)).toBe('2026-11-07')
    expect(isCurePassed(v, NY, new Date('2026-11-08T04:59:00Z'))).toBe(false) // Nov 7, 23:59 EST
    expect(isCurePassed(v, NY, new Date('2026-11-08T05:00:00Z'))).toBe(true)
  })
})

describe('summarizeViolations', () => {
  const now = new Date('2026-10-30T16:00:00Z')
  it('counts open, in cure and past the cure date, and ignores the rest', () => {
    const s = summarizeViolations(
      [
        row('1', 'open'),
        row('2', 'notice_drafted'),
        row('3', 'notice_sent', '2026-10-25T16:00:00Z', 14),
        row('4', 'notice_sent', '2026-10-01T16:00:00Z', 14),
        row('5', 'notice_sent'),
        row('6', 'fined'),
        row('7', 'resolved'),
      ],
      NY,
      now,
    )
    expect(s).toEqual({ open: 2, inCure: 2, curePassed: 1, curePassedIds: ['4'] })
  })
  it('is all zeros for no rows', () => {
    expect(summarizeViolations([], NY, now)).toEqual({ open: 0, inCure: 0, curePassed: 0, curePassedIds: [] })
  })
})
