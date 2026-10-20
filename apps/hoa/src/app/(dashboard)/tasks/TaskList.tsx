'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, CheckCircle2, Circle, MessageSquare, User2 } from 'lucide-react'
import { Field, Select, StatusPill, cn, useToast } from '@homeowner-portal/ui'
import { assignActionItem, setActionItemStatus, updateActionItem } from '@/lib/meeting-action-items'
import { isOpenTask, taskBucket, type TaskRow } from '@/lib/tasks/model'

export interface TaskAssigneeOption {
  userId: string
  name: string
}

const UNASSIGNED = 'none'
/** A typed-in name from the meeting page, not a board account. Shown, not selectable. */
const FREE_TEXT = 'free-text'

interface TaskListProps {
  tasks: TaskRow[]
  /** null when the board member list could not be read: the picker is hidden, not emptied. */
  assignees: TaskAssigneeOption[] | null
  /** meeting id → "Regular meeting · Oct 14, 2026" */
  meetingLabels: Record<string, string>
  /** The association's today, 'YYYY-MM-DD'. */
  today: string
}

export function TaskList({ tasks, assignees, meetingLabels, today }: TaskListProps) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      if (success) toast({ tone: 'success', message: success })
      router.refresh()
    })
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface" aria-busy={pending}>
      {tasks.map((task) => {
        const open = isOpenTask(task)
        const overdue = taskBucket(task, today) === 'overdue'
        const assigneeValue = task.assignee_user_id
          ? task.assignee_user_id
          : task.assignee_name
            ? FREE_TEXT
            : UNASSIGNED
        const knownAssignee = assignees?.some((a) => a.userId === task.assignee_user_id) ?? false
        return (
          <li key={task.id} className={cn('flex gap-3 px-4 py-3', !open && 'bg-subtle/60')}>
            <button
              type="button"
              className="mt-0.5 shrink-0 rounded-full text-muted outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-pressed={!open}
              aria-label={open ? `Mark “${task.title}” done` : `Reopen “${task.title}”`}
              disabled={pending}
              onClick={() =>
                run(
                  () => setActionItemStatus(task.id, open ? 'done' : 'open'),
                  open ? 'Task marked done' : 'Task reopened',
                )
              }
            >
              {open ? <Circle className="size-5" aria-hidden /> : <CheckCircle2 className="size-5 text-success" aria-hidden />}
            </button>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="space-y-0.5">
                <p className={cn('font-medium', open ? 'text-foreground' : 'text-muted line-through')}>{task.title}</p>
                {task.description ? (
                  <p className="line-clamp-2 text-sm text-foreground-secondary">{task.description}</p>
                ) : null}
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {task.meeting_id ? (
                    <Link href={`/meetings/${task.meeting_id}`} className="inline-flex items-center gap-1 hover:text-primary hover:underline">
                      <CalendarDays className="size-3.5" aria-hidden />
                      {meetingLabels[task.meeting_id] ?? 'Meeting minutes'}
                    </Link>
                  ) : null}
                  {task.ticket_id ? (
                    <Link href={`/tickets/${task.ticket_id}`} className="inline-flex items-center gap-1 hover:text-primary hover:underline">
                      <MessageSquare className="size-3.5" aria-hidden />
                      From a ticket
                    </Link>
                  ) : null}
                  {task.status === 'cancelled' ? <span>Cancelled</span> : null}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {assignees ? (
                  <Field label={`Assignee of “${task.title}”`} hideLabel>
                    <Select
                      value={assigneeValue}
                      variant="ghost"
                      className="h-8 w-auto min-w-[9rem] text-sm sm:h-8"
                      disabled={pending || !open}
                      onValueChange={(v) => {
                        if (v === FREE_TEXT || v === assigneeValue) return
                        run(() => assignActionItem(task.id, v === UNASSIGNED ? null : v), 'Task assigned')
                      }}
                    >
                      <option value={UNASSIGNED}>Unassigned</option>
                      {task.assignee_user_id && !knownAssignee ? (
                        <option value={task.assignee_user_id}>{task.assignee_name ?? 'Former board member'}</option>
                      ) : null}
                      {!task.assignee_user_id && task.assignee_name ? (
                        <option value={FREE_TEXT}>{task.assignee_name}</option>
                      ) : null}
                      {assignees.map((a) => (
                        <option key={a.userId} value={a.userId}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <User2 className="size-4" aria-hidden />
                    {task.assignee_name ?? 'Unassigned'}
                  </span>
                )}

                <label className={cn('flex items-center gap-1.5', overdue ? 'text-danger' : 'text-muted')}>
                  <span className="sr-only">Due date of “{task.title}”</span>
                  <input
                    type="date"
                    defaultValue={task.due_date ?? ''}
                    disabled={pending || !open}
                    className={cn(
                      'num h-8 rounded-md border border-transparent bg-transparent px-1.5 outline-none hover:border-border focus:border-ring focus:ring-2 focus:ring-ring/25',
                      overdue ? 'text-danger' : 'text-foreground',
                    )}
                    onBlur={(e) => {
                      const v = e.currentTarget.value || null
                      if (v !== task.due_date) run(() => updateActionItem(task.id, { due_date: v }), 'Due date saved')
                    }}
                  />
                </label>

                {overdue ? <StatusPill tone="danger" label="Overdue" /> : null}
                {task.priority === 'high' && open && !overdue ? <StatusPill tone="warning" label="High priority" /> : null}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
