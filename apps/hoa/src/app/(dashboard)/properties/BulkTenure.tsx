'use client'

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Checkbox, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { bulkSetPropertyTenure } from '@/lib/properties'
import {
  BULK_TENURE_CAP,
  TARGET_BUTTON_LABEL,
  applySelection,
  barLabel,
  capMessage,
  confirmCopy,
  keepFailed,
  summarizeTenure,
  type BulkTenureTarget,
} from '@/lib/properties/bulk-tenure-shared'

// Selection for "set tenure for many homes". The page only mounts this for
// board/admin; bulkSetPropertyTenure checks the role, the org and the cap
// again on the server. Imports here are the UI kit, the action and the
// pure bulk-tenure-shared module, nothing that reaches node-only code.

interface Ctx {
  selected: string[]
  toggle(id: string, on: boolean): void
  setMany(ids: string[], on: boolean): void
}

const BulkTenureContext = createContext<Ctx | null>(null)

function useBulkTenure(): Ctx {
  const ctx = useContext(BulkTenureContext)
  if (!ctx) throw new Error('Tenure selection controls must sit inside BulkTenureProvider')
  return ctx
}

export function BulkTenureProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const toast = useToast()
  const [selected, setSelected] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  const setMany = useCallback((ids: string[], on: boolean) => setSelected((prev) => applySelection(prev, ids, on)), [])
  const toggle = useCallback((id: string, on: boolean) => setMany([id], on), [setMany])
  const value = useMemo(() => ({ selected, toggle, setMany }), [selected, toggle, setMany])
  const total = selected.length
  const overCap = total > BULK_TENURE_CAP

  async function apply(target: BulkTenureTarget) {
    const ids = selected
    const r = await bulkSetPropertyTenure({ propertyIds: ids, tenure: target })
    if (!r.ok) {
      toast({ tone: 'error', title: 'Couldn’t change tenure', message: r.error })
      return
    }
    const { updated, failed, failedIds } = r.data
    const sum = summarizeTenure(updated, failed, target)
    // Updated homes leave the selection; failures stay selected to retry.
    setSelected((prev) => keepFailed(prev, failedIds))
    toast(
      sum.tone === 'success'
        ? { tone: 'success', message: sum.text }
        : { tone: 'error', title: 'Some homes were not changed', message: sum.text },
    )
    startTransition(() => router.refresh())
  }

  return (
    <BulkTenureContext.Provider value={value}>
      {children}
      {total > 0 ? (
        <div
          role="region"
          aria-label="Set tenure"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg"
        >
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground" aria-live="polite">
              {barLabel(total)}
              {overCap ? <span className="text-danger"> {capMessage(total)}</span> : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setSelected([])} disabled={pending}>
                Clear
              </Button>
              {(['owner_occupied', 'leased'] as const).map((target) => (
                <ConfirmDialog
                  key={target}
                  {...confirmCopy(total, target)}
                  onConfirm={() => apply(target)}
                  trigger={
                    <Button variant="secondary" disabled={pending || overCap}>
                      {TARGET_BUTTON_LABEL[target]}
                    </Button>
                  }
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </BulkTenureContext.Provider>
  )
}

/** The checkbox on one home's row. */
export function BulkTenureRowCheckbox({ id, title }: { id: string; title: string }) {
  const { selected, toggle } = useBulkTenure()
  return (
    <span className="relative z-10 inline-flex">
      <Checkbox aria-label={`Select ${title}`} checked={selected.includes(id)} onChange={(e) => toggle(id, e.target.checked)} />
    </span>
  )
}

/**
 * "Select all on this page". In the unknown-tenure view it is a call to
 * action, since that is the list the Leases page sends people to; in every
 * other view it is a quiet strip.
 */
export function BulkTenureSelectAll({ ids, emphasize }: { ids: string[]; emphasize: boolean }) {
  const { selected, setMany } = useBulkTenure()
  if (ids.length === 0) return null
  const chosen = ids.filter((id) => selected.includes(id)).length
  const all = chosen === ids.length
  return (
    <div
      className={
        emphasize
          ? 'flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-primary-subtle px-4 py-3'
          : 'flex items-center border-b border-border px-4 py-2'
      }
    >
      <Checkbox
        label={`Select all ${ids.length} on this page`}
        checked={all}
        indeterminate={chosen > 0 && !all}
        onChange={(e) => setMany(ids, e.target.checked)}
      />
      {emphasize ? (
        <p className="text-sm text-foreground-secondary">These homes have no tenure on file. Tick the ones you know, then mark them as leased or owner-occupied.</p>
      ) : null}
    </div>
  )
}
