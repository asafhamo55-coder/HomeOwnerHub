'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Badge, Button, Input, Select, Textarea } from '@homeowner-portal/ui'
import { createActionItemFromTicket, type TicketActionItem } from '@/lib/tickets'

export function TicketActionItems({
  ticketId,
  items,
}: {
  ticketId: string
  items: TicketActionItem[]
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)
    const title = String(formData.get('title') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim() || undefined
    const assigneeName = String(formData.get('assignee_name') ?? '').trim() || undefined
    const dueDate = String(formData.get('due_date') ?? '').trim() || undefined
    const priority = (String(formData.get('priority') ?? '') || 'normal') as 'low' | 'normal' | 'high'

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
        setError(result.error)
        return
      }
      setShowForm(false)
      router.refresh()
    })
  }

  const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline' | 'destructive'> = {
    open: 'outline',
    in_progress: 'warning',
    done: 'success',
    cancelled: 'destructive',
  }

  return (
    <div className="space-y-4">
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted">
                  {item.assignee_name ?? 'Unassigned'}
                  {item.due_date ? ` · Due ${item.due_date}` : ''}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[item.status] ?? 'outline'} size="sm">
                {item.status.replace('_', ' ')}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No action items linked to this ticket.</p>
      )}

      {showForm ? (
        <form action={handleSubmit} className="space-y-3 rounded-md border border-border p-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Title *</span>
            <Input name="title" required maxLength={200} placeholder="What needs to be done?" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Description</span>
            <Textarea name="description" rows={2} maxLength={2000} />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Assignee</span>
              <Input name="assignee_name" maxLength={120} placeholder="Name" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Due date</span>
              <Input name="due_date" type="date" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Priority</span>
              <Select name="priority">
                <option value="low">Low</option>
                <option value="normal" selected>Normal</option>
                <option value="high">High</option>
              </Select>
            </label>
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} size="sm">
              {isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add action item
        </Button>
      )}
    </div>
  )
}
