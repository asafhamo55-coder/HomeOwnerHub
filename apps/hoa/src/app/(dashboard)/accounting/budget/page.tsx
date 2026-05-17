import Link from 'next/link'
import { Plus, Target } from 'lucide-react'
import { format } from 'date-fns'
import { BackLink, Badge, Button, Card, EmptyState, PageHeader } from '@homeowner-portal/ui'
import { getAccountingContext, listBudgets } from '@/lib/accounting/queries'

export const metadata = { title: 'Budgets' }

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export default async function BudgetsListPage() {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<Target className="h-10 w-10" aria-hidden />}
          title="No budgets yet"
          description="Run pnpm seed:accounting first, then create your first budget."
        />
      </div>
    )
  }

  const budgets = await listBudgets(ctx.associationId)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <BackLink href="/accounting" label="Accounting" />
        <PageHeader
          title="Budgets"
          description="One budget per fiscal period + fund. Approved budgets feed the Budget vs Actual report."
          actions={
            <Button asChild>
              <Link href="/accounting/budget/new">
                <Plus className="h-4 w-4" />
                New budget
              </Link>
            </Button>
          }
        />
      </div>

      {budgets.length === 0 ? (
        <EmptyState
          icon={<Target className="h-10 w-10" aria-hidden />}
          title="No budgets on file"
          description="Create the operating fund budget for the current period. Approving it locks the totals so variance reports stay stable."
          action={
            <Button asChild>
              <Link href="/accounting/budget/new">
                <Plus className="h-4 w-4" />
                Create first budget
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {budgets.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/accounting/budget/${b.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-background/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">
                      {b.fund?.name ?? '—'}
                      {b.fiscalPeriod
                        ? ` · ${format(new Date(b.fiscalPeriod.start_date), 'yyyy')}`
                        : ''}
                    </p>
                    <p className="text-xs text-muted">
                      {b.lineItemCount} line {b.lineItemCount === 1 ? 'item' : 'items'} ·{' '}
                      {currency(b.totalAmount)}
                      {b.approved_at
                        ? ` · approved ${format(new Date(b.approved_at), 'PP')}`
                        : ''}
                    </p>
                  </div>
                  <Badge
                    variant={
                      b.status === 'approved'
                        ? 'success'
                        : b.status === 'archived'
                          ? 'outline'
                          : 'warning'
                    }
                    size="sm"
                  >
                    {b.status}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
