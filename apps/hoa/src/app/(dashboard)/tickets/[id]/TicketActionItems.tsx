'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ClipboardList, Plus } from 'lucide-react'
import { Button, EmptyState, Field, Input, Select, StatusBadge, Textarea, useToast } from '@homeowner-portal/ui'
import { createActionItemFromTicket, type TicketActionItem } from '@/lib/tickets'
import { ACTION_ITEM_STATUS } from '@/lib/status/community'

type FieldErrors = Partial<Record<'title' | 'description' | 'assigneeName' | 'dueDate' | 'priority', string>>

export function TicketActionItems({
  ticketId,
  items,
}: {
  ticketId: string
  items: TicketActionItem[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [errors, setErrors] = useState<FieldErrors>({})

  function handleSubmit(formData: FormData) {
    setErrors({})
    const title = String(formData.get('title') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim() || undefined
    const assigneeName = String(formData.get('assignee_name') ?? '').trim() || undefined
    const dueDate = String(formData.get('due_date') ?? '').trim() || undefined
    const priority = (String(formData.get('priority') ?? '') || 'normal') as 'low' | 'normal' | 'high'
    if (!title) {
      setErrors({ title: 'Give the action item a title.' })
      return
    }

    startTransition(async () => {
      const result = await createActionItemFromTicket({
        ticketId,
        title,
        description,
        assigneeName,
        dueDate,
        priority,
      })
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
          setErrors(result.fieldErrors as FieldErrors)
        } else {
          toast({ tone: 'error', message: result.error })
        }
        return
      }
      toast({ tone: 'success', message: 'Action item created.' })
      setShowForm(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {items.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted">
                  {item.assignee_name ?? 'Unassigned'}
                  {item.due_date ? ` · Due ${format(parseISO(item.due_date), 'MMM d, yyyy')}` : ''}
                </p>
              </div>
              <StatusBadge status={item.status} tones={ACTION_ITEM_STATUS.tones} labels={ACTION_ITEM_STATUS.labels} />
            </li>
          ))}
        </ul>
      ) : showForm ? null : (
        <EmptyState
          variant="compact"
          icon={<ClipboardList aria-hidden />}
          title="No action items"
          description="Turn this request into tracked work with an owner and a due date."
        />
      )}

      {showForm ? (
        <form action={handleSubmit} className="space-y-4 rounded-lg border border-border bg-subtle/40 p-4" noValidate>
          <Field label="Title" required error={errors.title}>
            <Input name="title" maxLength={200} placeholder="What needs to be done?" autoFocus />
          </Field>
          <Field label="Description" optional error={errors.description}>
            <Textarea name="description" rows={2} maxLength={2000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Assignee" optional error={errors.assigneeName}>
              <Input name="assignee_name" maxLength={120} placeholder="Name" />
            </Field>
            <Field label="Due date" optional error={errors.dueDate}>
              <Input name="due_date" type="date" />
            </Field>
            <Field label="Priority" error={errors.priority}>
              <Select name="priority" defaultValue="normal">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="secondary" size="sm" loading={isPending}>
              Create action item
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" size="sm" icon={<Plus aria-hidden />} onClick={() => setShowForm(true)}>
          Add action item
        </Button>
      )}
    </div>
  )
}
