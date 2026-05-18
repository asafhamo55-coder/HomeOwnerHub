import Link from 'next/link'
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { Card, CardContent, cn } from '@homeowner-portal/ui'

export interface KpiHeroProps {
  label: string
  value: number
  /** Pre-formatted display string. Defaults to value.toLocaleString(). */
  display?: string
  /** Optional small text under the value (e.g. "across 4 vendors"). */
  sub?: string | null
  /** Previous-period value for trend arrow. Null hides the arrow. */
  previous?: number | null
  /** Direction in which "up" is bad (e.g. open violations: more is worse). */
  upIsBad?: boolean
  /** Where clicking the card lands. Omit for non-clickable. */
  href?: string
  /** Retained for API compatibility — no longer tints the headline
   *  number (which read as "every KPI is on fire"). Severity now lives
   *  on the delta chip instead. */
  tone?: 'default' | 'success' | 'warning' | 'destructive'
}

export function KpiHero({
  label,
  value,
  display,
  sub,
  previous,
  upIsBad,
  href,
}: KpiHeroProps) {
  const formatted = display ?? value.toLocaleString()
  const trend = previous != null ? computeTrend(value, previous, upIsBad ?? false) : null

  const body = (
    <CardContent className="flex h-full min-h-[7rem] flex-col justify-between gap-2 p-5">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <p className="text-3xl font-semibold tabular-nums text-foreground">
          {formatted}
        </p>
        {trend ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium tabular-nums',
              trend.color,
            )}
            aria-label={trend.ariaLabel}
          >
            {trend.icon}
            {trend.delta}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted">{sub ?? <>&nbsp;</>}</p>
    </CardContent>
  )

  if (href) {
    return (
      <Link href={href} className="block h-full">
        <Card className="h-full transition-shadow hover:shadow-md">{body}</Card>
      </Link>
    )
  }
  return <Card className="h-full">{body}</Card>
}

function computeTrend(
  value: number,
  previous: number,
  upIsBad: boolean,
): { icon: React.ReactNode; delta: string; color: string; ariaLabel: string } | null {
  if (previous === value) {
    return {
      icon: <ArrowRight className="h-3 w-3" aria-hidden />,
      delta: 'flat',
      color: 'text-muted',
      ariaLabel: 'No change vs 30 days ago',
    }
  }
  const diff = value - previous
  const pct = previous === 0 ? null : Math.round((diff / previous) * 100)
  const magnitude =
    pct != null ? `${Math.abs(pct)}%` : Math.abs(diff).toLocaleString()
  const up = diff > 0
  // Explicit sign so the delta reads unambiguously even without the
  // arrow glyph and without relying on colour alone (WCAG 1.4.1).
  const display = `${up ? '+' : '−'}${magnitude}`
  const good = upIsBad ? !up : up
  return {
    icon: up ? (
      <ArrowUp className="h-3 w-3" aria-hidden />
    ) : (
      <ArrowDown className="h-3 w-3" aria-hidden />
    ),
    delta: display,
    color: good ? 'text-emerald-600' : 'text-destructive',
    ariaLabel: `${up ? 'Up' : 'Down'} ${magnitude} vs 30 days ago — ${good ? 'better' : 'worse'}`,
  }
}
