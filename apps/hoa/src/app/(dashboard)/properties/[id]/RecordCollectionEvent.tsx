'use client'

import { useState, useTransition } from 'react'
import { Alert, Button, Card, CardContent, Input, Select, Textarea } from '@homeowner-portal/ui'
import { recordCollectionEvent } from '@/lib/collections/actions'
import {
  COLLECTION_EVENT_TYPES,
  collectionEventLabel,
  collectionStatusLabel,
  statusImpliedBy,
  type CollectionEventType,
  type CollectionStatus,
} from '@/lib/collections/statuses'

/**
 * Append one action to the case trail.
 *
 * Entries are immutable once written (0047 grants INSERT but no UPDATE or
 * DELETE), so the form says so before you submit rather than after.
 */
export function RecordCollectionEvent({
  caseId,
  currentStatus,
}: {
  caseId: string
  currentStatus: CollectionStatus
}) {
  const [open, setOpen] = useState(false)
  const [eventType, setEventType] = useState<CollectionEventType>('note')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const implied = statusImpliedBy(eventType)
  // Only offer to move the stage when it would actually change something.
  const wouldAdvance = implied !== null && implied !== currentStatus

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Record an action
      </Button>
    )
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <form
          className="space-y-3"
          action={(formData: FormData) => {
            setError(null)
            const rawAmount = String(formData.get('amount') ?? '').trim()
            startTransition(async () => {
              const result = await recordCollectionEvent({
                caseId,
                eventType,
                occurredOn: String(formData.get('occurredOn') ?? ''),
                note: String(formData.get('note') ?? '').trim() || undefined,
                // An empty box means "no amount", not zero — a $0 demand
                // letter is a different claim from one with no figure.
                amount: rawAmount === '' ? undefined : Number(rawAmount),
                actorInitials: String(formData.get('actorInitials') ?? '').trim() || undefined,
                advanceStatus: formData.get('advanceStatus') === 'on',
              })
              if (!result.ok) setError(result.error)
              else setOpen(false)
            })
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted">What happened</span>
              <Select
                name="eventType"
                value={eventType}
                onValueChange={(v) => setEventType(v as CollectionEventType)}
              >
                {COLLECTION_EVENT_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {collectionEventLabel(k)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Date it happened</span>
              <Input
                type="date"
                name="occurredOn"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Amount (optional)</span>
              <Input type="number" name="amount" step="0.01" min="0" placeholder="5595.71" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Initials (optional)</span>
              <Input name="actorInitials" maxLength={8} placeholder="ms" />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-muted">Note (optional)</span>
            <Textarea name="note" rows={2} placeholder="D&amp;D sent dvl to owner" />
          </label>

          {wouldAdvance ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="advanceStatus" defaultChecked className="h-4 w-4" />
              <span>
                Also move this case to{' '}
                <strong className="font-medium">{collectionStatusLabel(implied)}</strong>
              </span>
            </label>
          ) : null}

          {error ? <Alert variant="error">{error}</Alert> : null}

          <p className="text-xs text-muted">
            Entries cannot be edited or deleted once saved. Correct a mistake by adding a note.
          </p>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Saving…' : 'Record'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
