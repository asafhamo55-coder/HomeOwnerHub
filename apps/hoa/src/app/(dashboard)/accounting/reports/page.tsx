import { timed } from '@/lib/perf/timing'
import Link from 'next/link'
import { ArrowDownUp, ArrowRight, BarChart3, FileArchive, PieChart, TrendingUp } from 'lucide-react'
import { Alert, Card, Page } from '@homeowner-portal/ui'
import { SummaryStrip } from '@/components/SummaryStrip'
import { computeBalanceSheet, computeIncomeStatement, getAccountingContext } from '@/lib/accounting/queries'
import { reportsSummaryTiles } from '@/lib/accounting/reports-summary'
import { AccountingTabs } from '../AccountingTabs'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readPrimaryAssociation } from '@/lib/association-setup'
import { tryLoad } from '@/lib/load-or-fail'
import { dayOf } from '@/lib/association-time'
import { formatDay, todayIso } from '@/lib/money/format'
import { loadMonthlyReportStatus } from '@/lib/monthly-report/status'
import { MonthlyReportCard, type MonthlyReportCardProps } from './MonthlyReportCard'

export const metadata = { title: 'Accounting Reports' }
export const dynamic = 'force-dynamic'

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
  {
    href: '/accounting/reports/year-end',
    icon: FileArchive,
    title: 'Year-end package',
    description: 'One zip for your CPA: statements, ledger, aging, bank recs, a 1120-H worksheet and 1099 candidates.',
  },
]

/** The month-end board report card's data (BL-073); null = couldn't load. */
async function monthlyReportStatus(orgId: string): Promise<MonthlyReportCardProps['status'] | 'no-association'> {
  const supabase = await getSupabaseServerClient()
  const assoc = await timed('/accounting/reports', 'reports.association', () => readPrimaryAssociation(supabase, orgId))
  if (!assoc.ok) return null
  // No association yet: nothing to report on, so no card (the page's own
  // setup prompts cover it) rather than a misleading "couldn't load".
  if (!assoc.data) return 'no-association'
  const timeZone = assoc.data.timeZone
  const res = await timed('/accounting/reports', 'reports.monthlyStatus', () =>
    tryLoad('monthly board report status', () => loadMonthlyReportStatus(supabase, orgId, timeZone)),
  )
  if (!res.ok) return null
  const { last, pending, pendingDone } = res.data
  return {
    last: last ? { label: last.label, status: last.status, sentOn: last.sentAt ? formatDay(dayOf(last.sentAt, timeZone)) : null } : null,
    pendingLabel: pending.label,
    pendingDone,
  }
}

/**
 * The at-a-glance strip. Each figure comes from the report function behind
 * its tile (income statement for the current period, balance sheet for cash),
 * and each read fails on its own to "Not available", never to 0.
 */
async function summaryTiles() {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return reportsSummaryTiles({ income: null, balance: null, period: undefined })
  const ctx = ctxRes.data
  if (!ctx) return reportsSummaryTiles({ income: null, balance: null, period: null })
  const aid = ctx.associationId
  const period = ctx.currentPeriod
  const [inc, bs] = await Promise.all([
    period
      ? timed('/accounting/reports', 'reports.incomeStatement', () => tryLoad('income statement', () => computeIncomeStatement(aid, period.id)))
      : Promise.resolve(null),
    timed('/accounting/reports', 'reports.balanceSheet', () => tryLoad('balance sheet', () => computeBalanceSheet(aid, todayIso(ctx.timeZone)))),
  ])
  return reportsSummaryTiles({ income: inc && inc.ok ? inc.data : null, balance: bs.ok ? bs.data : null, period })
}

export default async function AccountingReportsPage() {
  const { role, org } = await requireBoardOrAdmin()
  const [status, tiles] = await Promise.all([monthlyReportStatus(org.id), summaryTiles()])
  return (
    <Page title="Reports" description="Financial statements computed live from posted journal entries — always current, never cached." tabs={<AccountingTabs />}>
      <SummaryStrip ariaLabel="Books at a glance" testId="reports-summary" tiles={tiles} />
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
      {status === 'no-association' ? null : <MonthlyReportCard status={status} canSend={role === 'admin'} />}
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
