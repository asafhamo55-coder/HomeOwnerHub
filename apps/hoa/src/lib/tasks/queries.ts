/**
 * BL-119 reads for /tasks and the dashboard "My tasks" card. Every read is
 * org-scoped and runs on the caller's (board/admin) client, so RLS
 * (0063: meeting_action_items is board only) is still the boundary. A
 * failed read returns null, logged by code, so it never reads as "no tasks".
 */

import { TASK_COLUMNS, TASK_OPEN_STATUSES, taskCounts, type TaskCounts, type TaskRow } from './model'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** Open tasks shown at most; a board with more sees a "showing first N" note. */
export const OPEN_TASK_LIMIT = 500
/** Done/cancelled tasks shown, most recently finished first. */
export const DONE_TASK_LIMIT = 50

export interface BoardTasks {
  tasks: TaskRow[]
  /** Open tasks on file (may exceed what was loaded). */
  openTotal: number
  /** True when more open tasks exist than OPEN_TASK_LIMIT. */
  truncated: boolean
}

export async function loadBoardTasks(db: Db, orgId: string): Promise<BoardTasks | null> {
  const [open, done] = await Promise.all([
    db
      .from('meeting_action_items')
      .select(TASK_COLUMNS, { count: 'exact' })
      .eq('org_id', orgId)
      .in('status', [...TASK_OPEN_STATUSES])
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(OPEN_TASK_LIMIT),
    db
      .from('meeting_action_items')
      .select(TASK_COLUMNS)
      .eq('org_id', orgId)
      .in('status', ['done', 'cancelled'])
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(DONE_TASK_LIMIT),
  ])
  if (open.error || done.error) {
    console.error('[tasks] list failed', { code: open.error?.code ?? done.error?.code })
    return null
  }
  const openRows = (open.data ?? []) as TaskRow[]
  const openTotal = typeof open.count === 'number' ? open.count : openRows.length
  return {
    tasks: [...openRows, ...((done.data ?? []) as TaskRow[])],
    openTotal,
    truncated: openTotal > openRows.length,
  }
}

export interface TaskMeeting {
  id: string
  meeting_date: string
  meeting_type: string | null
}

/** The meetings the given tasks came from, for labels, links and the filter. */
export async function loadTaskMeetings(db: Db, orgId: string, ids: string[]): Promise<TaskMeeting[] | null> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return []
  const { data, error } = await db
    .from('hoa_meeting_minutes')
    .select('id, meeting_date, meeting_type')
    .eq('org_id', orgId)
    .in('id', unique)
    .order('meeting_date', { ascending: false })
  if (error) {
    console.error('[tasks] meetings read failed', { code: error.code })
    return null
  }
  return (data ?? []) as TaskMeeting[]
}

/** The signed-in member's open tasks, counted against the association's today. */
export async function loadMyTaskCounts(
  db: Db,
  orgId: string,
  userId: string,
  today: string,
): Promise<TaskCounts | null> {
  const { data, error } = await db
    .from('meeting_action_items')
    .select('status, due_date')
    .eq('org_id', orgId)
    .eq('assignee_user_id', userId)
    .in('status', [...TASK_OPEN_STATUSES])
  if (error) {
    console.error('[tasks] my-task count failed', { code: error.code })
    return null
  }
  return taskCounts((data ?? []) as Array<{ status: string; due_date: string | null }>, today)
}

/** "Annual meeting · Oct 14, 2026" — a meeting date is a DATE, so format in UTC. */
export function meetingLabel(m: Pick<TaskMeeting, 'meeting_date' | 'meeting_type'>): string {
  const date = new Date(`${m.meeting_date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const type = m.meeting_type ? `${m.meeting_type.charAt(0).toUpperCase()}${m.meeting_type.slice(1)} meeting` : 'Meeting'
  return `${type} · ${date}`
}
