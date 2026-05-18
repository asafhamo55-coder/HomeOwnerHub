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

  return (
    <Link href="/leases" className="block group h-full">
      <Card variant="interactive" className="h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted">
            <KeyRound className="h-4 w-4" />
            Leases
          </CardTitle>
          {summary.waitingListCount > 0 ? (
            <Badge variant="warning" size="sm">
              <Users className="mr-1 h-3 w-3" />
              {summary.waitingListCount} on waitlist
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-foreground">{leasedLabel}</p>
            <p className="text-sm text-muted">currently leased</p>
          </div>
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
