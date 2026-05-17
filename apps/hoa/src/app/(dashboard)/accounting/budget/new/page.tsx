import Link from 'next/link'
import { ChevronLeft, Target } from 'lucide-react'
import { Card, EmptyState } from '@homeowner-portal/ui'
import {
  getAccountingContext,
  listFiscalPeriods,
  listFunds,
} from '@/lib/accounting/queries'
import { NewBudgetForm } from './NewBudgetForm'

export const metadata = { title: 'New Budget' }

export default async function NewBudgetPage() {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<Target className="h-10 w-10" aria-hidden />}
          title="Accounting not set up"
          description="Run pnpm seed:accounting first."
        />
      </div>
    )
  }
  const [periods, funds] = await Promise.all([
    listFiscalPeriods(ctx.associationId),
    listFunds(ctx.associationId),
  ])

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/accounting/budget"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Budgets
        </Link>
        <h1 className="text-2xl font-bold text-foreground">New Budget</h1>
        <p className="text-sm text-muted">
          Pick a fiscal period and fund. Line items come next on the budget's
          detail page.
        </p>
      </header>

      <Card>
        <div className="p-6">
          <NewBudgetForm
            periods={periods.map((p) => ({
              id: p.id,
              label: `${p.start_date} → ${p.end_date} · ${p.status}`,
            }))}
            funds={funds.map((f) => ({ id: f.id, label: `${f.code} — ${f.name}` }))}
          />
        </div>
      </Card>
    </div>
  )
}
