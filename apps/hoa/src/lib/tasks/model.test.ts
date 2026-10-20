import { describe, expect, it } from 'vitest'
import {
  addDays,
  applyTaskFilters,
  groupTasks,
  parseTaskFilters,
  taskBucket,
  taskCounts,
  taskDigestCountsByAssignee,
  weekEnd,
  type TaskRow,
} from './model'

const TODAY = '2026-10-20'
const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const MEETING = '33333333-3333-4333-8333-333333333333'

function task(p: Partial<TaskRow> & { id: string }): TaskRow {
  return {
    title: p.id,
    description: null,
    status: 'open',
    priority: 'normal',
    due_date: null,
    assignee_user_id: null,
    assignee_name: null,
    meeting_id: null,
    ticket_id: null,
    completed_at: null,
    created_at: '2026-10-01T00:00:00Z',
    ...p,
  }
}

describe('dates', () => {
  it('adds calendar days across a month end', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('this week is today plus six days', () => {
    expect(weekEnd(TODAY)).toBe('2026-10-26')
  })
})

describe('taskBucket', () => {
  it('done and cancelled go to Done whatever the date', () => {
    expect(taskBucket({ status: 'done', due_date: '2020-01-01' }, TODAY)).toBe('done')
    expect(taskBucket({ status: 'cancelled', due_date: null }, TODAY)).toBe('done')
  })
  it('yesterday is overdue; today is not', () => {
    expect(taskBucket({ status: 'open', due_date: '2026-10-19' }, TODAY)).toBe('overdue')
    expect(taskBucket({ status: 'in_progress', due_date: TODAY }, TODAY)).toBe('this_week')
  })
  it('the seventh day is this week, the eighth is later', () => {
    expect(taskBucket({ status: 'open', due_date: '2026-10-26' }, TODAY)).toBe('this_week')
    expect(taskBucket({ status: 'open', due_date: '2026-10-27' }, TODAY)).toBe('later')
  })
  it('no due date is later', () => {
    expect(taskBucket({ status: 'open', due_date: null }, TODAY)).toBe('later')
  })
})

describe('groupTasks', () => {
  it('groups and sorts: soonest first, high priority first on a tie, no date last', () => {
    const g = groupTasks(
      [
        task({ id: 'later-none', due_date: null }),
        task({ id: 'later-dated', due_date: '2026-12-01' }),
        task({ id: 'week-normal', due_date: '2026-10-22' }),
        task({ id: 'week-high', due_date: '2026-10-22', priority: 'high' }),
        task({ id: 'week-first', due_date: '2026-10-21' }),
        task({ id: 'over', due_date: '2026-10-01' }),
        task({ id: 'done-old', status: 'done', completed_at: '2026-10-02T00:00:00Z' }),
        task({ id: 'done-new', status: 'done', completed_at: '2026-10-19T00:00:00Z' }),
      ],
      TODAY,
    )
    expect(g.overdue.map((t) => t.id)).toEqual(['over'])
    expect(g.this_week.map((t) => t.id)).toEqual(['week-first', 'week-high', 'week-normal'])
    expect(g.later.map((t) => t.id)).toEqual(['later-dated', 'later-none'])
    expect(g.done.map((t) => t.id)).toEqual(['done-new', 'done-old'])
  })
})

describe('filters', () => {
  it('parses known values and treats anything else as all', () => {
    expect(parseTaskFilters({})).toEqual({ assignee: 'all', meeting: 'all' })
    expect(parseTaskFilters({ assignee: 'me', meeting: MEETING })).toEqual({ assignee: 'me', meeting: MEETING })
    expect(parseTaskFilters({ assignee: "x' or 1=1", meeting: 'nope' })).toEqual({ assignee: 'all', meeting: 'all' })
    expect(parseTaskFilters({ assignee: [OTHER, ME] })).toEqual({ assignee: OTHER, meeting: 'all' })
  })

  const rows = [
    task({ id: 'mine', assignee_user_id: ME, meeting_id: MEETING }),
    task({ id: 'theirs', assignee_user_id: OTHER }),
    task({ id: 'typed', assignee_name: 'Linda (treasurer)' }),
    task({ id: 'nobody', meeting_id: MEETING }),
  ]
  const ids = (f: { assignee: string; meeting: string }, me: string | null = ME) =>
    applyTaskFilters(rows, f, me).map((t) => t.id)

  it('filters by assignee', () => {
    expect(ids({ assignee: 'me', meeting: 'all' })).toEqual(['mine'])
    expect(ids({ assignee: 'me', meeting: 'all' }, null)).toEqual([])
    expect(ids({ assignee: OTHER, meeting: 'all' })).toEqual(['theirs'])
    // A typed-in name counts as assigned.
    expect(ids({ assignee: 'unassigned', meeting: 'all' })).toEqual(['nobody'])
  })
  it('filters by meeting, combined with assignee', () => {
    expect(ids({ assignee: 'all', meeting: MEETING })).toEqual(['mine', 'nobody'])
    expect(ids({ assignee: 'me', meeting: MEETING })).toEqual(['mine'])
  })
})

describe('counts', () => {
  it('counts open, overdue and due this week', () => {
    expect(
      taskCounts(
        [
          { status: 'open', due_date: '2026-10-01' },
          { status: 'open', due_date: '2026-10-23' },
          { status: 'in_progress', due_date: null },
          { status: 'done', due_date: '2026-10-01' },
        ],
        TODAY,
      ),
    ).toEqual({ open: 3, overdue: 1, dueThisWeek: 1 })
  })

  it('digest counts are per in-app assignee; typed names, later and done are skipped', () => {
    const m = taskDigestCountsByAssignee(
      [
        { assignee_user_id: ME, status: 'open', due_date: '2026-10-01' },
        { assignee_user_id: ME, status: 'open', due_date: '2026-10-25' },
        { assignee_user_id: ME, status: 'done', due_date: '2026-10-01' },
        { assignee_user_id: OTHER, status: 'open', due_date: '2026-12-01' },
        { assignee_user_id: null, status: 'open', due_date: '2026-10-01' },
      ],
      TODAY,
    )
    expect([...m.entries()]).toEqual([[ME, { overdue: 1, dueSoon: 1 }]])
  })
})
