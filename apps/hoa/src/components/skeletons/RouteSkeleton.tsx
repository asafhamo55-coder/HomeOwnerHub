import * as React from 'react'
import { Card, CardContent, Page, Skeleton, type PageWidth } from '@homeowner-portal/ui'
import { ScreenHeader } from '@/components/resident/screen'
import { AccountingTabs } from '@/app/(dashboard)/accounting/AccountingTabs'

/**
 * Route-level loading states (BL-099), one per board and resident route.
 *
 * Every page here is force-dynamic, so a click waits on the server. The
 * skeleton is what paints in the meantime; it is built from the same
 * pieces as the page — the real `<Page>` container and header (so width
 * and title position are identical), the real title text where the title
 * is static, the real accounting tabs — so the page swaps in without the
 * header or the column jumping. Only data-shaped parts are placeholders.
 */

const SHIMMER =
  'animate-shimmer rounded-md bg-subtle bg-[linear-gradient(90deg,transparent_0%,hsl(var(--foreground)/0.06)_50%,transparent_100%)] bg-[length:200%_100%]'

/** An inline placeholder (a span), for slots that sit inside text (h1, p). */
function Bar({ className }: { className: string }) {
  return <span aria-hidden className={`inline-block align-middle ${SHIMMER} ${className}`} />
}

export type BoardSkeletonBody = 'table' | 'detail' | 'form' | 'cards' | 'text'

export interface BoardRouteSkeletonProps {
  /** The page's own title when it is static; omitted = a placeholder bar. */
  title?: string
  width?: PageWidth
  /** 'accounting' renders the real tabs; 'generic' a tab-bar placeholder. */
  tabs?: 'accounting' | 'generic'
  /** KPI tiles above the body. */
  kpis?: number
  body?: BoardSkeletonBody
  /** Passed to `<Page>` when the page itself passes one (properties: max-w-none). */
  className?: string
}

function TabsSkeleton() {
  return (
    <div className="flex h-10 items-end gap-4 border-b border-border px-1" aria-hidden>
      {['w-16', 'w-20', 'w-16', 'w-24'].map((w, i) => (
        <Bar key={i} className={`mb-3 h-4 ${w}`} />
      ))}
    </div>
  )
}

function KpiRow({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <CardContent className="space-y-2 p-4 sm:p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3.5 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function TableBody({ rows = 8 }: { rows?: number }) {
  return (
    <Card className="overflow-hidden" aria-hidden>
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="ml-auto h-9 w-24" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="hidden h-4 w-1/5 sm:block" />
            <Skeleton className="ml-auto h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </Card>
  )
}

function TextCard({ lines = 3, heading = true }: { lines?: number; heading?: boolean }) {
  return (
    <Card aria-hidden>
      <CardContent className="space-y-3 p-5">
        {heading ? <Skeleton className="h-5 w-40" /> : null}
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={`h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </CardContent>
    </Card>
  )
}

function DetailBody() {
  return (
    <div className="grid gap-6 lg:grid-cols-3" aria-hidden>
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <TextCard lines={4} />
        <TextCard lines={3} />
      </div>
      <div className="min-w-0 space-y-6">
        <TextCard lines={3} />
      </div>
    </div>
  )
}

function FormBody() {
  return (
    <Card aria-hidden>
      <CardContent className="space-y-5 p-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-32" />
      </CardContent>
    </Card>
  )
}

function Body({ body }: { body: BoardSkeletonBody }) {
  switch (body) {
    case 'table':
      return <TableBody />
    case 'detail':
      return <DetailBody />
    case 'form':
      return <FormBody />
    case 'text':
      return <TextCard lines={6} />
    case 'cards':
      return (
        <div className="space-y-6">
          <TextCard />
          <TextCard />
          <TextCard />
        </div>
      )
  }
}

export function BoardRouteSkeleton({ title, width = 'default', tabs, kpis = 0, body = 'cards', className }: BoardRouteSkeletonProps) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading{title ? ` ${title}` : ''}…</span>
      <Page
        width={width}
        className={className}
        title={title ?? <Bar className="h-7 w-56 max-w-full" />}
        description={<Bar className="h-4 w-80 max-w-full" />}
        tabs={tabs === 'accounting' ? <AccountingTabs /> : tabs === 'generic' ? <TabsSkeleton /> : undefined}
      >
        {kpis > 0 ? <KpiRow count={kpis} /> : null}
        <Body body={body} />
      </Page>
    </div>
  )
}

export type ResidentSkeletonBody = 'rows' | 'hero' | 'form' | 'detail'

export function ResidentRouteSkeleton({
  title,
  subtitle,
  body = 'rows',
}: {
  title?: string
  subtitle?: string
  body?: ResidentSkeletonBody
}) {
  const rows = (n: number) => (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-3">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
  return (
    <div className="space-y-8" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading{title ? ` ${title}` : ''}…</span>
      {title ? (
        <ScreenHeader title={title} subtitle={subtitle} />
      ) : (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      )}
      {body === 'hero' ? <Skeleton className="h-32 w-full rounded-2xl" /> : null}
      {body === 'form' ? (
        <div className="space-y-5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          ))}
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      ) : body === 'detail' ? (
        <div className="space-y-4" aria-hidden>
          <Skeleton className="h-24 w-full rounded-xl" />
          {rows(2)}
        </div>
      ) : (
        <div className="space-y-2.5">
          <Skeleton className="h-3.5 w-24" />
          {rows(3)}
        </div>
      )}
    </div>
  )
}
