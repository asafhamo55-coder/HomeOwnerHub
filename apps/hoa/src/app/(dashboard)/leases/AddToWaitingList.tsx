'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, X } from 'lucide-react'
import { Badge, Button, Card, Input, Textarea, useToast } from '@homeowner-portal/ui'
import { addToWaitingList, type WaitingListCandidate } from '@/lib/leases'

/**
 * Queue a property onto the lease waiting list from /leases.
 *
 * The property detail page has had this action since 0017, but only for
 * an owner-occupied property whose association has a cap — so a manager
 * working the waiting list itself had no way to add to it without first
 * hunting down the right property. This is that entry point.
 *
 * A plain <Select> would be a 180-item scroll on a real association, so
 * the picker is a filter box over a bounded list. Candidates are already
 * narrowed server-side to properties that aren't leased and aren't
 * queued — the two states the action would reject anyway.
 */
export function AddToWaitingList({
  candidates,
}: {
  /** `null` means the candidate read failed — distinct from `[]`, which
   *  means nothing is eligible. The two get different copy: claiming
   *  "everything is leased or already listed" after a failed query is a
   *  specific false statement about the user's data. */
  candidates: WaitingListCandidate[] | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [pending, startTransition] = useTransition()

  const available = candidates ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return available
    return available.filter((c) =>
      [c.address, c.unit_number, c.owner_name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    )
  }, [available, search])

  const selected = available.find((c) => c.id === selectedId) ?? null

  function reset() {
    setOpen(false)
    setSearch('')
    setSelectedId(null)
    setNotes('')
  }

  function handleAdd() {
    if (!selectedId) return
    startTransition(async () => {
      const result = await addToWaitingList({
        propertyId: selectedId,
        notes: notes.trim() || undefined,
      })
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({
        tone: 'success',
        message: `${labelFor(selected)} added to the waiting list.`,
      })
      reset()
      router.refresh()
    })
  }

  if (!open) {
    const blocked = candidates === null || candidates.length === 0
    return (
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        disabled={blocked}
        title={
          candidates === null
            ? "Couldn't load the property list — refresh and try again."
            : candidates.length === 0
              ? 'Every property in this association is either leased or already on the list.'
              : undefined
        }
      >
        <Plus className="h-3.5 w-3.5" />
        Add property
      </Button>
    )
  }

  return (
    <Card className="w-full space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Add a property to the waiting list
          </h3>
          <p className="text-xs text-muted">
            {available.length}{' '}
            {available.length === 1 ? 'property is' : 'properties are'} eligible
            — leased and already-queued properties are excluded.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={reset} disabled={pending}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by address, unit, or owner"
        prefix={<Search className="h-4 w-4" />}
        aria-label="Search properties"
        disabled={pending}
      />

      {filtered.length === 0 ? (
        <p className="px-1 py-4 text-center text-sm text-muted">
          No eligible property matches &ldquo;{search.trim()}&rdquo;.
        </p>
      ) : (
        <ul
          className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border"
          role="listbox"
          aria-label="Eligible properties"
        >
          {filtered.map((c) => {
            const isSelected = c.id === selectedId
            return (
              <li key={c.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => setSelectedId(c.id)}
                  disabled={pending}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/10 ${
                    isSelected ? 'bg-primary/5 ring-1 ring-inset ring-primary' : ''
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {labelFor(c)}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {c.owner_name ?? 'No owner on file'}
                    </span>
                  </span>
                  {c.tenure === 'unknown' ? (
                    <Badge variant="neutral" size="sm">
                      Tenure unknown
                    </Badge>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional) — e.g. why they're queuing, or who asked."
        rows={2}
        maxLength={2000}
        disabled={pending}
      />

      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto truncate text-xs text-muted">
          {selected ? `Selected: ${labelFor(selected)}` : 'Pick a property above.'}
        </span>
        <Button
          size="sm"
          onClick={handleAdd}
          loading={pending}
          disabled={pending || !selectedId}
        >
          <Plus className="h-3.5 w-3.5" />
          Add to waiting list
        </Button>
      </div>
    </Card>
  )
}

function labelFor(c: WaitingListCandidate | null): string {
  if (!c) return 'Property'
  return c.unit_number ? `${c.address} · Unit ${c.unit_number}` : c.address
}
