/**
 * BL-119 board task list: the pure rules behind /tasks, the dashboard's
 * "My tasks" card and the tasks block in the morning digest.
 *
 * A task is a `meeting_action_items` row (no new table, no migration). Its
 * meeting is optional since 0024; a row needs a meeting or a ticket
 * (`action_item_has_source`), so tasks are made from a meeting's minutes or
 * from a ticket, and /tasks is where the board sees them all together.
 *
 * Dependency-free on purpose (no imports at all): packages/jobs reaches it
 * by relative path for the digest, the same rule as inbox/waiting.ts and
 * arc-review/clock.ts. Dates are 'YYYY-MM-DD' calendar dates, compared as
 * strings, against the association's today supplied by the caller.
 */

export const TASK_OPEN_STATUSES = ['open', 'in_progress'] as const

/** "This week" is today plus the next six days. */
export const TASK_WEEK_DAYS = 7

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'normal' | 'high'
export type TaskBucket = 'overdue' | 'this_week' | 'later' | 'done'

export const TASK_BUCKETS: ReadonlyArray<{ id: TaskBucket; label: string }> = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'this_week', label: 'This week' },
  { id: 'later', label: 'Later' },
  { id: 'done', label: 'Done' },
]

export interface TaskRow {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  assignee_user_id: string | null
  assignee_name: string | null
  meeting_id: string | null
  ticket_id: string | null
  completed_at: string | null
  created_at: string
}

/** The columns /tasks reads. Keep in step with TaskRow. */
export const TASK_COLUMNS =
  'id, title, description, status, priority, due_date, assignee_user_id, assignee_name, meeting_id, ticket_id, completed_at, created_at'

export function isOpenTask(t: { status: string }): boolean {
  return (TASK_OPEN_STATUSES as readonly string[]).includes(t.status)
}

/** 'YYYY-MM-DD' plus n calendar days. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + n)).toISOString().slice(0, 10)
}

/** The last day that still counts as "this week" (inclusive). */
export function weekEnd(today: string): string {
  return addDays(today, TASK_WEEK_DAYS - 1)
}

/**
 * Which group a task belongs in. Done and cancelled go to Done. An open task
 * due before today is Overdue (due today is not); due within the next seven
 * days is This week; a later date, or no date at all, is Later.
 */
export function taskBucket(t: { status: string; due_date: string | null }, today: string): TaskBucket {
  if (!isOpenTask(t)) return 'done'
  if (!t.due_date) return 'later'
  if (t.due_date < today) return 'overdue'
  if (t.due_date <= weekEnd(today)) return 'this_week'
  return 'later'
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 }

function byDueThenPriority(a: TaskRow, b: TaskRow): number {
  // No due date sorts last.
  const ad = a.due_date ?? '9999-12-31'
  const bd = b.due_date ?? '9999-12-31'
  if (ad !== bd) return ad < bd ? -1 : 1
  const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
  if (pr !== 0) return pr
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
}

function byCompletedDesc(a: TaskRow, b: TaskRow): number {
  const ac = a.completed_at ?? a.created_at
  const bc = b.completed_at ?? b.created_at
  return ac < bc ? 1 : ac > bc ? -1 : 0
}

/** Tasks grouped Overdue / This week / Later / Done, each group sorted. */
export function groupTasks(tasks: readonly TaskRow[], today: string): Record<TaskBucket, TaskRow[]> {
  const out: Record<TaskBucket, TaskRow[]> = { overdue: [], this_week: [], later: [], done: [] }
  for (const t of tasks) out[taskBucket(t, today)].push(t)
  out.overdue.sort(byDueThenPriority)
  out.this_week.sort(byDueThenPriority)
  out.later.sort(byDueThenPriority)
  out.done.sort(byCompletedDesc)
  return out
}

// ─── Filters ─────────────────────────────────────────────────────────

/** 'all', 'me', 'unassigned', or a board member's user id. */
export type AssigneeFilter = string
/** 'all' or a meeting id. */
export type MeetingFilter = string

export interface TaskFilters {
  assignee: AssigneeFilter
  meeting: MeetingFilter
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

/** Search params to filters. Anything unrecognised means "all". */
export function parseTaskFilters(sp: { assignee?: string | string[]; meeting?: string | string[] }): TaskFilters {
  const a = first(sp.assignee)
  const m = first(sp.meeting)
  return {
    assignee: a === 'me' || a === 'unassigned' || (a && UUID.test(a)) ? a : 'all',
    meeting: m && UUID.test(m) ? m : 'all',
  }
}

export function applyTaskFilters(tasks: readonly TaskRow[], f: TaskFilters, meUserId: string | null): TaskRow[] {
  return tasks.filter((t) => {
    if (f.meeting !== 'all' && t.meeting_id !== f.meeting) return false
    if (f.assignee === 'all') return true
    if (f.assignee === 'unassigned') return !t.assignee_user_id && !t.assignee_name
    if (f.assignee === 'me') return meUserId != null && t.assignee_user_id === meUserId
    return t.assignee_user_id === f.assignee
  })
}

// ─── Counts (dashboard card and digest) ──────────────────────────────

export interface TaskCounts {
  open: number
  overdue: number
  dueThisWeek: number
}

/** Open, overdue and due-this-week counts over the tasks given. */
export function taskCounts(tasks: ReadonlyArray<{ status: string; due_date: string | null }>, today: string): TaskCounts {
  let open = 0
  let overdue = 0
  let dueThisWeek = 0
  for (const t of tasks) {
    if (!isOpenTask(t)) continue
    open += 1
    const b = taskBucket(t, today)
    if (b === 'overdue') overdue += 1
    else if (b === 'this_week') dueThisWeek += 1
  }
  return { open, overdue, dueThisWeek }
}

/**
 * Overdue and due-this-week counts per assignee, for the morning digest.
 * Rows with no in-app assignee are skipped: the digest goes to the assignee
 * only, and a free-text name has no inbox.
 */
export function taskDigestCountsByAssignee(
  rows: ReadonlyArray<{ status: string; due_date: string | null; assignee_user_id: string | null }>,
  today: string,
): Map<string, { overdue: number; dueSoon: number }> {
  const out = new Map<string, { overdue: number; dueSoon: number }>()
  for (const r of rows) {
    if (!r.assignee_user_id || !isOpenTask(r)) continue
    const b = taskBucket(r, today)
    if (b !== 'overdue' && b !== 'this_week') continue
    const entry = out.get(r.assignee_user_id) ?? { overdue: 0, dueSoon: 0 }
    if (b === 'overdue') entry.overdue += 1
    else entry.dueSoon += 1
    out.set(r.assignee_user_id, entry)
  }
  return out
}
