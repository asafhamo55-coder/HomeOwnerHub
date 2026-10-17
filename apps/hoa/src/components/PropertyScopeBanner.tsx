import Link from 'next/link'
import { Building2, X } from 'lucide-react'
import type { PropertyScope } from '@/lib/property-scope'

/**
 * "Showing violations for 128 Demo Court · Show all" — the strip a list
 * renders when it was opened from a property page with `?property=`. It is
 * the only sign the list is narrowed, so it is always shown when scoped,
 * including when the home's address could not be read.
 */
export function PropertyScopeBanner({
  scope,
  noun,
  clearHref,
  note,
}: {
  scope: PropertyScope
  /** "violations", "dues", "waiting-list entries" */
  noun: string
  /** The same list without `property=`. */
  clearHref: string
  /** Optional caveat, e.g. that headline totals still cover everyone. */
  note?: string
}) {
  const label = scope.address
    ? `${scope.address}${scope.unitNumber ? ` · ${scope.unitNumber}` : ''}`
    : 'one property (its address couldn’t be loaded)'
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-primary/30 bg-primary-subtle px-3.5 py-2.5 text-sm"
    >
      <Building2 className="size-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-foreground">
        Showing {noun} for{' '}
        {scope.address ? (
          // P0: propertyHref
          <Link href={`/properties/${scope.id}`} className="font-semibold text-foreground hover:text-primary hover:underline">
            {label}
          </Link>
        ) : (
          <span className="font-semibold">{label}</span>
        )}
        {note ? <span className="text-foreground-secondary"> · {note}</span> : null}
      </p>
      <Link
        href={clearHref}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium text-primary no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" aria-hidden />
        Show all
      </Link>
    </div>
  )
}
