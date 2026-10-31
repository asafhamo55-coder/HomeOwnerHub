'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { readHealthOpen, writeHealthOpen, type KeyValueStorage } from '@/lib/dashboard/health-disclosure'

function storage(): KeyValueStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * "Community health" behind a "Show more numbers" button. A real <button>
 * with aria-expanded, so Tab, Enter and Space work. The server picks the
 * default (collapsed for young orgs); after mount the member's saved choice
 * wins. The content stays in the page when closed (hidden), so opening it is
 * instant and the streamed cards are not refetched.
 */
export function HealthDisclosure({
  orgId,
  defaultOpen,
  children,
}: {
  orgId: string
  defaultOpen: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  useEffect(() => {
    setOpen(readHealthOpen(storage(), orgId, defaultOpen))
  }, [orgId, defaultOpen])

  return (
    <section aria-labelledby="health-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
        <h2 id="health-heading" className="text-lg font-semibold text-foreground">
          Community health
        </h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            const next = !open
            setOpen(next)
            writeHealthOpen(storage(), orgId, next)
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-strong px-4 text-base font-medium text-foreground hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? 'Hide numbers' : 'Show more numbers'}
          <ChevronDown className={open ? 'size-4 rotate-180' : 'size-4'} aria-hidden />
        </button>
      </div>
      <div id={panelId} hidden={!open} className="space-y-4">
        <p className="text-xs text-muted">Changes vs 30 days ago</p>
        {children}
      </div>
    </section>
  )
}
