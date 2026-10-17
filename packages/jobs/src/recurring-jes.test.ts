import { describe, expect, it } from 'vitest'
import { dueRulesForAssociationDay, LATEST_TODAY_ZONE } from './recurring-jes'
import { todayIn } from './association-time'

// BL-065: each rule runs on ITS association's day, not one Eastern "today"
// for every rule. Instants are absolute and zones come from the rows, so
// the machine's TZ never matters (run under TZ=UTC and TZ=Pacific/Kiritimati).

const rule = (id: string, associationId: string, nextRunDate: string) => ({
  id,
  organization_id: 'org-1',
  association_id: associationId,
  template_je_id: `tpl-${id}`,
  cadence: 'monthly',
  next_run_date: nextRunDate,
  is_active: true,
})

const ZONES = [
  { id: 'fl', state: 'FL' }, // America/New_York
  { id: 'ca', state: 'CA' }, // America/Los_Angeles
  { id: 'hi', state: 'HI' }, // Pacific/Honolulu
]

describe('dueRulesForAssociationDay', () => {
  // 01:00 EDT Oct 15 = 22:00 PDT Oct 14 = 19:00 HST Oct 14.
  const NOW = new Date('2026-10-15T05:00:00Z')

  it('runs each rule on its own association day', () => {
    const due = dueRulesForAssociationDay(
      [rule('r-fl', 'fl', '2026-10-15'), rule('r-ca', 'ca', '2026-10-15'), rule('r-ca-old', 'ca', '2026-10-14')],
      ZONES,
      NOW,
    )
    // Florida is on Oct 15; California is still on Oct 14, so its Oct 15
    // rule waits and its Oct 14 rule posts dated Oct 14.
    expect(due.map((r) => [r.id, r.today])).toEqual([
      ['r-fl', '2026-10-15'],
      ['r-ca-old', '2026-10-14'],
    ])
  })

  it('an association with no zone row (or an unknown state) uses Eastern', () => {
    const due = dueRulesForAssociationDay(
      [rule('r-x', 'missing', '2026-10-15'), rule('r-y', 'odd', '2026-10-15')],
      [{ id: 'odd', state: 'ZZ' }],
      NOW,
    )
    expect(due.map((r) => [r.id, r.today])).toEqual([
      ['r-x', '2026-10-15'],
      ['r-y', '2026-10-15'],
    ])
  })

  it('a later instant brings the western rule due on its own Oct 15', () => {
    const later = new Date('2026-10-15T08:00:00Z') // 01:00 PDT Oct 15, 22:00 HST Oct 14
    const due = dueRulesForAssociationDay(
      [rule('r-ca', 'ca', '2026-10-15'), rule('r-hi', 'hi', '2026-10-15')],
      ZONES,
      later,
    )
    expect(due.map((r) => [r.id, r.today])).toEqual([['r-ca', '2026-10-15']])
  })

  it('the load bound is never behind any association day', () => {
    // Just before midnight UTC the far-east bound is already the next day.
    const now = new Date('2026-10-15T23:59:00Z')
    expect(todayIn(LATEST_TODAY_ZONE, now)).toBe('2026-10-16')
    for (const z of ['America/New_York', 'Pacific/Honolulu', 'Pacific/Guam']) {
      expect(todayIn(z, now) <= todayIn(LATEST_TODAY_ZONE, now)).toBe(true)
    }
  })
})
