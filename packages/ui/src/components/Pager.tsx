import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * "Showing X–Y of Z" with Previous / Next, driven by a `?page=` URL param.
 *
 * Generalised from apps/hoa's PropertyListPager and the inbox's inline
 * pager, the only two paginated lists before this. Everywhere else a hard
 * `.limit(N)` silently dropped rows with no notice (audit finding 6) —
 * harmless at 49 units, wrong at 400.
 *
 * Server-component friendly: no state, no hooks. Pass the app's router
 * `Link` as `linkAs` to keep client-side navigation; the default is a
 * plain anchor.
 *
 * Usage with Supabase:
 *
 *   const page = parsePageParam(sp.page)
 *   const { from, to } = pageRange(page, PAGE_SIZE)
 *   … .select('…', { count: 'exact' }).range(from, to)
 *   <Pager page={page} pageSize={PAGE_SIZE} total={count} rowCount={rows.length}
 *          hrefFor={(p) => `/violations?page=${p}`} linkAs={Link} />
 */

/** Parse a `?page=` value: a positive integer, else 1. */
export function parsePageParam(raw: string | string[] | null | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value == null) return 1
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return 1
  const n = Number.parseInt(trimmed, 10)
  return Number.isSafeInteger(n) && n >= 1 ? n : 1
}

/** Inclusive row bounds for PostgREST `.range(from, to)`. */
export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const from = (Math.max(1, Math.floor(page)) - 1) * pageSize
  return { from, to: from + pageSize - 1 }
}

export interface PagerState {
  /** 1-based index of the first row shown; 0 when nothing is shown. */
  first: number
  /** 1-based index of the last row shown; 0 when nothing is shown. */
  last: number
  totalPages: number
  hasPrev: boolean
  hasNext: boolean
  /** A page past the end was requested: there are rows, just not here. */
  pastEnd: boolean
  /** Everything fits on one page and we are on it — no pager needed. */
  singlePage: boolean
}

export function pagerState(input: {
  page: number
  pageSize: number
  total: number
  rowCount: number
}): PagerState {
  const { page, pageSize, total, rowCount } = input
  const offset = (page - 1) * pageSize
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pastEnd = rowCount === 0 && total > 0 && offset >= total
  return {
    first: rowCount > 0 ? offset + 1 : 0,
    last: rowCount > 0 ? Math.min(offset + rowCount, total) : 0,
    totalPages,
    hasPrev: page > 1,
    hasNext: offset + rowCount < total,
    pastEnd,
    singlePage: page === 1 && total <= pageSize,
  }
}

export interface PagerProps {
  /** Current 1-based page, from `parsePageParam`. */
  page: number
  pageSize: number
  /** Total rows matching the current filter (PostgREST `count: 'exact'`). */
  total: number
  /** Rows actually rendered on this page — not the page size. */
  rowCount: number
  /** Builds the URL for a page, preserving the caller's other params. */
  hrefFor: (page: number) => string
  /** Link component (e.g. next/link). Defaults to `<a>`. */
  linkAs?: React.ElementType
  /** Plural noun for the summary line: "Showing 1–100 of 340 violations". */
  noun?: string
  className?: string
}

export function Pager({
  page,
  pageSize,
  total,
  rowCount,
  hrefFor,
  linkAs: LinkAs = 'a',
  noun,
  className,
}: PagerProps) {
  const state = pagerState({ page, pageSize, total, rowCount })
  // One page holds everything: the list itself is the whole truth.
  if (state.singlePage) return null

  const linkClass = 'underline hover:text-foreground'
  const disabledClass = 'text-muted/50'

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-muted',
        className,
      )}
    >
      {state.pastEnd ? (
        <span>
          Page {page} is past the end — there {total === 1 ? 'is' : 'are'} {total}{' '}
          {noun ?? (total === 1 ? 'row' : 'rows')}.{' '}
          <LinkAs href={hrefFor(1)} className={linkClass}>
            Go to the first page
          </LinkAs>
        </span>
      ) : (
        <span>
          Showing {state.first}–{state.last} of {total}
          {noun ? ` ${noun}` : ''}
        </span>
      )}
      {state.pastEnd ? null : (
        <div className="flex gap-3">
          {state.hasPrev ? (
            <LinkAs href={hrefFor(page - 1)} className={linkClass} rel="prev">
              Previous
            </LinkAs>
          ) : (
            <span className={disabledClass} aria-disabled="true">
              Previous
            </span>
          )}
          {state.hasNext ? (
            <LinkAs href={hrefFor(page + 1)} className={linkClass} rel="next">
              Next
            </LinkAs>
          ) : (
            <span className={disabledClass} aria-disabled="true">
              Next
            </span>
          )}
        </div>
      )}
    </nav>
  )
}
