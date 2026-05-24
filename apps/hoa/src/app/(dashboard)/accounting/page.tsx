import Link from 'next/link'
import { Banknote, BookOpen, Calculator, CalendarClock, FileText, LineChart, PieChart, ScrollText, Target, Wallet } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card, EmptyState } from '@homeowner-portal/ui'
import {
  getAccountingContext,
  listAccounts,
  listFunds,
  listJournalEntries,
} from '@/lib/accounting/queries'

export const metadata = { title: 'Accounting' }
export const dynamic = 'force-dynamic'

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

export default async function AccountingIndexPage() {
  const ctx = await getAccountingContext()

  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<Calculator className="h-10 w-10" aria-hidden />}
          title="Accounting not yet set up"
          description="Run pnpm seed:accounting to bootstrap funds, chart of accounts, and the current fiscal period for this association."
        />
      </div>
    )
  }

  const [funds, accounts, recent] = await Promise.all([
    listFunds(ctx.associationId),
    listAccounts(ctx.associationId),
    listJournalEntries(ctx.associationId, { limit: 5 }),
  ])

  const period = ctx.currentPeriod
  const postedCount = recent.filter((r) => r.status === 'posted').length

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1>Accounting</h1>
        <p className="text-sm text-muted">
          Double-entry general ledger for {ctx.associationName}. Every dollar moves
          from one account to another — nothing is ever deleted, only reversed.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<ScrollText className="h-4 w-4" />}
          label="Current period"
          value={
            period
              ? `${format(new Date(period.start_date), 'MMM yyyy')} – ${format(new Date(period.end_date), 'MMM yyyy')}`
              : '—'
          }
          hint={period?.status ?? 'no period'}
        />
        <SummaryCard
          icon={<Wallet className="h-4 w-4" />}
          label="Funds"
          value={String(funds.length)}
          hint={funds.map((f) => f.code).join(' · ') || '—'}
        />
        <SummaryCard
          icon={<BookOpen className="h-4 w-4" />}
          label="Accounts"
          value={String(accounts.length)}
          hint={`${accounts.filter((a) => a.is_active).length} active`}
        />
        <SummaryCard
          icon={<LineChart className="h-4 w-4" />}
          label="Recent JEs"
          value={String(recent.length)}
          hint={`${postedCount} posted`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <NavTile
          href="/accounting/coa"
          icon={<BookOpen className="h-5 w-5" />}
          title="Chart of Accounts"
          description="The account list this association codes every JE against."
        />
        <NavTile
          href="/accounting/ledger"
          icon={<ScrollText className="h-5 w-5" />}
          title="General Ledger"
          description="Every posted journal entry, newest first."
        />
        <NavTile
          href="/accounting/trial-balance"
          icon={<LineChart className="h-5 w-5" />}
          title="Trial Balance"
          description="Period-bounded balances per account. Debits must equal credits."
        />
        <NavTile
          href="/accounting/bank"
          icon={<Banknote className="h-5 w-5" />}
          title="Bank Accounts"
          description="Linked accounts + transaction feed. W18 auto-matches Pay-by-Zelle."
        />
        <NavTile
          href="/accounting/invoices"
          icon={<FileText className="h-5 w-5" />}
          title="Invoices"
          description="Vendor bills and bill-pay. Each one posts a Dr Expense / Cr AP entry."
        />
        <NavTile
          href="/accounting/reports/balance-sheet"
          icon={<PieChart className="h-5 w-5" />}
          title="Reports"
          description="Balance Sheet, Income Statement, Cash Flow. Computed live from posted entries."
        />
        <NavTile
          href="/accounting/budget"
          icon={<Target className="h-5 w-5" />}
          title="Budgets"
          description="One per period + fund. Approve to lock; feeds Budget vs Actual."
        />
        <NavTile
          href="/accounting/periods"
          icon={<CalendarClock className="h-5 w-5" />}
          title="Periods"
          description="Open / closing / closed. Closing emits income→equity and expense→equity JEs per fund."
        />
      </div>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recent journal entries</h2>
          <Link href="/accounting/ledger" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <Card>
            <div className="p-6 text-sm text-muted">
              No journal entries yet. The first ones land when assessments
              materialize or a homeowner payment is recorded.
            </div>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {recent.map((je) => (
                <li key={je.id}>
                  <Link
                    href={`/accounting/ledger/${je.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-background/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        <span className="font-mono text-xs text-muted">{je.entry_number}</span>{' '}
                        · {je.memo}
                      </p>
                      <p className="text-xs text-muted">
                        {format(new Date(je.entry_date), 'PP')} · {je.source} ·{' '}
                        {je.lineCount} {je.lineCount === 1 ? 'line' : 'lines'}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span className="font-mono text-sm text-foreground">{currency(je.totalAmount)}</span>
                      <Badge
                        variant={
                          je.status === 'posted'
                            ? 'success'
                            : je.status === 'reversed'
                              ? 'destructive'
                              : 'outline'
                        }
                        size="sm"
                      >
                        {je.status}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
          {icon}
          {label}
        </div>
        <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
    </Card>
  )
}

function NavTile({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-colors hover:border-primary/40">
        <div className="p-4">
          <div className="flex items-center gap-2 text-primary">{icon}<span className="font-semibold">{title}</span></div>
          <p className="mt-2 text-xs text-muted">{description}</p>
        </div>
      </Card>
    </Link>
  )
}
