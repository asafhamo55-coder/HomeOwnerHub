import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@homeowner-portal/ui'
import type { DonutSegment } from '@/lib/dashboard/charts'

/**
 * A labelled bar list — replaces the colour-keyed donut and category bar.
 *
 * Every row carries its own label, count and share as text, and every bar
 * is the same hue, so nothing is read through colour (WCAG 1.4.1). Bars
 * are relative to the largest row so small categories stay visible.
 *
 * A failed read says so; it is never rendered as the empty state.
 */
export function BreakdownList({
  title,
  segments,
  total,
  failed,
  href,
  hrefLabel,
  emptyTitle,
  emptyDescription,
}: {
  title: string
  segments: DonutSegment[]
  total: number
  failed: boolean
  href: string
  hrefLabel: string
  emptyTitle: string
  emptyDescription: string
}) {
  const max = Math.max(1, ...segments.map((s) => s.value))

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        className="pb-3"
        actions={
          <Link href={href} className="text-sm font-medium text-primary hover:underline">
            {hrefLabel}
          </Link>
        }
      >
        <CardTitle as="h3">{title}</CardTitle>
        {!failed && total > 0 ? (
          <p className="num text-sm text-muted">{total.toLocaleString()} total</p>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">
        {failed ? (
          <FailedNote what={title.toLowerCase()} />
        ) : total === 0 ? (
          <EmptyState variant="compact" title={emptyTitle} description={emptyDescription} />
        ) : (
          <ul className="space-y-3" aria-label={title}>
            {segments.map((s) => {
              const pct = Math.round((s.value / total) * 100)
              return (
                <li key={s.label} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-foreground-secondary">{s.label}</span>
                    <span className="num shrink-0 text-foreground">
                      <span className="font-semibold">{s.value.toLocaleString()}</span>
                      <span className="ml-1.5 text-xs text-muted">{pct}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle" aria-hidden>
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(2, (s.value / max) * 100)}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** Compact in-card failure note — the card-sized sibling of LoadFailed. */
export function FailedNote({ what }: { what: string }) {
  return (
    <div className="rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2.5 text-sm" role="status">
      <p className="font-medium text-danger">Couldn’t load {what}</p>
      <p className="mt-0.5 text-foreground-secondary">
        A loading problem, not “none”. Refresh to try again.
      </p>
    </div>
  )
}
