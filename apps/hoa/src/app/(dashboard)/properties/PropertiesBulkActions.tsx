'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckSquare2 } from 'lucide-react'
import { Badge, Button, Select, useConfirm, useToast } from '@homeowner-portal/ui'
import { bulkSetPropertyTenure } from '@/lib/properties'

// Self-contained client list that owns the checkbox selection state and
// the bulk-action bar. The server component passes in already-filtered
// rows so search/tenure filters keep working — we only own selection.

type Tenure = 'owner_occupied' | 'leased' | 'unknown'

interface PropertyRow {
  id: string
  address: string
  unit_number: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  tenure: Tenure | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

const TENURE_LABEL: Record<Tenure, string> = {
  owner_occupied: 'Owner-occupied',
  leased: 'Leased',
  unknown: 'Unknown',
}

const TENURE_VARIANT: Record<Tenure, 'success' | 'warning' | 'neutral'> = {
  owner_occupied: 'success',
  leased: 'warning',
  unknown: 'neutral',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function PropertiesBulkActions({ properties }: { properties: PropertyRow[] }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [targetTenure, setTargetTenure] = useState<Tenure>('owner_occupied')

  const allIds = useMemo(() => properties.map((p) => p.id), [properties])
  const allSelected = selected.size > 0 && selected.size === allIds.length
  const someSelected = selected.size > 0 && !allSelected

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(allIds) : new Set())
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function handleApply() {
    if (selected.size === 0) return
    const count = selected.size
    startTransition(async () => {
      const ok = await confirm({
        title: `Set tenure for ${count} ${count === 1 ? 'property' : 'properties'}?`,
        description: `This will log a history event on each. Target: ${TENURE_LABEL[targetTenure]}.`,
        confirmLabel: 'Apply',
      })
      if (!ok) return
      const result = await bulkSetPropertyTenure({
        propertyIds: Array.from(selected),
        tenure: targetTenure,
      })
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      const { updated, failed } = result.data
      if (failed > 0) {
        toast({
          tone: 'error',
          message: `Updated ${updated} · ${failed} failed. Check console for details.`,
        })
      } else {
        toast({
          tone: 'success',
          message: `Updated ${updated} ${updated === 1 ? 'property' : 'properties'} to ${TENURE_LABEL[targetTenure]}.`,
        })
      }
      clearSelection()
      router.refresh()
    })
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-10 px-3 py-3 font-medium">
                <input
                  type="checkbox"
                  aria-label={
                    allSelected ? 'Deselect all properties' : 'Select all properties'
                  }
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-border text-primary focus:ring-primary"
                />
              </th>
              <th className="px-4 py-3 font-medium">Address</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Unit</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Owner</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Email</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Phone</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Tenure</th>
              <th className="hidden px-4 py-3 font-medium xl:table-cell">Notes</th>
              <th className="hidden px-4 py-3 font-medium xl:table-cell">Added</th>
              <th className="hidden px-4 py-3 font-medium xl:table-cell">Updated</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => {
              const tenure: Tenure = p.tenure ?? 'unknown'
              const checked = selected.has(p.id)
              return (
                <tr
                  key={p.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-background/50 data-[selected=true]:bg-primary/5"
                  data-selected={checked || undefined}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${p.address}`}
                      checked={checked}
                      onChange={(e) => toggleOne(p.id, e.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border-border text-primary focus:ring-primary"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/properties/${p.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {p.address}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">
                    {p.unit_number ?? '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">
                    {p.owner_name ?? '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-muted lg:table-cell">
                    {p.owner_email ? (
                      <a href={`mailto:${p.owner_email}`} className="hover:text-primary">
                        {p.owner_email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-muted lg:table-cell">
                    {p.owner_phone ? (
                      <a href={`tel:${p.owner_phone}`} className="hover:text-primary">
                        {p.owner_phone}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <Badge variant={TENURE_VARIANT[tenure]} size="sm">
                      {TENURE_LABEL[tenure]}
                    </Badge>
                  </td>
                  <td className="hidden max-w-xs px-4 py-3 text-muted xl:table-cell">
                    <span className="line-clamp-2" title={p.notes ?? undefined}>
                      {p.notes ?? '—'}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-muted xl:table-cell">
                    {formatDate(p.created_at)}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-muted xl:table-cell">
                    {formatDate(p.updated_at)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Sticky bulk-action bar — only when something is selected. */}
      {selected.size > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky bottom-4 z-20 mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-xl ring-1 ring-black/5"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CheckSquare2 className="h-4 w-4 text-primary" aria-hidden />
            {selected.size} selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="bulk-tenure" className="text-xs text-muted">
              Set tenure to
            </label>
            <Select
              id="bulk-tenure"
              value={targetTenure}
              onValueChange={(v) => setTargetTenure(v as Tenure)}
              disabled={pending}
              className="min-w-[10rem]"
            >
              <option value="owner_occupied">Owner-occupied</option>
              <option value="leased">Leased</option>
              <option value="unknown">Unknown</option>
            </Select>
            <Button size="sm" onClick={handleApply} disabled={pending}>
              {pending ? 'Applying…' : 'Apply'}
            </Button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={pending}
              className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
