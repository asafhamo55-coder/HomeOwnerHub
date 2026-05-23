import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Target } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card } from '@homeowner-portal/ui'
import {
  getAccountingContext,
  getBudget,
  listAccounts,
} from '@/lib/accounting/queries'
import { BudgetEditor } from './BudgetEditor'
import { BudgetActions } from './BudgetActions'

export const metadata = { title: 'Budget' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function BudgetDetailPage({ params }: PageProps) {
  const { id } = await params
  const ctx = await getAccountingContext()
  if (!ctx) notFound()
  const [budget, accounts] = await Promise.all([
    getBudget(ctx.associationId, id),
    listAccounts(ctx.associationId),
  ])
  if (!budget) notFound()

  // Income + expense accounts only — assets/liabilities/equity don't
  // make sense as budget lines (a manager doesn't "budget" their cash
  // balance; cash flows out of P&L performance).
  const budgetableAccounts = accounts
    .filter(
      (a) =>
        a.is_active &&
        (a.account_type === 'income' || a.account_type === 'expense'),
    )
    .map((a) => ({
      id: a.id,
      label: `${a.account_number} — ${a.account_name}`,
      type: a.account_type as 'income' | 'expense',
    }))

  const totalIncome = budget.lineItems
    .filter((l) => l.accountType === 'income')
    .reduce((s, l) => s + l.amount, 0)
  const totalExpense = budget.lineItems
    .filter((l) => l.accountType === 'expense')
    .reduce((s, l) => s + l.amount, 0)
  const isEditable = budget.status === 'draft'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/accounting/budget"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Budgets
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-bold text-foreground">
            {budget.fund?.name ?? 'Budget'}
          </h1>
          <BudgetActions budgetId={budget.id} isEditable={isEditable} />
          <Badge
            variant={
              budget.status === 'approved'
                ? 'success'
                : budget.status === 'archived'
                  ? 'outline'
                  : 'warning'
            }
          >
            {budget.status}
          </Badge>
        </div>
        <p className="text-sm text-muted">
          {budget.fiscalPeriod
            ? `${format(new Date(budget.fiscalPeriod.start_date), 'MMM d, yyyy')} → ${format(new Date(budget.fiscalPeriod.end_date), 'MMM d, yyyy')}`
            : '—'}
          {budget.approved_at
            ? ` · approved ${format(new Date(budget.approved_at), 'PP')}`
            : ''}
        </p>
      </header>

      <Card>
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <Summary label="Budgeted income" value={totalIncome} />
          <Summary label="Budgeted expenses" value={totalExpense} />
          <Summary
            label="Net (surplus / deficit)"
            value={totalIncome - totalExpense}
            tone={totalIncome - totalExpense < 0 ? 'destructive' : 'success'}
          />
        </div>
      </Card>

      <BudgetEditor
        budgetId={budget.id}
        editable={isEditable}
        initial={budget.lineItems.map((l) => ({
          id: l.id,
          accountId: l.accountId,
          amount: l.amount,
          notes: l.notes ?? '',
          accountLabel: `${l.accountNumber} — ${l.accountName}`,
          accountType: l.accountType as 'income' | 'expense',
        }))}
        accounts={budgetableAccounts}
      />

      {!isEditable ? (
        <Card>
          <div className="p-4 text-sm text-muted">
            This budget is {budget.status}; line items are locked. Archive it
            (future feature) to revise totals.
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'success' | 'destructive'
}) {
  const cls =
    tone === 'success'
      ? 'text-emerald-600'
      : tone === 'destructive'
        ? 'text-destructive'
        : 'text-foreground'
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 font-mono text-lg ${cls}`}>
        {value.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        })}
      </p>
    </div>
  )
}
