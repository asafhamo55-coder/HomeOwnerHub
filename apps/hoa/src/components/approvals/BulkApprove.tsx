'use client'

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Button, Checkbox, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { approveMany } from '@/lib/approvals-inbox/actions'
import { BULK_CAP, summarizeBulk, type BulkSource } from '@/lib/approvals-inbox/bulk'

// Selection for bulk approve. Only rows whose source is non-money get a
// checkbox (page.tsx decides with isBulkEligible); approveMany re-checks.

type Selection = Record<string, string[]>

interface Ctx {
  selected: Selection
  total: number
  toggle(source: BulkSource, id: string, on: boolean): void
  setMany(source: BulkSource, ids: string[], on: boolean): void
}

const BulkContext = createContext<Ctx | null>(null)

function useBulk(): Ctx {
  const ctx = useContext(BulkContext)
  if (!ctx) throw new Error('Bulk approve controls must sit inside BulkApproveProvider')
  return ctx
}

const count = (s: Selection) => Object.values(s).reduce((n, ids) => n + ids.length, 0)

export function BulkApproveProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const toast = useToast()
  const [selected, setSelected] = useState<Selection>({})
  const [pending, startTransition] = useTransition()

  const setMany = useCallback((source: BulkSource, ids: string[], on: boolean) => {
    setSelected((prev) => {
      const current = new Set(prev[source] ?? [])
      for (const id of ids) {
        if (on) current.add(id)
        else current.delete(id)
      }
      return { ...prev, [source]: [...current] }
    })
  }, [])
  const toggle = useCallback((source: BulkSource, id: string, on: boolean) => setMany(source, [id], on), [setMany])
  const total = count(selected)
  const value = useMemo(() => ({ selected, total, toggle, setMany }), [selected, total, toggle, setMany])

  async function approveSelected() {
    const r = await approveMany(selected)
    if (!r.ok) {
      toast({ tone: 'error', title: 'Couldn’t approve them', message: r.error })
      return
    }
    const sum = summarizeBulk(r.results)
    // Approved items leave the selection; failures stay selected to retry or review.
    const failedIds = new Set(r.results.filter((x) => !x.ok).map((x) => `${x.source}:${x.id}`))
    setSelected((prev) =>
      Object.fromEntries(Object.entries(prev).map(([src, ids]) => [src, ids.filter((id) => failedIds.has(`${src}:${id}`))])),
    )
    toast(
      sum.failed === 0
        ? { tone: 'success', message: sum.text }
        : { tone: 'error', title: 'Some could not be approved', message: sum.text },
    )
    startTransition(() => router.refresh())
  }

  return (
    <BulkContext.Provider value={value}>
      {children}
      {total > 0 ? (
        <div
          role="region"
          aria-label="Bulk approve"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg"
        >
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground" aria-live="polite">
              {total} selected
              {total > BULK_CAP ? <span className="text-danger"> (up to {BULK_CAP} at a time)</span> : null}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setSelected({})} disabled={pending}>
                Clear
              </Button>
              <ConfirmDialog
                title={`Approve ${total} ${total === 1 ? 'item' : 'items'}?`}
                description="Each one is approved exactly as if you approved it on its own row. Nothing is emailed or texted from here. Items that move money are never part of this."
                confirmLabel={`Approve ${total}`}
                onConfirm={approveSelected}
                trigger={
                  <Button icon={<Check aria-hidden />} disabled={pending || total > BULK_CAP}>
                    Approve {total}
                  </Button>
                }
              />
            </div>
          </div>
        </div>
      ) : null}
    </BulkContext.Provider>
  )
}

/** The checkbox on one eligible row. */
export function BulkRowCheckbox({ source, id, title }: { source: BulkSource; id: string; title: string }) {
  const { selected, toggle } = useBulk()
  return (
    <Checkbox
      aria-label={`Select ${title}`}
      checked={(selected[source] ?? []).includes(id)}
      onChange={(e) => toggle(source, id, e.target.checked)}
    />
  )
}

/** "Select all in this section" for one source's eligible rows. */
export function BulkSelectAll({ source, ids, sectionTitle }: { source: BulkSource; ids: string[]; sectionTitle: string }) {
  const { selected, setMany } = useBulk()
  if (ids.length === 0) return null
  const chosen = ids.filter((id) => (selected[source] ?? []).includes(id)).length
  const all = chosen === ids.length
  return (
    <Checkbox
      label={`Select all ${ids.length}`}
      aria-label={`Select all ${ids.length} in ${sectionTitle}`}
      checked={all}
      indeterminate={chosen > 0 && !all}
      onChange={(e) => setMany(source, ids, e.target.checked)}
    />
  )
}
