import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, StatusPill, cn } from '@homeowner-portal/ui'
import type { LeaseSummary } from '@/lib/dashboard/queries'
import { FailedNote } from './BreakdownList'

// Compact lease snapshot: leased % against the cap, headroom and the
// waitlist. Click-through opens /leases.
export function LeaseSummaryCard({ summary }: { summary: LeaseSummary }) {
  if (!summary.hasAssociation && !summary.failed) return null

  const capLabel = summary.capPct === null ? null : `${Math.round(summary.capPct)}%`
  const capPctNum = summary.capPct ?? 0
  const fillRatio = capPctNum > 0 ? Math.min(1, summary.leasedPct / capPctNum) : 0
  const fillPct = Math.round(fillRatio * 100)
  // State in words as well as colour: the pill says "At cap" / "Near cap".
  const capState =
    summary.capPct === null || summary.totalUnits === 0
      ? null
      : fillRatio >= 1
        ? ({ tone: 'danger', label: 'At cap', bar: 'bg-danger-solid' } as const)
        : fillRatio >= 0.8
          ? ({ tone: 'warning', label: 'Near cap', bar: 'bg-warning-solid' } as const)
          : ({ tone: 'success', label: 'Under cap', bar: 'bg-primary' } as const)

  return (
    <Card>
      <CardHeader
        className="pb-3"
        actions={capState && !summary.failed ? <StatusPill tone={capState.tone} label={capState.label} /> : null}
      >
        <CardTitle as="h2">
          <Link href="/leases" className="hover:underline">
            Leasing
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary.failed ? (
          <FailedNote what="lease figures" />
        ) : summary.totalUnits === 0 ? (
          <p className="text-sm text-muted">No units on file yet.</p>
        ) : (
          <>
            <p className="flex items-baseline gap-2">
              <span className="num text-2xl font-semibold text-foreground">
                {Math.round(summary.leasedPct)}%
              </span>
              <span className="text-sm text-muted">
                leased{capLabel ? ` · cap ${capLabel}${summary.capIsMixed ? ' (strictest)' : ''}` : ' · no cap set'}
              </span>
            </p>
            {capState ? (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-subtle"
                role="progressbar"
                aria-valuenow={fillPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Lease cap used: ${fillPct}%`}
              >
                <div className={cn('h-full rounded-full', capState.bar)} style={{ width: `${fillPct}%` }} />
              </div>
            ) : null}
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted">Leased</dt>
                <dd className="num font-medium text-foreground">
                  {summary.leasedCount} / {summary.totalUnits}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Headroom</dt>
                <dd className="num font-medium text-foreground">
                  {summary.headroom === null ? '—' : summary.headroom}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Waitlist</dt>
                <dd className="num font-medium text-foreground">{summary.waitingListCount}</dd>
              </div>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  )
}
