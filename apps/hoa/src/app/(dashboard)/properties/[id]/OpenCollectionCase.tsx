'use client'

import { useState, useTransition } from 'react'
import { Alert, Button, Card, CardContent, Input, Select } from '@homeowner-portal/ui'
import { openCollectionCase } from '@/lib/collections/actions'
import { COLLECTION_STATUSES, collectionStatusLabel, isTerminal } from '@/lib/collections/statuses'

/**
 * Opens a collections case for a unit.
 *
 * The stage is chosen up front rather than always starting at 'monitoring':
 * every real case being entered today already happened — Kaur is at "Lien
 * Letter", Wilson is with the attorney — so forcing a start at the bottom
 * of the ladder would mean recording a fiction and then immediately
 * correcting it.
 */
export function OpenCollectionCase({ unitId }: { unitId: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Open a collections case
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
            startTransition(async () => {
              const result = await openCollectionCase({
                unitId,
                status: formData.get('status') as never,
                attorneyFirm: String(formData.get('attorneyFirm') ?? '').trim() || undefined,
                attorneyReference:
                  String(formData.get('attorneyReference') ?? '').trim() || undefined,
                openedOn: String(formData.get('openedOn') ?? '').trim() || undefined,
              })
              if (!result.ok) setError(result.error)
              else setOpen(false)
            })
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Current stage</span>
              <Select name="status" defaultValue="monitoring">
                {/* Terminal states are excluded: opening a case that is
                    already resolved records nothing useful, and the partial
                    unique index would then let a second one be opened
                    alongside it. */}
                {COLLECTION_STATUSES.filter((s) => !isTerminal(s)).map((s) => (
                  <option key={s} value={s}>
                    {collectionStatusLabel(s)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Opened on</span>
              <Input type="date" name="openedOn" max={new Date().toISOString().slice(0, 10)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Attorney firm</span>
              <Input name="attorneyFirm" placeholder="Dorough &amp; Dorough, LLC" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Their file no.</span>
              <Input name="attorneyReference" />
            </label>
          </div>

          {error ? <Alert variant="error">{error}</Alert> : null}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Opening…' : 'Open case'}
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
