import Link from 'next/link'
import { ArrowDownUp, ArrowRight, BarChart3, PieChart, TrendingUp } from 'lucide-react'
import { Alert, Card, Page } from '@homeowner-portal/ui'
import { AccountingTabs } from '../AccountingTabs'

export const metadata = { title: 'Accounting Reports' }

const REPORTS = [
  {
    href: '/accounting/reports/balance-sheet',
    icon: PieChart,
    title: 'Balance sheet',
    description: 'What the association owns, owes and holds in each fund, on any date.',
  },
  {
    href: '/accounting/reports/income-statement',
    icon: TrendingUp,
    title: 'Income statement',
    description: 'Income against expenses for a period — accrual, cash or modified basis.',
  },
  {
    href: '/accounting/reports/cash-flow',
    icon: ArrowDownUp,
    title: 'Cash flow',
    description: 'Where cash came from and went in a period, opening to closing balance.',
  },
  {
    href: '/accounting/reports/budget-vs-actual',
    icon: BarChart3,
    title: 'Budget vs. actual',
    description: 'Each budget line next to what was really collected or spent.',
  },
]

export default function AccountingReportsPage() {
  return (
    <Page title="Reports" description="Financial statements computed live from posted journal entries — always current, never cached." tabs={<AccountingTabs />}>
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="group block rounded-xl no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Card variant="interactive" className="flex h-full items-start gap-4 p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary [&_svg]:size-5" aria-hidden>
                <r.icon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                  {r.title}
                  <ArrowRight className="size-4 text-muted transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden />
                </span>
                <span className="mt-1 block text-sm text-muted">{r.description}</span>
              </span>
            </Card>
          </Link>
        ))}
      </div>
      <Alert variant="info" title="Need it for a board meeting?">
        A PDF board packet — balance sheet, income statement and cash flow — is on the{' '}
        <Link href="/accounting/periods" className="font-medium text-primary underline">
          Periods
        </Link>{' '}
        page for every fiscal period.
      </Alert>
    </Page>
  )
}
