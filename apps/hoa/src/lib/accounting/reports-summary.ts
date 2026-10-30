import type { SummaryTile } from '@/components/SummaryStrip'
import { PERIOD_STATUS, statusOf } from '@/lib/money/status'
import { periodLabel, usd } from '@/lib/money/format'
import type { BalanceSheet, IncomeStatement } from './queries'

/**
 * Tiles for the Reports index strip. Pure: the page passes the results of the
 * same report functions the reports use (computeIncomeStatement and
 * computeBalanceSheet), so the figures here are the reports' own totals and no
 * math is repeated. A null source means that read failed; its tiles say
 * "Not available" instead of 0.
 */
export interface ReportsSummaryInput {
  /** The current fiscal period's income statement, or null when it failed to load. */
  income: Pick<IncomeStatement, 'totalIncome' | 'totalExpenses' | 'netIncome'> | null
  /** The balance sheet as of today, or null when it failed to load. */
  balance: Pick<BalanceSheet, 'assets'> | null
  /** The current period; null when the association has none yet, undefined when the context failed to load. */
  period: { status: string; start_date: string; end_date: string } | null | undefined
}

/** Operating and reserve cash accounts, the same two the Accounting overview shows. */
export const CASH_ACCOUNT_NUMBERS: readonly string[] = ['1010', '1020']

/** Cash on hand from a balance sheet: operating plus reserve, as the overview reads it. */
export function cashOnHand(balance: Pick<BalanceSheet, 'assets'>): number {
  return balance.assets.filter((r) => CASH_ACCOUNT_NUMBERS.includes(r.accountNumber)).reduce((s, r) => s + r.balance, 0)
}

export function reportsSummaryTiles({ income, balance, period }: ReportsSummaryInput): SummaryTile[] {
  const money = (n: number) => usd(n)
  const inc = period ? income : null
  const hint = period ? periodLabel(period) : undefined
  const unavailableHint = period === null ? 'No fiscal period yet' : undefined
  const incomeHref = '/accounting/reports/income-statement'
  return [
    { label: 'Income, year to date', value: inc ? money(inc.totalIncome) : null, hint, unavailableHint, href: incomeHref },
    { label: 'Expenses, year to date', value: inc ? money(inc.totalExpenses) : null, hint, unavailableHint, href: incomeHref },
    {
      label: 'Net',
      value: inc ? money(inc.netIncome) : null,
      hint: inc && inc.netIncome < 0 ? 'Spending is ahead of income' : 'Income less expenses',
      unavailableHint,
      href: incomeHref,
      tone: inc && inc.netIncome < 0 ? 'danger' : 'default',
    },
    {
      label: 'Cash on hand',
      value: balance ? money(cashOnHand(balance)) : null,
      hint: 'Operating plus reserve, today',
      href: '/accounting/reports/balance-sheet',
    },
    {
      label: 'Books',
      value: period ? statusOf(PERIOD_STATUS, period.status).label : null,
      hint: period ? `${periodLabel(period)} period` : undefined,
      unavailableHint,
      href: '/accounting/periods',
    },
  ]
}
