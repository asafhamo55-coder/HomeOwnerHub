import Link from 'next/link'
import { CalendarCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, StatusPill } from '@homeowner-portal/ui'
import { formatDay } from '@/lib/money/format'
import { countdownPhrase, type AdoptionStep, type Countdown } from '@/lib/budget-adoption/model'
import { FailedNote } from './BreakdownList'

export interface BudgetAdoptionItem {
  budgetId: string
  name: string
  next: AdoptionStep | null
  countdown: Countdown | null
}

/**
 * BL-138: during budget season, each draft or approved budget whose
 * adoption isn't finished, with its next step and the date to watch.
 * Board-facing only. Renders nothing when there is nothing to show;
 * `items` null = the read failed.
 */
export function BudgetAdoptionCard({ items }: { items: BudgetAdoptionItem[] | null }) {
  if (items !== null && items.length === 0) return null
  return (
    <Card id="budget-adoption">
      <CardHeader className="pb-3">
        <CardTitle as="h2" className="flex items-center gap-2">
          <CalendarCheck className="size-4 text-muted" aria-hidden />
          Budget season
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {items === null ? (
          <FailedNote what="your budgets" />
        ) : (
          <ul className="space-y-3">
            {items.map((it) => (
              <li key={it.budgetId} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/accounting/budget/${it.budgetId}#adoption-kit`} className="min-w-0 font-medium text-primary hover:underline">
                    {it.name}
                  </Link>
                  {it.countdown ? (
                    <StatusPill
                      tone={it.countdown.tone === 'danger' ? 'danger' : it.countdown.tone === 'warning' ? 'warning' : 'info'}
                      label={`${formatDay(it.countdown.date)} · ${countdownPhrase(it.countdown.daysLeft)}`}
                    />
                  ) : null}
                </div>
                {it.countdown ? <p className="text-muted">{it.countdown.label}</p> : null}
                {it.next ? <p className="text-foreground">Next: {it.next.title.replace(/^Next: /, '')}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
