import { describe, expect, it } from 'vitest'
import { isActionItemOverdue } from './action-item-dates'

// BL-065: "overdue" compares the due date (a calendar date) with the
// association's today passed in — never the browser's clock or zone.

const item = (due_date: string | null, status: 'open' | 'in_progress' | 'done' = 'open') => ({ due_date, status })

describe('isActionItemOverdue', () => {
  it('is overdue only after its due date, on the association calendar', () => {
    expect(isActionItemOverdue(item('2026-09-30'), '2026-10-01')).toBe(true)
    expect(isActionItemOverdue(item('2026-10-01'), '2026-10-01')).toBe(false) // due today
    expect(isActionItemOverdue(item('2026-10-02'), '2026-10-01')).toBe(false)
  })

  it('in progress counts; done and undated never do', () => {
    expect(isActionItemOverdue(item('2026-09-30', 'in_progress'), '2026-10-01')).toBe(true)
    expect(isActionItemOverdue(item('2026-09-30', 'done'), '2026-10-01')).toBe(false)
    expect(isActionItemOverdue(item(null), '2026-10-01')).toBe(false)
  })
})
