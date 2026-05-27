import Link from 'next/link'
import { ArrowLeft, BarChart3, DollarSign, PieChart, TrendingUp } from 'lucide-react'
import { Card } from '@homeowner-portal/ui'

export const metadata = { title: 'Accounting Reports' }

const REPORTS = [
  {
    href: '/accounting/reports/balance-sheet',
    icon: <PieChart className="h-5 w-5" />,
    title: 'Balance Sheet',
    description: 'Assets, liabilities, and equity at a point in time. Fund-level breakdown included.',
  },
  {
    href: '/accounting/reports/income-statement',
    icon: <DollarSign className="h-5 w-5" />,
    title: 'Income Statement',
    description: 'Revenue vs. expenses for the current period. Shows net income per fund.',
  },
  {
    href: '/accounting/reports/cash-flow',
    icon: <TrendingUp className="h-5 w-5" />,
    title: 'Cash Flow',
    description: 'Operating, investing, and financing cash movements for the period.',
  },
  {
    href: '/accounting/reports/budget-vs-actual',
    icon: <BarChart3 className="h-5 w-5" />,
    title: 'Budget vs. Actual',
    description: 'Line-by-line comparison of budgeted amounts against actual spend.',
  },
]

export default function AccountingReportsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/accounting"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Accounting
      </Link>

      <header>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted">
          Financial statements computed live from posted journal entries.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href} className="block">
            <Card className="h-full transition-colors hover:border-primary/40">
              <div className="p-5">
                <div className="flex items-center gap-2 text-primary">
                  {r.icon}
                  <span className="font-semibold">{r.title}</span>
                </div>
                <p className="mt-2 text-xs text-muted">{r.description}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
