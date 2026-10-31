import { describe, expect, it } from 'vitest'
import { ARC_OVERDUE_VIEW, isCompletionOverdue, overdueCutoff, parseArcView } from './overdue'

const approved = (proposed_completion: string | null) => ({ status: 'approved', proposed_completion })

describe('parseArcView', () => {
  it('accepts only the overdue view', () => {
    expect(parseArcView('overdue-completion')).toBe(ARC_OVERDUE_VIEW)
    expect(parseArcView('approved')).toBeNull()
    expect(parseArcView(undefined)).toBeNull()
    expect(parseArcView('')).toBeNull()
  })
})

describe('isCompletionOverdue', () => {
  it('is overdue the day after the completion date, not on it', () => {
    expect(isCompletionOverdue(approved('2026-10-30'), '2026-10-31')).toBe(true)
    expect(isCompletionOverdue(approved('2026-10-31'), '2026-10-31')).toBe(false)
    expect(isCompletionOverdue(approved('2026-11-01'), '2026-10-31')).toBe(false)
  })
  it('only counts approved requests with a date', () => {
    expect(isCompletionOverdue({ status: 'submitted', proposed_completion: '2020-01-01' }, '2026-10-31')).toBe(false)
    expect(isCompletionOverdue({ status: 'denied', proposed_completion: '2020-01-01' }, '2026-10-31')).toBe(false)
    expect(isCompletionOverdue(approved(null), '2026-10-31')).toBe(false)
    expect(isCompletionOverdue(approved('not a date'), '2026-10-31')).toBe(false)
  })
})

describe('across a timezone boundary', () => {
  // 02:00 UTC on Nov 1 is still Oct 31 in New York and Los Angeles, already Nov 1 in Auckland.
  const now = new Date('2026-11-01T02:00:00Z')
  it('uses the association zone for today', () => {
    expect(overdueCutoff('America/New_York', now)).toBe('2026-10-31')
    expect(overdueCutoff('America/Los_Angeles', now)).toBe('2026-10-31')
    expect(overdueCutoff('Pacific/Auckland', now)).toBe('2026-11-01')
  })
  it('judges the same DATE value differently per zone, never shifting the date itself', () => {
    const row = approved('2026-10-31')
    expect(isCompletionOverdue(row, overdueCutoff('America/New_York', now))).toBe(false)
    expect(isCompletionOverdue(row, overdueCutoff('Pacific/Auckland', now))).toBe(true)
  })
})
