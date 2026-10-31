import { describe, expect, it } from 'vitest'
import {
  countBidsByRfp,
  daysUntilDeadline,
  dueChipLabel,
  matchesRfpsFilter,
  parseRfpsFilter,
  summarizeRfps,
} from './rfps-list'

// 2026-10-30 12:00 in New York (16:00Z).
const NOW = new Date('2026-10-30T16:00:00Z')
const NY = 'America/New_York'
const rfp = (status: string, submission_deadline: string) => ({ status, submission_deadline })

describe('rfps filter and summary strip', () => {
  const rows = [
    rfp('draft', '2026-11-20T17:00:00Z'),
    rfp('draft', '2026-11-25T17:00:00Z'),
    rfp('open', '2026-11-02T17:00:00Z'), // 3 days: closing
    rfp('open', '2026-11-06T17:00:00Z'), // 7 days: closing
    rfp('open', '2026-11-07T17:00:00Z'), // 8 days: not closing
    rfp('open', '2026-10-28T17:00:00Z'), // past: not closing
    rfp('awarded', '2026-10-01T17:00:00Z'),
    rfp('cancelled', '2026-11-03T17:00:00Z'),
    rfp('evaluation', '2026-11-03T17:00:00Z'), // not open, never closing
  ]

  it('counts draft, open, closing within 7 days and awarded', () => {
    expect(summarizeRfps(rows, NY, NOW)).toEqual({ draft: 2, open: 4, closing: 2, awarded: 1 })
  })

  it('an empty list counts zero everywhere', () => {
    expect(summarizeRfps([], NY, NOW)).toEqual({ draft: 0, open: 0, closing: 0, awarded: 0 })
  })

  it('each filter keeps the rows its tile counts', () => {
    const n = (f: Parameters<typeof matchesRfpsFilter>[1]) => rows.filter((r) => matchesRfpsFilter(r, f, NY, NOW)).length
    expect(n('all')).toBe(rows.length)
    expect(n('draft')).toBe(2)
    expect(n('open')).toBe(4)
    expect(n('closing')).toBe(2)
    expect(n('awarded')).toBe(1)
  })

  it('an unknown ?status= falls back to all', () => {
    expect(parseRfpsFilter('closing')).toBe('closing')
    expect(parseRfpsFilter('nonsense')).toBe('all')
    expect(parseRfpsFilter(undefined)).toBe('all')
  })
})

describe('bid counts per RFP', () => {
  it('groups received bids by rfp and ignores drafts and withdrawn bids', () => {
    const counts = countBidsByRfp([
      { rfp_id: 'a', status: 'submitted' },
      { rfp_id: 'a', status: 'awarded' },
      { rfp_id: 'a', status: 'draft' },
      { rfp_id: 'b', status: 'declined' },
      { rfp_id: 'b', status: 'withdrawn' },
      { rfp_id: 'c', status: null },
    ])
    expect(counts).toEqual({ a: 2, b: 1 })
  })
})

describe('Due in N days', () => {
  it('counts calendar days in the association zone, not 24-hour blocks', () => {
    // 10 PM Pacific on Nov 2 is already Nov 3 in UTC, but Nov 2 for the association.
    const due = '2026-11-03T06:00:00Z'
    expect(daysUntilDeadline(due, 'America/Los_Angeles', NOW)).toBe(3)
    expect(daysUntilDeadline(due, 'UTC', NOW)).toBe(4)
  })

  it('late evening locally is still today, early next day is tomorrow', () => {
    const lateNight = new Date('2026-10-31T03:30:00Z') // 11:30 PM Oct 30 in New York
    expect(daysUntilDeadline('2026-10-31T03:45:00Z', NY, lateNight)).toBe(0)
    expect(daysUntilDeadline('2026-10-31T05:00:00Z', NY, lateNight)).toBe(1)
  })

  it('labels open RFPs only', () => {
    expect(dueChipLabel(rfp('open', '2026-11-02T17:00:00Z'), NY, NOW)).toBe('Due in 3 days')
    expect(dueChipLabel(rfp('open', '2026-10-31T17:00:00Z'), NY, NOW)).toBe('Due in 1 day')
    expect(dueChipLabel(rfp('open', '2026-10-30T22:00:00Z'), NY, NOW)).toBe('Due today')
    expect(dueChipLabel(rfp('open', '2026-10-28T17:00:00Z'), NY, NOW)).toBe('Past due')
    expect(dueChipLabel(rfp('draft', '2026-11-02T17:00:00Z'), NY, NOW)).toBeNull()
    expect(dueChipLabel(rfp('awarded', '2026-11-02T17:00:00Z'), NY, NOW)).toBeNull()
    expect(dueChipLabel(rfp('open', 'garbage'), NY, NOW)).toBeNull()
  })
})
