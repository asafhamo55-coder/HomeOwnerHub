import Link from 'next/link'
import { KeyRound, Users } from 'lucide-react'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import type { LeaseSummary } from '@/lib/dashboard/queries'

// Compact lease snapshot for the Monday-morning dashboard. Shows the
// current leased % vs the cap %, plus a small "N on waitlist" badge
// when the queue has anyone in it. Click-through opens /leases.
export function LeaseSummaryCard({ summary }: { summary: LeaseSummary }) {
  if (!summary.hasAssociation) return null

  const capLabel = summary.capPct === null ? '—' : `${Math.round(summary.capPct)}%`
  const leasedLabel = `${Math.round(summary.leasedPct)}%`
  const meta =
    summary.totalUnits === 0
      ? 'No units on file yet'
      : `${summary.leasedCount} of ${summary.totalUnits} leased${
          summary.capPct === null ? ' · no cap set' : ` · cap ${capLabel}`
        }`

  // How full is the lease window? Width is clamped 0–100; tone shifts
  // amber at 80% and red at 100% so a board sees "we're near the cap"
  // without reading numbers.
  const capPctNum = summary.capPct ?? 0
  const fillRatio =
    capPctNum > 0 ? Math.min(1, summary.leasedPct / capPctNum) : 0
  const fillPct = `${Math.round(fillRatio * 100)}%`
  const barTone =
    fillRatio >= 1
      ? 'bg-destructive'
      : fillRatio >= 0.8
        ? 'bg-amber-500'
        : 'bg-primary'

  return (
    <Link href="/leases" className="block group h-full">
      <Card variant="interactive" className="h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-5 pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-muted" aria-hidden />
            Leases
          </CardTitle>
          {summary.waitingListCount > 0 ? (
            <Badge variant="warning" size="sm">
              <Users className="mr-1 h-3 w-3" />
              {summary.waitingListCount} on waitlist
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3 p-5 pt-2">
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-semibold tabular-nums text-foreground">
              {leasedLabel}
            </p>
            <p className="text-sm text-muted">
              currently leased{summary.capPct === null ? '' : ` · cap ${capLabel}`}
            </p>
          </div>

          {summary.capPct !== null && summary.totalUnits > 0 ? (
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted/20"
              role="progressbar"
              aria-valuenow={Math.round(fillRatio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Leased capacity used: ${fillPct} of cap`}
            >
              <div
                className={`h-full rounded-full transition-all ${barTone}`}
                style={{ width: fillPct }}
              />
            </div>
          ) : null}

          <p className="text-xs text-muted">{meta}</p>
          {summary.headroom !== null && summary.totalUnits > 0 ? (
            <p className="text-xs text-muted">
              {summary.headroom === 0
                ? 'At cap — no more leases allowed'
                : `${summary.headroom} ${
                    summary.headroom === 1 ? 'unit' : 'units'
                  } left under cap`}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  )
}
