import Link from 'next/link'
import { ArrowRight, CheckCircle2, Scale } from 'lucide-react'
import { Button, Card, CardDescription, CardHeader, CardTitle, LoadFailed } from '@homeowner-portal/ui'
import type { BudgetGlance } from '@/lib/accounting/budget-overview'
import { usd } from '@/lib/money/format'

/** Pure view of the budget glance; `null` means the read failed. */
export function BudgetGlanceCard({ glance }: { glance: BudgetGlance | null }) {
  return (
    <Card>
      <CardHeader
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/accounting/reports/budget-vs-actual">
              Full report
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      >
        <CardTitle as="h2">Budget vs actual</CardTitle>
        <CardDescription>Expense lines furthest over budget, this fiscal year to date.</CardDescription>
      </CardHeader>
      {glance === null ? (
        <div className="px-5 pb-5">
          <LoadFailed what="the budget" />
        </div>
      ) : glance.kind === 'none' ? (
        <div className="flex flex-wrap items-center gap-3 px-5 pb-5 text-sm text-foreground-secondary">
          <Scale className="size-5 shrink-0 text-muted" aria-hidden />
          <span>No budget for this year yet</span>
          <Button asChild variant="secondary" size="sm">
            <Link href="/accounting/budget/new">Create a budget</Link>
          </Button>
        </div>
      ) : glance.lines.length === 0 ? (
        <div className="flex items-center gap-3 px-5 pb-5 text-sm text-foreground-secondary">
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
          All lines are within budget so far
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {glance.lines.map((l) => (
            <li key={l.accountId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm">
              <span className="min-w-0 font-medium text-foreground">{l.accountName}</span>
              <span className="text-muted">
                <span className="num">{usd(l.actual, { whole: true })}</span> of <span className="num">{usd(l.budgeted, { whole: true })}</span>
                {' · '}
                <span className="num text-danger">
                  over by {usd(l.over, { whole: true })}
                  {l.overPct === null ? '' : ` (${l.overPct}%)`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
