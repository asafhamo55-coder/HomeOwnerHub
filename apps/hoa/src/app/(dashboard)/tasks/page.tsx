import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, ListTodo } from 'lucide-react'
import { Button, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSignedInUser } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { currentTimeZone } from '@/lib/association-time-current'
import { todayIn } from '@/lib/association-time'
import { listAssignees, type Assignee } from '@/lib/inbox/assignees'
import { timed } from '@/lib/perf/timing'
import { TASK_BUCKETS, applyTaskFilters, groupTasks, parseTaskFilters } from '@/lib/tasks/model'
import { OPEN_TASK_LIMIT, loadBoardTasks, loadTaskMeetings, meetingLabel } from '@/lib/tasks/queries'
import { HowThisWorks } from '@/components/guide/HowThisWorks'
import { guideHref } from '@/lib/guide'
import { SummaryStrip } from '@/components/SummaryStrip'
import { isDoneRecently, parseTaskView, summarizeTasks } from '@/lib/tasks/strip'
import { AlertTriangle, CalendarClock, CheckCircle2, UserX } from 'lucide-react'
import { TaskFilterBar } from './TaskFilterBar'
import { TaskList } from './TaskList'

export const metadata = { title: 'Tasks' }
export const dynamic = 'force-dynamic'

/**
 * BL-119 board task list: every meeting action item (and ticket follow-up)
 * in one place, grouped Overdue / This week / Later / Done. Board and admin
 * only: anyone else gets a 404 before a row is read (RLS, 0063, refuses
 * them too).
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ assignee?: string; meeting?: string; view?: string }>
}) {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) notFound()

  const [supabase, user, timeZone, sp] = await Promise.all([
    getSupabaseServerClient(),
    getSignedInUser(),
    currentTimeZone(),
    searchParams,
  ])
  const today = todayIn(timeZone)
  const filters = parseTaskFilters(sp)
  const view = parseTaskView(sp.view)

  const [loaded, assignees] = await Promise.all([
    timed('/tasks', 'tasks.list', () => loadBoardTasks(supabase, gate.orgId)),
    // A failed member read hides the picker; it never empties it.
    listAssignees(gate.orgId).catch((): Assignee[] | null => null),
  ])

  const header = {
    title: 'Tasks',
    description: 'Everything the board agreed to do, with who owns it and when it is due.',
    actions: (
      <Button asChild variant="secondary">
        <Link href="/meetings">
          <CalendarDays className="size-4" aria-hidden />
          Meetings
        </Link>
      </Button>
    ),
  }

  if (!loaded) {
    return (
      <Page {...header}>
        <LoadFailed what="tasks" retryHref="/tasks" />
      </Page>
    )
  }

  const meetingIds = loaded.tasks.map((t) => t.meeting_id).filter((id): id is string => Boolean(id))
  const meetings = await loadTaskMeetings(supabase, gate.orgId, meetingIds)
  const meetingLabels: Record<string, string> = {}
  for (const m of meetings ?? []) meetingLabels[m.id] = meetingLabel(m)

  if (loaded.tasks.length === 0) {
    return (
      <Page {...header}>
        <EmptyState
          icon={<ListTodo aria-hidden />}
          title="No tasks yet"
          description="Tasks are the action items from your meetings and tickets. Open a meeting and add an action item to start the list."
          action={
            <Button asChild>
              <Link href="/meetings">Open Meetings</Link>
            </Button>
          }
          secondaryAction={<HowThisWorks href={guideHref('meetings-board-tasks')} />}
        />
      </Page>
    )
  }

  const visible = applyTaskFilters(loaded.tasks, filters, user?.id ?? null)
  const summary = summarizeTasks(loaded.tasks, today, timeZone)
  const groups = groupTasks(visible, today)
  // A tile's view narrows to one bucket; "done_recent" also drops older Done rows.
  if (view === 'done_recent') groups.done = groups.done.filter((t) => isDoneRecently(t, today, timeZone))
  const shownBuckets = TASK_BUCKETS.filter(({ id }) =>
    view === 'all' ? true : view === 'done_recent' ? id === 'done' : id === view,
  )
  const shownCount = shownBuckets.reduce((n, { id }) => n + groups[id].length, 0)
  const filtered = filters.assignee !== 'all' || filters.meeting !== 'all' || view !== 'all'

  return (
    <Page {...header}>
      <SummaryStrip
        ariaLabel="Tasks summary"
        testId="tasks-summary"
        tiles={[
          {
            label: 'Overdue',
            icon: <AlertTriangle />,
            value: String(summary.overdue),
            hint: summary.overdue === 0 ? 'Nothing is late' : 'Open and past due',
            href: '/tasks?view=overdue',
            tone: summary.overdue > 0 ? 'danger' : 'default',
          },
          {
            label: 'Due in 7 days',
            icon: <CalendarClock />,
            value: String(summary.dueSoon),
            hint: 'Today and the next six days',
            href: '/tasks?view=this_week',
          },
          {
            label: 'Unassigned',
            icon: <UserX />,
            value: String(summary.unassigned),
            hint: summary.unassigned === 0 ? 'Every open task has an owner' : 'Open with no owner',
            href: '/tasks?assignee=unassigned',
            tone: summary.unassigned > 0 ? 'warning' : 'default',
          },
          {
            label: 'Done in 30 days',
            icon: <CheckCircle2 />,
            value: String(summary.doneRecently),
            hint: 'Finished in the last 30 days',
            href: '/tasks?view=done_recent',
          },
        ]}
      />

      <TaskFilterBar
        assignee={filters.assignee}
        meeting={filters.meeting}
        assignees={assignees}
        meetings={(meetings ?? []).map((m) => ({ id: m.id, label: meetingLabel(m) }))}
      />

      {meetings === null ? (
        <LoadFailed what="meeting names" hint="The tasks below are correct; only their meeting labels are missing." />
      ) : null}
      {assignees === null ? (
        <LoadFailed what="board members" hint="Tasks still show; assigning is unavailable until the list loads." />
      ) : null}
      {loaded.truncated ? (
        <p className="text-sm text-muted">
          Showing the {OPEN_TASK_LIMIT.toLocaleString()} soonest-due of {loaded.openTotal.toLocaleString()} open tasks.
          Filter by meeting or assignee to narrow the list.
        </p>
      ) : null}

      {shownCount === 0 ? (
        <EmptyState
          variant="compact"
          icon={<ListTodo aria-hidden />}
          title="No tasks match these filters"
          description="Try another board member, meeting or summary tile."
          action={
            <Button asChild variant="secondary">
              <Link href="/tasks">Show all tasks</Link>
            </Button>
          }
        />
      ) : (
        shownBuckets.map(({ id, label }) => {
          const rows = groups[id]
          if (rows.length === 0) return null
          return (
            <section key={id} aria-labelledby={`tasks-${id}`} className="space-y-3">
              <h2
                id={`tasks-${id}`}
                className={`flex items-baseline gap-2 text-lg font-semibold ${id === 'overdue' ? 'text-danger' : 'text-foreground'}`}
              >
                {label}
                <span className="num text-sm font-normal text-muted">{rows.length}</span>
              </h2>
              <TaskList tasks={rows} assignees={assignees} meetingLabels={meetingLabels} today={today} />
            </section>
          )
        })
      )}
      {filtered ? null : (
        <p className="text-xs text-muted">Done shows the 50 most recently finished tasks.</p>
      )}
    </Page>
  )
}
