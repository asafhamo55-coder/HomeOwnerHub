import Link from 'next/link'
import type { PropertyListParams } from '@/lib/properties/list-params'

/**
 * "Showing X–Y of Z" with Previous/Next for the properties aside.
 *
 * Extracted because both routes render the same aside: /properties and
 * /properties/[id]. They had identical copies of this arithmetic, and an
 * off-by-one fixed in one would have silently survived in the other.
 *
 * Shape matches the inbox's pager (inbox/page.tsx:154-182) so the two
 * lists page the same way.
 */
export function PropertyListPager({
  params,
  rowCount,
  total,
}: {
  params: PropertyListParams
  /** Rows actually rendered on this page — not the page size. */
  rowCount: number
  /** Total rows matching the current filter and search. */
  total: number
}) {
  // Nothing to page through: one page holds everything.
  if (total <= params.limit) return null

  const hrefFor = (page: number): string => {
    const q = new URLSearchParams({
      filter: params.filter,
      sort: params.sort,
      ...(params.search ? { q: params.search } : {}),
      page: String(page),
    })
    return `/properties?${q}`
  }

  const hasPrev = params.page > 1
  const hasNext = params.offset + rowCount < total

  return (
    <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted">
      <span>
        Showing {params.offset + 1}–{Math.min(params.offset + rowCount, total)} of {total}
      </span>
      <div className="flex gap-3">
        {hasPrev ? (
          <Link href={hrefFor(params.page - 1)} className="underline hover:text-foreground">
            Previous
          </Link>
        ) : (
          <span className="text-muted/50">Previous</span>
        )}
        {hasNext ? (
          <Link href={hrefFor(params.page + 1)} className="underline hover:text-foreground">
            Next
          </Link>
        ) : (
          <span className="text-muted/50">Next</span>
        )}
      </div>
    </div>
  )
}
