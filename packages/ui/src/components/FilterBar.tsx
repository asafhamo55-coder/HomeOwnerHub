import * as React from 'react'
import { cn } from '../lib/cn'
import { Button } from './Button'
import { Card } from './Card'

/**
 * The filter strip above a list or report: a GET form whose fields become
 * URL params, so a filtered view is linkable and the server does the work
 * (spec §1.6 — sorting/paging/filtering are URL concerns).
 *
 * Children are `Field`-wrapped controls with a `name` (`Select` renders a
 * hidden input for its value). Enter in any field submits. "Reset" only
 * shows when something is filtered, so an unfiltered view has one action.
 *
 * Seven money pages (ledger, invoices, trial balance, the four statements)
 * hand-rolled this with three different button styles; promoted per §6
 * rule 9. Server-component safe.
 */
export interface FilterBarProps {
  children: React.ReactNode
  /** Where "Reset" goes (the unfiltered URL). */
  resetHref?: string
  /** True when any filter differs from the default — shows "Reset". */
  filtered?: boolean
  /** Submit label. Default "Apply". */
  submitLabel?: string
  /** Router link component for Reset (e.g. next/link). */
  linkAs?: React.ElementType
  /** Form action; default the current URL. */
  action?: string
  /** Accessible name for the form. Default "Filters". */
  label?: string
  className?: string
}

export function FilterBar({
  children,
  resetHref,
  filtered = false,
  submitLabel = 'Apply',
  linkAs: LinkAs = 'a',
  action,
  label = 'Filters',
  className,
}: FilterBarProps) {
  return (
    <Card className={className}>
      <form
        method="get"
        action={action}
        aria-label={label}
        role="search"
        className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        {children}
        <div className="flex items-center gap-2">
          <Button type="submit" variant="secondary">
            {submitLabel}
          </Button>
          {resetHref && filtered ? (
            <Button asChild variant="ghost">
              <LinkAs href={resetHref}>Reset</LinkAs>
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  )
}

/** Width helper for a filter field: full on phones, fixed from `sm`. */
export const filterFieldClass = cn('w-full sm:w-56')
