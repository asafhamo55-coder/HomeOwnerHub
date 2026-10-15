import * as React from 'react'
import { cn } from '../lib/cn'
import { Card, CardContent } from './Card'
import { Skeleton } from './Skeleton'
import type { PageWidth } from './Page'

const WIDTHS: Record<PageWidth, string> = {
  narrow: 'max-w-3xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
}

/**
 * Placeholder for a route's `loading.tsx`: a header and three cards.
 *
 * Every board, resident, pm and eviction page renders on the server with
 * `force-dynamic`; before this there was no loading UI at all, so a slow
 * query left the previous page frozen on screen with no sign anything was
 * happening. One `loading.tsx` per shell renders this for every page in it.
 *
 * Generic on purpose — it does not try to mimic each page's layout, which
 * would drift the moment a page changed.
 */
export interface PageSkeletonProps {
  width?: PageWidth
  /** Number of card placeholders under the header. */
  cards?: number
  className?: string
}

export function PageSkeleton({ width = 'default', cards = 3, className }: PageSkeletonProps) {
  return (
    <div
      className={cn('mx-auto w-full space-y-6', WIDTHS[width], className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <div className="space-y-2" aria-hidden>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {Array.from({ length: cards }, (_, i) => (
        <Card key={i} aria-hidden>
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
