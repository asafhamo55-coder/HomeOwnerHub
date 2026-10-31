import { addCalendarDays, dayOf } from '@/lib/association-time'
import { applyTaskFilters, groupTasks, type TaskRow } from './model'

/** Days the "Done" tile looks back, today included. */
export const DONE_WINDOW_DAYS = 30

export type TaskView = 'all' | 'overdue' | 'this_week' | 'done_recent'

const VIEWS: readonly TaskView[] = ['overdue', 'this_week', 'done_recent']

/** The `view` search param a summary tile links to. Anything else means "all". */
export function parseTaskView(v: string | string[] | undefined): TaskView {
  const s = Array.isArray(v) ? v[0] : v
  return (VIEWS as readonly string[]).includes(s ?? '') ? (s as TaskView) : 'all'
}

/** True when a done task finished within the last 30 calendar days of the association's calendar. */
export function isDoneRecently(t: Pick<TaskRow, 'status' | 'completed_at'>, today: string, timeZone: string): boolean {
  if (t.status !== 'done' || !t.completed_at) return false
  const day = dayOf(t.completed_at, timeZone)
  return day != null && day >= addCalendarDays(today, -(DONE_WINDOW_DAYS - 1)) && day <= today
}

export interface TaskSummary {
  overdue: number
  dueSoon: number
  unassigned: number
  doneRecently: number
}

/**
 * Counts for the strip over every loaded task (not the filtered view), so the
 * tiles stay put while the list below is narrowed. Reuses groupTasks for the
 * date buckets and applyTaskFilters for "unassigned".
 */
export function summarizeTasks(tasks: readonly TaskRow[], today: string, timeZone: string): TaskSummary {
  const groups = groupTasks(tasks, today)
  const unassignedOpen = applyTaskFilters(tasks, { assignee: 'unassigned', meeting: 'all' }, null).filter(
    (t) => t.status === 'open' || t.status === 'in_progress',
  )
  return {
    overdue: groups.overdue.length,
    dueSoon: groups.this_week.length,
    unassigned: unassignedOpen.length,
    doneRecently: groups.done.filter((t) => isDoneRecently(t, today, timeZone)).length,
  }
}
