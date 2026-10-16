// Regression: a charge due 2026-10-01 rendered as "Due Sep 30, 2026" on the
// resident dues/pay pages. `new Date('2026-10-01')` is UTC midnight, which is
// still Sep 30 in every US zone, and date-fns formats in local time. Vercel
// runs in UTC, which hides it there; any US-zone render (dev, a client
// component, a non-UTC host) showed the wrong day. Pin a US zone so this suite
// catches a regression on any machine, including UTC CI.
process.env.TZ = 'America/New_York'

import { describe, expect, it } from 'vitest'
import { chargeDueText, nextDueText } from './resident-due-text'
import { formatDay } from './money/format'

describe('resident due-date text under America/New_York', () => {
  it('the zone is actually in effect (control: the naive parse shifts a day)', () => {
    expect(new Date('2026-10-01').getDate()).toBe(30)
  })

  it('shows the calendar due date, not the day before', () => {
    expect(chargeDueText({ dueDate: '2026-10-01', pastDue: false })).toBe('Due Oct 1, 2026')
    expect(nextDueText('2026-10-01')).toBe('Next due Oct 1, 2026')
    expect(formatDay('2026-10-01')).toBe('Oct 1, 2026')
    expect(formatDay('2026-10-01', 'short')).toBe('Oct 1')
    expect(formatDay('2026-01-01', 'year')).toBe('2026')
  })

  it('counts days late from the calendar date', () => {
    expect(chargeDueText({ dueDate: '2026-10-01', pastDue: true }, '2026-10-15')).toBe('Due Oct 1, 2026 · 14 days late')
    expect(chargeDueText({ dueDate: '2026-10-14', pastDue: true }, '2026-10-15')).toBe('Due Oct 14, 2026 · 1 day late')
    expect(chargeDueText({ dueDate: '2026-10-15', pastDue: true }, '2026-10-15')).toBe('Due Oct 15, 2026 · due today')
  })
})
