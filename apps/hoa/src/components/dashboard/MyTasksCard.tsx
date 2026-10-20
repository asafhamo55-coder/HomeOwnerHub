import Link from 'next/link'
import { ArrowRight, ListTodo } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, StatusPill } from '@homeowner-portal/ui'
import type { TaskCounts } from '@/lib/tasks/model'
import { FailedNote } from './BreakdownList'

/**
 * BL-119 "My tasks": the signed-in board member's open tasks, with how many
 * are overdue and due this week, linking to /tasks filtered to them.
 */
export function MyTasksCard({ counts }: { counts: TaskCounts | null }) {
  return (
    <Card>
      <CardHeader
        className="pb-3"
        actions={counts && counts.overdue > 0 ? <StatusPill tone="danger" label={`${counts.overdue} overdue`} /> : null}
      >
        <CardTitle as="h2" className="flex items-center gap-2">
          <ListTodo className="size-4 text-muted" aria-hidden />
          My tasks
        </CardTitle>
      </CardHeader>
      <CardContent>
        {counts === null ? (
          <FailedNote what="your tasks" />
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-foreground-secondary">{summary(counts)}</p>
            <Link
              href={counts.open > 0 ? '/tasks?assignee=me' : '/tasks'}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {counts.open > 0 ? 'Open my tasks' : 'See all board tasks'} <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function summary(c: TaskCounts): string {
  if (c.open === 0) return 'Nothing assigned to you right now.'
  const parts = [plural(c.dueThisWeek, 'task due this week', 'tasks due this week')]
  if (c.overdue > 0) parts.unshift(plural(c.overdue, 'task overdue', 'tasks overdue'))
  return `${parts.join(', ')} · ${plural(c.open, 'open task', 'open tasks')} in all.`
}
