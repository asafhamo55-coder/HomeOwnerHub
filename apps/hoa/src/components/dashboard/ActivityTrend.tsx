import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@homeowner-portal/ui'
import type { ActivityBucket } from '@/lib/dashboard/charts'
import { FailedNote } from './BreakdownList'

const SERIES: Array<{ key: 'violations' | 'arc' | 'invitations'; label: string; noun: [string, string] }> = [
  { key: 'violations', label: 'Violations reported', noun: ['violation', 'violations'] },
  { key: 'arc', label: 'ARC submissions', noun: ['ARC submission', 'ARC submissions'] },
  { key: 'invitations', label: 'Vendor invites', noun: ['vendor invite', 'vendor invites'] },
]

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/**
 * 30-day activity as small multiples: one labelled row per series instead
 * of one stacked chart keyed by colour, so each series is identified by
 * its row label and total, never by hue. Each row shares the same y-scale
 * so rows are comparable. Server-rendered; no chart library.
 */
export function ActivityTrend({ buckets, failed }: { buckets: ActivityBucket[]; failed: boolean }) {
  const totals = Object.fromEntries(
    SERIES.map((s) => [s.key, buckets.reduce((acc, b) => acc + b[s.key], 0)]),
  ) as Record<(typeof SERIES)[number]['key'], number>
  const total = totals.violations + totals.arc + totals.invitations
  const max = Math.max(1, ...buckets.flatMap((b) => SERIES.map((s) => b[s.key])))
  const first = buckets[0]?.date
  const last = buckets[buckets.length - 1]?.date

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle as="h3">Activity, last 30 days</CardTitle>
        {first && last && !failed ? (
          <p className="text-sm text-muted">
            {DAY.format(new Date(first))} – {DAY.format(new Date(last))}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">
        {failed ? (
          <FailedNote what="recent activity" />
        ) : total === 0 ? (
          <EmptyState
            variant="compact"
            title="Quiet month"
            description="No violations, ARC submissions or vendor invites in the last 30 days."
          />
        ) : (
          <ul className="space-y-4">
            {SERIES.map((s) => (
              <li key={s.key}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-foreground-secondary">{s.label}</span>
                  <span className="num font-semibold text-foreground">{totals[s.key]}</span>
                </div>
                <div
                  className="flex h-8 items-end gap-px border-b border-border"
                  role="img"
                  aria-label={`${s.label}: ${totals[s.key]} in the last 30 days`}
                >
                  {buckets.map((b) => {
                    const v = b[s.key]
                    return (
                      <span
                        key={b.date}
                        title={`${DAY.format(new Date(b.date))}: ${v} ${s.noun[v === 1 ? 0 : 1]}`}
                        className={v > 0 ? 'flex-1 rounded-t-sm bg-primary' : 'flex-1'}
                        style={{ height: v > 0 ? `${Math.max(12, (v / max) * 100)}%` : undefined }}
                      />
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
