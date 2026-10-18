import Link from 'next/link'
import { Pager } from '@homeowner-portal/ui'
import { propertyListHref, type PropertyListParams } from '@/lib/properties/list-params'

/**
 * "Showing X–Y of Z" with Previous/Next under the properties table.
 *
 * The arithmetic lives in the shared `Pager` (packages/ui), which was
 * generalised from this component; this wrapper only knows how to build
 * a properties URL (so paging keeps the filter, sort and search).
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
    />
  )
}
