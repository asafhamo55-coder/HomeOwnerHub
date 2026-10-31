import { describe, expect, it } from 'vitest'
import type { TaskRow } from './model'
import { applyTaskFilters, parseTaskFilters } from './model'
import { isDoneRecently, parseTaskView, summarizeTasks } from './strip'

const row = (o: Partial<TaskRow>): TaskRow => ({
  id: 'x',
  title: 't',
  description: null,
  status: 'open',
  priority: 'normal',
  due_date: null,
  assignee_user_id: 'u1',
  assignee_name: null,
  meeting_id: null,
  ticket_id: null,
  completed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  ...o,
})

const NY = 'America/New_York'

describe('summarizeTasks', () => {
  const today = '2026-10-30'
  it('counts overdue, due in 7 days and unassigned among open tasks', () => {
    const tasks = [
      row({ due_date: '2026-10-29' }),
      row({ due_date: '2026-10-30' }),
      row({ due_date: '2026-11-05' }),
      row({ due_date: '2026-11-06' }),
      row({ due_date: '2026-10-01', assignee_user_id: null }),
      row({ status: 'done', assignee_user_id: null, completed_at: '2026-10-29T12:00:00Z' }),
    ]
    const s = summarizeTasks(tasks, today, NY)
    expect(s.overdue).toBe(2)
    expect(s.dueSoon).toBe(2)
    expect(s.unassigned).toBe(1)
    expect(s.doneRecently).toBe(1)
  })

  it('a free-text assignee name is not unassigned', () => {
    expect(summarizeTasks([row({ assignee_user_id: null, assignee_name: 'Bob' })], today, NY).unassigned).toBe(0)
  })
})

describe('isDoneRecently window', () => {
  const today = '2026-10-30'
  const done = (completed_at: string | null) => ({ status: 'done' as const, completed_at })
  it('includes the 30th calendar day back and excludes the 31st', () => {
    expect(isDoneRecently(done('2026-10-01T16:00:00Z'), today, NY)).toBe(true)
    expect(isDoneRecently(done('2026-09-30T16:00:00Z'), today, NY)).toBe(false)
  })
  it('uses the association timezone for the day boundary', () => {
    // 02:30Z on Oct 1 is still Sep 30 in New York, but already Oct 1 in Auckland.
    expect(isDoneRecently(done('2026-10-01T02:30:00Z'), today, NY)).toBe(false)
    expect(isDoneRecently(done('2026-10-01T02:30:00Z'), today, 'Pacific/Auckland')).toBe(true)
  })
  it('counts calendar days across the fall-back DST change', () => {
    // US DST ends 2026-11-01; from Nov 15 the window reaches back to Oct 17.
    const t = '2026-11-15'
    expect(isDoneRecently(done('2026-10-17T04:30:00Z'), t, NY)).toBe(true)
    expect(isDoneRecently(done('2026-10-17T03:30:00Z'), t, NY)).toBe(false)
  })
  it('counts calendar days across the spring-forward DST change', () => {
    // DST starts 2026-03-08; from Apr 5 the window reaches back to Mar 7.
    const t = '2026-04-05'
    expect(isDoneRecently(done('2026-03-07T05:30:00Z'), t, NY)).toBe(true)
    expect(isDoneRecently(done('2026-03-07T04:30:00Z'), t, NY)).toBe(false)
  })
  it('ignores cancelled, undated and future completions', () => {
    expect(isDoneRecently({ status: 'cancelled', completed_at: '2026-10-29T12:00:00Z' }, today, NY)).toBe(false)
    expect(isDoneRecently(done(null), today, NY)).toBe(false)
    expect(isDoneRecently(done('2026-11-02T12:00:00Z'), today, NY)).toBe(false)
  })
})

describe('Unassigned filter', () => {
  it('parses and keeps only rows with no assignee', () => {
    const f = parseTaskFilters({ assignee: 'unassigned' })
    expect(f.assignee).toBe('unassigned')
    const out = applyTaskFilters([row({ id: 'a' }), row({ id: 'b', assignee_user_id: null })], f, 'u1')
    expect(out.map((t) => t.id)).toEqual(['b'])
  })
})

describe('parseTaskView', () => {
  it('accepts known views only', () => {
    expect(parseTaskView('overdue')).toBe('overdue')
    expect(parseTaskView(['done_recent'])).toBe('done_recent')
    expect(parseTaskView('nope')).toBe('all')
    expect(parseTaskView(undefined)).toBe('all')
  })
})
