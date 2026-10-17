import Link from 'next/link'
import { Pager } from '@homeowner-portal/ui'
import { propertyListHref, type PropertyListParams } from '@/lib/properties/list-params'

/**
 * "Showing X–Y of Z" with Previous/Next for the properties aside.
 *
 * Shared because both routes render the same aside: /properties and
 * /properties/[id]. They had identical copies of this arithmetic, and an
 * off-by-one fixed in one would have silently survived in the other. The
 * arithmetic itself now lives in the shared `Pager` (packages/ui), which
 * was generalised from this component; this wrapper only knows how to
 * build a properties URL.
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
  const hrefFor = (page: number): string => propertyListHref(params, { page })

  return (
    <Pager
      page={params.page}
      pageSize={params.limit}
      total={total}
      rowCount={rowCount}
      hrefFor={hrefFor}
      linkAs={Link}
      noun="homes"
      className="mt-auto border-t border-border"
    />
  )
}
