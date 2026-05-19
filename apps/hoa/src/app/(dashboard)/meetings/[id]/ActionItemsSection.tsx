'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, User2, CalendarDays, AlertCircle } from 'lucide-react'
import { format, isPast, isToday } from 'date-fns'
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Select,
  Textarea,
  StatusBadge,
  useConfirm,
  useToast,
} from '@homeowner-portal/ui'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'
import {
  createActionItem,
  deleteActionItem,
  setActionItemStatus,
  updateActionItem,
  type ActionItemPriority,
  type ActionItemStatus,
  type MeetingActionItem,
} from '@/lib/meeting-action-items'

const STATUS_TONES: Record<string, 'success' | 'warning' | 'neutral' | 'outline'> = {
  open: 'warning',
  in_progress: 'neutral',
  done: 'success',
  cancelled: 'outline',
}
const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
}

interface ActionItemsSectionProps {
  meetingId: string
  items: MeetingActionItem[]
}

export function ActionItemsSection({ meetingId, items }: ActionItemsSectionProps) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [showForm, setShowForm] = useState(items.length === 0)
  const newDescRef = useRef<HTMLTextAreaElement>(null)
  const [pending, startTransition] = useTransition()

  const openCount = items.filter((i) => i.status === 'open' || i.status === 'in_progress').length
  const overdueCount = items.filter(
    (i) =>
      (i.status === 'open' || i.status === 'in_progress') &&
      i.due_date != null &&
      isPast(new Date(i.due_date + 'T23:59:59')) &&
      !isToday(new Date(i.due_date + 'T00:00:00')),
  ).length

  async function handleCreate(formData: FormData) {
    const result = await createActionItem(formData)
    if (!result.ok) {
      toast({ tone: 'error', message: result.error })
      return
    }
    toast({ tone: 'success', message: 'Action item added' })
    setShowForm(false)
    router.refresh()
  }

  async function handleStatusChange(id: string, status: ActionItemStatus) {
    startTransition(async () => {
      const result = await setActionItemStatus(id, status)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      router.refresh()
    })
  }

  async function handleFieldChange(
    id: string,
    patch: Parameters<typeof updateActionItem>[1],
  ) {
    startTransition(async () => {
      const result = await updateActionItem(id, patch)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      router.refresh()
    })
  }

  async function handleDelete(id: string, title: string) {
    const ok = await confirm({
      title: 'Delete action item?',
      description: `"${title}" will be permanently removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const result = await deleteActionItem(id)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Action item deleted' })
      router.refresh()
    })
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Action items
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
            {items.length === 0
              ? 'No items recorded yet'
              : `${items.length} item${items.length === 1 ? '' : 's'}`}
            {openCount > 0 ? (
              <span className="ml-2 text-sm font-normal text-muted">
                · {openCount} open
                {overdueCount > 0 ? (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" /> {overdueCount} overdue
                  </span>
                ) : null}
              </span>
            ) : null}
          </h2>
        </div>
        {!showForm ? (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Add item
          </Button>
        ) : null}
      </header>

      {showForm ? (
        <Card>
          <CardContent className="p-5">
            <form
              action={handleCreate}
              className="space-y-3"
            >
              <input type="hidden" name="meeting_id" value={meetingId} />
              <div>
                <label className="text-xs font-medium text-foreground" htmlFor="ai-title">
                  Title <span className="text-destructive">*</span>
                </label>
                <Input
                  id="ai-title"
                  name="title"
                  required
                  maxLength={200}
                  placeholder="e.g. Send Q4 budget draft to all owners"
                  className="mt-1"
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-foreground" htmlFor="ai-desc">
                    Detail <span className="text-muted">(optional)</span>
                  </label>
                  <AiRewriteButton
                    textareaRef={newDescRef}
                    context="Meeting action-item detail — preserve dates, references, and links exactly"
                  />
                </div>
                <Textarea
                  ref={newDescRef}
                  id="ai-desc"
                  name="description"
                  maxLength={2000}
                  rows={2}
                  placeholder="Context, references, links…"
                  className="mt-1"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-foreground" htmlFor="ai-assignee">
                    Responsible
                  </label>
                  <Input
                    id="ai-assignee"
                    name="assignee_name"
                    maxLength={120}
                    placeholder="Linda W., Treasurer"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground" htmlFor="ai-due">
                    Due date
                  </label>
                  <Input id="ai-due" name="due_date" type="date" className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground" htmlFor="ai-priority">
                    Priority
                  </label>
                  <Select id="ai-priority" name="priority" defaultValue="normal" className="mt-1">
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                {items.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </Button>
                ) : null}
                <Button type="submit" size="sm">
                  Add action item
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {items.length === 0 && !showForm ? (
        <Card>
          <CardContent className="p-5">
            <EmptyState
              title="No action items yet"
              description="Add the follow-ups the board agreed on during the meeting."
              action={
                <Button size="sm" onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4" />
                  Add first item
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : items.length > 0 ? (
        <Card>
          <ul className="divide-y divide-border" aria-busy={pending}>
            {items.map((item) => {
              const overdue =
                (item.status === 'open' || item.status === 'in_progress') &&
                item.due_date != null &&
                isPast(new Date(item.due_date + 'T23:59:59')) &&
                !isToday(new Date(item.due_date + 'T00:00:00'))
              const done = item.status === 'done' || item.status === 'cancelled'

              return (
                <li
                  key={item.id}
                  className={done ? 'bg-muted/10 px-5 py-4' : 'px-5 py-4'}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p
                        className={
                          done
                            ? 'font-medium text-muted line-through'
                            : 'font-medium text-foreground'
                        }
                      >
                        {item.title}
                      </p>
                      {item.description ? (
                        <p className="mt-1 text-sm leading-relaxed text-muted">
                          {item.description}
                        </p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                        {/* Assignee — inline edit */}
                        <label className="flex items-center gap-1.5 text-muted">
                          <User2 className="h-3.5 w-3.5" aria-hidden />
                          <input
                            type="text"
                            defaultValue={item.assignee_name ?? ''}
                            placeholder="Unassigned"
                            className="w-32 bg-transparent text-foreground outline-none placeholder:text-muted/70 focus:underline focus:underline-offset-2"
                            onBlur={(e) => {
                              const next = e.currentTarget.value.trim() || null
                              if (next !== item.assignee_name) {
                                handleFieldChange(item.id, { assignee_name: next })
                              }
                            }}
                          />
                        </label>

                        {/* Due date — inline edit */}
                        <label
                          className={
                            overdue
                              ? 'flex items-center gap-1.5 text-destructive'
                              : 'flex items-center gap-1.5 text-muted'
                          }
                        >
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                          <input
                            type="date"
                            defaultValue={item.due_date ?? ''}
                            className={
                              overdue
                                ? 'bg-transparent text-destructive outline-none focus:underline focus:underline-offset-2'
                                : 'bg-transparent text-foreground outline-none focus:underline focus:underline-offset-2'
                            }
                            onBlur={(e) => {
                              const v = e.currentTarget.value || null
                              if (v !== item.due_date) {
                                handleFieldChange(item.id, { due_date: v })
                              }
                            }}
                          />
                          {overdue ? (
                            <span className="font-medium uppercase tracking-wide">
                              overdue
                            </span>
                          ) : item.due_date ? (
                            <span className="text-muted">
                              ({format(new Date(item.due_date + 'T00:00:00'), 'MMM d')})
                            </span>
                          ) : null}
                        </label>

                        {/* Priority — inline */}
                        <label className="flex items-center gap-1.5 text-muted">
                          Priority
                          <Select
                            value={item.priority}
                            variant="ghost"
                            className="!w-auto !min-h-0 px-2 py-0.5 text-xs"
                            onValueChange={(v) => {
                              handleFieldChange(item.id, {
                                priority: v as ActionItemPriority,
                              })
                            }}
                          >
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                          </Select>
                        </label>

                        {item.priority === 'high' && !done ? (
                          <Badge variant="warning" size="sm">
                            High priority
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Select
                        value={item.status}
                        className="!w-auto px-2 py-1 text-xs"
                        onValueChange={(v) =>
                          handleStatusChange(item.id, v as ActionItemStatus)
                        }
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="done">Done</option>
                        <option value="cancelled">Cancelled</option>
                      </Select>
                      <StatusBadge
                        status={item.status}
                        tones={STATUS_TONES}
                        labels={STATUS_LABELS}
                        size="sm"
                      />
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id, item.title)}
                        className="text-muted hover:text-destructive"
                        aria-label="Delete action item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}
    </section>
  )
}
