'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ListChecks, Plus, User2 } from 'lucide-react'
import { isPast, isToday } from 'date-fns'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Select,
  StatusPill,
  Textarea,
  cn,
  useToast,
} from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import {
  createActionItem,
  deleteActionItem,
  setActionItemStatus,
  updateActionItem,
  type ActionItemPriority,
  type ActionItemStatus,
  type MeetingActionItem,
} from '@/lib/meeting-action-items'

interface ActionItemsSectionProps {
  meetingId: string
  items: MeetingActionItem[]
}

function isOverdue(item: MeetingActionItem): boolean {
  return (
    (item.status === 'open' || item.status === 'in_progress') &&
    item.due_date != null &&
    isPast(new Date(item.due_date + 'T23:59:59')) &&
    !isToday(new Date(item.due_date + 'T00:00:00'))
  )
}

export function ActionItemsSection({ meetingId, items }: ActionItemsSectionProps) {
  const router = useRouter()
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [creating, startCreate] = useTransition()
  const newDescRef = useRef<HTMLTextAreaElement>(null)
  const [pending, startTransition] = useTransition()

  const openCount = items.filter((i) => i.status === 'open' || i.status === 'in_progress').length
  const overdueCount = items.filter(isOverdue).length

  function handleCreate(formData: FormData) {
    setFieldErrors({})
    startCreate(async () => {
      const result = await createActionItem(formData)
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
          setFieldErrors(result.fieldErrors)
        } else {
          toast({ tone: 'error', message: result.error })
        }
        return
      }
      toast({ tone: 'success', message: 'Action item added' })
      setShowForm(false)
      router.refresh()
    })
  }

  function handleStatusChange(id: string, status: ActionItemStatus) {
    startTransition(async () => {
      const result = await setActionItemStatus(id, status)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      router.refresh()
    })
  }

  function handleFieldChange(id: string, patch: Parameters<typeof updateActionItem>[1]) {
    startTransition(async () => {
      const result = await updateActionItem(id, patch)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      router.refresh()
    })
  }

  const summary =
    items.length === 0
      ? 'Follow-ups the board agreed on, with an owner and a due date.'
      : `${items.length} item${items.length === 1 ? '' : 's'} · ${openCount} open`

  return (
    <Card>
      <CardHeader
        actions={
          !showForm ? (
            <Button size="sm" variant="secondary" icon={<Plus aria-hidden />} onClick={() => setShowForm(true)}>
              Add item
            </Button>
          ) : null
        }
      >
        <CardTitle as="h2" className="flex items-center gap-2">
          <ListChecks className="size-4 text-muted" aria-hidden />
          Action items
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-2">
          <span className="num">{summary}</span>
          {overdueCount > 0 ? (
            <span className="inline-flex items-center gap-1 font-medium text-danger">
              <AlertCircle className="size-3.5" aria-hidden />
              {overdueCount} overdue
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>

      {showForm ? (
        <CardContent>
          <form action={handleCreate} className="space-y-4 rounded-lg border border-border bg-subtle p-4" noValidate>
            <input type="hidden" name="meeting_id" value={meetingId} />
            <Field label="Title" required error={fieldErrors.title}>
              <Input
                name="title"
                required
                maxLength={200}
                autoFocus
                placeholder="e.g. Send Q4 budget draft to all owners"
              />
            </Field>
            <Field
              label="Detail"
              optional
              error={fieldErrors.description}
              labelAside={
                <AiRewriteButton
                  textareaRef={newDescRef}
                  context="Meeting action-item detail — preserve dates, references, and links exactly"
                />
              }
            >
              <Textarea
                ref={newDescRef}
                name="description"
                maxLength={2000}
                rows={2}
                placeholder="Context, references, links…"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Responsible" optional error={fieldErrors.assignee_name}>
                <Input name="assignee_name" maxLength={120} placeholder="Linda W., Treasurer" />
              </Field>
              <Field label="Due date" optional error={fieldErrors.due_date}>
                <Input name="due_date" type="date" />
              </Field>
              <Field label="Priority" error={fieldErrors.priority}>
                <Select name="priority" defaultValue="normal">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </Select>
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false)
                  setFieldErrors({})
                }}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={creating}>
                Add action item
              </Button>
            </div>
          </form>
        </CardContent>
      ) : null}

      {items.length === 0 ? (
        showForm ? null : (
          <CardContent>
            <EmptyState
              variant="compact"
              icon={<ListChecks aria-hidden />}
              title="No action items yet"
              description="Add the follow-ups the board agreed on so each one has an owner and a due date."
              action={
                <Button size="sm" icon={<Plus aria-hidden />} onClick={() => setShowForm(true)}>
                  Add first item
                </Button>
              }
            />
          </CardContent>
        )
      ) : (
        <ul className="divide-y divide-border border-t border-border" aria-busy={pending}>
          {items.map((item) => {
            const overdue = isOverdue(item)
            const done = item.status === 'done' || item.status === 'cancelled'
            return (
              <li key={item.id} className={cn('px-5 py-4', done && 'bg-subtle/60')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className={cn('font-medium', done ? 'text-muted line-through' : 'text-foreground')}>
                      {item.title}
                    </p>
                    {item.description ? (
                      <p className="text-sm leading-relaxed text-foreground-secondary">{item.description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Field label={`Status of “${item.title}”`} hideLabel>
                      <Select
                        value={item.status}
                        className="h-8 w-[8.5rem] text-sm sm:h-8"
                        onValueChange={(v) => handleStatusChange(item.id, v as ActionItemStatus)}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="done">Done</option>
                        <option value="cancelled">Cancelled</option>
                      </Select>
                    </Field>
                    <ConfirmDeleteButton
                      onDelete={() => deleteActionItem(item.id)}
                      title="Delete action item?"
                      description={`“${item.title}” will be permanently removed.`}
                      successMessage="Action item deleted"
                      onAfterDelete={() => router.refresh()}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <label className="flex items-center gap-1.5 text-muted">
                    <User2 className="size-4" aria-hidden />
                    <span className="sr-only">Responsible</span>
                    <input
                      type="text"
                      defaultValue={item.assignee_name ?? ''}
                      placeholder="Unassigned"
                      className="h-8 w-36 rounded-md border border-transparent bg-transparent px-1.5 text-foreground outline-none placeholder:text-muted hover:border-border focus:border-ring focus:ring-2 focus:ring-ring/25"
                      onBlur={(e) => {
                        const next = e.currentTarget.value.trim() || null
                        if (next !== item.assignee_name) handleFieldChange(item.id, { assignee_name: next })
                      }}
                    />
                  </label>

                  <label className={cn('flex items-center gap-1.5', overdue ? 'text-danger' : 'text-muted')}>
                    <span className="sr-only">Due date</span>
                    <input
                      type="date"
                      defaultValue={item.due_date ?? ''}
                      className={cn(
                        'num h-8 rounded-md border border-transparent bg-transparent px-1.5 outline-none hover:border-border focus:border-ring focus:ring-2 focus:ring-ring/25',
                        overdue ? 'text-danger' : 'text-foreground',
                      )}
                      onBlur={(e) => {
                        const v = e.currentTarget.value || null
                        if (v !== item.due_date) handleFieldChange(item.id, { due_date: v })
                      }}
                    />
                  </label>

                  <Field label={`Priority of “${item.title}”`} hideLabel>
                    <Select
                      value={item.priority}
                      variant="ghost"
                      className="h-8 w-auto text-sm sm:h-8"
                      onValueChange={(v) => handleFieldChange(item.id, { priority: v as ActionItemPriority })}
                    >
                      <option value="low">Low priority</option>
                      <option value="normal">Normal priority</option>
                      <option value="high">High priority</option>
                    </Select>
                  </Field>

                  {overdue ? <StatusPill tone="danger" label="Overdue" /> : null}
                  {item.priority === 'high' && !done && !overdue ? <StatusPill tone="warning" label="High priority" /> : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
