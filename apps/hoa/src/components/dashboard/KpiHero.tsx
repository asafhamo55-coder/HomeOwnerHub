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
  /** Tone for the value text (used for at-a-glance severity). */
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
  tone = 'default',
}: KpiHeroProps) {
  const formatted = display ?? value.toLocaleString()
  const trend = previous != null ? computeTrend(value, previous, upIsBad ?? false) : null

  const body = (
    <CardContent className="space-y-2 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <p
          className={cn(
            'text-3xl font-semibold tabular-nums',
            tone === 'destructive' && 'text-destructive',
            tone === 'warning' && 'text-amber-600',
            tone === 'success' && 'text-emerald-600',
          )}
        >
          {formatted}
        </p>
        {trend ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium',
              trend.color,
            )}
          >
            {trend.icon}
            {trend.delta}
          </span>
        ) : null}
      </div>
      {sub ? <p className="text-xs text-muted">{sub}</p> : null}
    </CardContent>
  )

  if (href) {
    return (
      <Link href={href} className="block">
        <Card className="transition-shadow hover:shadow-md">{body}</Card>
      </Link>
    )
  }
  return <Card>{body}</Card>
}

function computeTrend(
  value: number,
  previous: number,
  upIsBad: boolean,
): { icon: React.ReactNode; delta: string; color: string } | null {
  if (previous === value) {
    return {
      icon: <ArrowRight className="h-3 w-3" />,
      delta: 'flat',
      color: 'text-muted',
    }
  }
  const diff = value - previous
  const pct = previous === 0 ? null : Math.round((diff / previous) * 100)
  const display = pct != null ? `${Math.abs(pct)}%` : Math.abs(diff).toLocaleString()
  const up = diff > 0
  const good = upIsBad ? !up : up
  return {
    icon: up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />,
    delta: display,
    color: good ? 'text-emerald-600' : 'text-destructive',
  }
}
