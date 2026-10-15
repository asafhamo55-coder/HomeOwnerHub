import * as React from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '../lib/cn'
import { Card } from './Card'
import { Skeleton } from './Skeleton'

/* ───────────────────────────────────────────────────────────────────────────
 * Kpi — a single metric tile. Value in tabular figures, optional delta
 * with direction icon + sign (never colour alone), and explicit loading /
 * failed states: a KPI whose source failed shows "—" and says so, never
 * "$0" (UX plan decision 14).
 * ──────────────────────────────────────────────────────────────────────── */

export interface KpiDelta {
  /** Display string, e.g. "+12%" or "−$1,240". */
  value: string
  direction: 'up' | 'down' | 'flat'
  /** Whether this direction is good news. Drives colour only; the arrow carries meaning. */
  sentiment?: 'positive' | 'negative' | 'neutral'
  /** Context, e.g. "vs last month". */
  label?: string
}

export interface KpiProps {
  label: string
  value?: React.ReactNode
  icon?: React.ReactNode
  delta?: KpiDelta
  /** One line under the value. */
  hint?: React.ReactNode
  /** Link the whole tile. Pass `linkAs` for router links. */
  href?: string
  linkAs?: React.ElementType
  state?: 'ready' | 'loading' | 'failed'
  className?: string
}

const DELTA_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const
const SENTIMENT = {
  positive: 'text-success',
  negative: 'text-danger',
  neutral: 'text-muted',
} as const

export function Kpi({
  label,
  value,
  icon,
  delta,
  hint,
  href,
  linkAs: LinkAs = 'a',
  state = 'ready',
  className,
}: KpiProps) {
  const DeltaIcon = delta ? DELTA_ICON[delta.direction] : null
  const body = (
    // min-w-0 + wrap rules: a tile never grows past its grid cell and
    // nothing in it spills out — the delta wraps under the value, long
    // labels/hints wrap, and the figure sizes to the TILE (it is a `.cq`
    // container: text-2xl, text-3xl once the tile is ≥12rem wide), only
    // breaking as a last resort (checked by `pnpm ui:overflow`).
    <div className="cq flex h-full min-w-0 flex-col gap-2 p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-medium text-muted">{label}</p>
        {icon ? <span className="shrink-0 pt-0.5 text-muted [&_svg]:size-4" aria-hidden>{icon}</span> : null}
      </div>
      {state === 'loading' ? (
        <div aria-busy="true" className="space-y-2 pt-1">
          <span className="sr-only">Loading {label}</span>
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      ) : state === 'failed' ? (
        <div>
          <p className="num text-3xl font-semibold text-muted" aria-hidden>
            —
          </p>
          <p className="mt-1 text-xs font-medium text-danger">Couldn’t load</p>
        </div>
      ) : (
        <>
          <p className="num min-w-0 text-2xl font-semibold tracking-tight text-foreground [overflow-wrap:anywhere] cq-xs:text-3xl">
            {value}
          </p>
          {delta || hint ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {delta && DeltaIcon ? (
                <span className={cn('num inline-flex max-w-full items-center gap-0.5 font-semibold', SENTIMENT[delta.sentiment ?? 'neutral'])}>
                  <DeltaIcon className="size-3.5 shrink-0" aria-hidden />
                  {delta.value}
                </span>
              ) : null}
              {delta?.label ? <span className="min-w-0 text-muted">{delta.label}</span> : null}
              {hint ? <span className="min-w-0 break-words text-muted">{hint}</span> : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  )

  if (href) {
    return (
      <LinkAs
        href={href}
        className={cn('group block min-w-0 rounded-xl no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background', className)}
      >
        <Card variant="interactive" className="h-full">
          {body}
        </Card>
      </LinkAs>
    )
  }
  return <Card className={cn('h-full min-w-0', className)}>{body}</Card>
}

/* ───────────────────────────────────────────────────────────────────────────
 * StatCard — the older dashboard tile (label + big value + meta + CTA).
 * API unchanged; restyled on the same grid as Kpi. New code: prefer Kpi.
 * ──────────────────────────────────────────────────────────────────────── */

export interface StatCardProps {
  /** Icon node (consumer-supplied so packages/ui stays free of lucide). */
  icon?: React.ReactNode
  /** Small muted label rendered next to the icon (e.g. "Action required"). */
  label: string
  /** Primary big number / string. Ignored when emptyState is set. */
  value?: React.ReactNode
  /** Small subtext under the value (e.g. "items need approval"). */
  meta?: React.ReactNode
  /** Optional node rendered inline next to the value (e.g. an overdue Badge). */
  valueExtra?: React.ReactNode
  /** Optional href — when set the entire card becomes a clickable <a>. */
  href?: string
  /** Optional CTA text rendered at the bottom (e.g. "Review now →"). */
  cta?: React.ReactNode
  /**
   * If non-null, the card replaces value/meta/cta with this muted line.
   * Caller decides the copy (e.g. "Inbox zero. Nothing waiting on you.").
   */
  emptyState?: React.ReactNode | null
  className?: string
}

export function StatCard({
  icon,
  label,
  value,
  meta,
  valueExtra,
  href,
  cta,
  emptyState,
  className,
}: StatCardProps) {
  const isEmpty = emptyState !== undefined && emptyState !== null

  const inner = (
    <div className={cn('group flex h-full flex-col gap-3 p-5', !href && className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-muted [&_svg]:size-4">
        {icon}
        <span>{label}</span>
      </div>

      {isEmpty ? (
        <p className="text-sm text-muted">{emptyState}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <p className="num text-3xl font-semibold tracking-tight text-foreground">{value}</p>
            {valueExtra}
          </div>
          {meta ? <p className="text-sm text-muted">{meta}</p> : null}
          {cta ? (
            <p className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
              {cta}
              {typeof cta === 'string' && !/[→›]\s*$/.test(cta) ? (
                <ArrowRight className="size-3.5 transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden />
              ) : null}
            </p>
          ) : null}
        </>
      )}
    </div>
  )

  if (href) {
    return (
      <a
        href={href}
        className={cn(
          'block rounded-xl no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
      >
        <Card variant="interactive" className="h-full">
          {inner}
        </Card>
      </a>
    )
  }

  return <Card className={cn(!href && 'h-full')}>{inner}</Card>
}
