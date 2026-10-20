import Link from 'next/link'
import { ArrowRight, PiggyBank } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, StatusPill } from '@homeowner-portal/ui'
import type { ReserveSnapshotResult } from '@/lib/accounting/reserves'
import { formatDay, usd } from '@/lib/money/format'
import { FailedNote } from './BreakdownList'

/** Where "Set up a reserve fund" goes: the chart of accounts' Funds card. */
export const RESERVE_SETUP_HREF = '/accounting/coa#funds'

/**
 * BL-120 reserve snapshot: the reserve fund balance, this fiscal year's
 * contributions against the budget so far, and draws. Without a reserve
 * fund it asks the board to set one up instead of showing zeros.
 * `result` null = the read failed.
 */
export function ReserveSnapshotCard({
  result,
  hint,
}: {
  result: ReserveSnapshotResult | null
  hint?: { cite: string; text: string } | null
}) {
  const s = result?.kind === 'ready' ? result.snapshot : null
  return (
    <Card>
      <CardHeader className="pb-3" actions={s?.behindBudget ? <StatusPill tone="warning" label="Behind budget" /> : null}>
        <CardTitle as="h2" className="flex items-center gap-2">
          <PiggyBank className="size-4 text-muted" aria-hidden />
          Reserves
        </CardTitle>
      </CardHeader>
      <CardContent>
        {result === null ? (
          <FailedNote what="the reserve fund" />
        ) : result.kind === 'no_reserve_fund' ? (
          <div className="space-y-2 text-sm">
            <p className="text-foreground-secondary">
              No reserve fund is set up yet. A reserve fund keeps money for big repairs apart from day-to-day spending.
            </p>
            <Link href={RESERVE_SETUP_HREF} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              Set up a reserve fund <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        ) : s ? (
          <div className="space-y-3">
            <p className="flex items-baseline gap-2">
              <span className="num text-2xl font-semibold text-foreground">{usd(s.balance, { whole: true })}</span>
              <span className="text-sm text-muted">in reserves</span>
            </p>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted">Contributed this year</dt>
                <dd className="num font-medium text-foreground">
                  {usd(s.contributionsYtd, { whole: true })}
                  {s.budget ? (
                    <span className="font-normal text-muted"> of {usd(s.budget.ytd, { whole: true })} budgeted</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Drawn this year</dt>
                <dd className="num font-medium text-foreground">{usd(s.drawsYtd, { whole: true })}</dd>
              </div>
            </dl>
            {s.behindBudget ? (
              <p className="text-sm text-warning">Contributions trail the budget by more than 10% so far this year.</p>
            ) : !s.budget ? (
              <p className="text-xs text-muted">No reserve contribution is budgeted for this year.</p>
            ) : null}
            <p className="text-xs text-muted">This year runs from {formatDay(s.year.start)}.</p>
            {hint ? (
              <p className="text-xs text-muted">
                <span className="font-medium">{hint.cite}:</span> {hint.text}
              </p>
            ) : null}
            <Link
              href="/accounting/reports/balance-sheet"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Open the balance sheet <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
