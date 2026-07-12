import Link from 'next/link'
import { ChevronLeft, LineChart } from 'lucide-react'
import { format } from 'date-fns'
import { Card, EmptyState, Select } from '@homeowner-portal/ui'
import {
  computeTrialBalance,
  getAccountingContext,
  listFiscalPeriods,
  type AccountType,
  type TrialBalanceRow,
} from '@/lib/accounting/queries'

export const metadata = { title: 'Trial Balance' }

const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'income', 'expense']
const TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expenses',
}

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

export default async function TrialBalancePage({ searchParams }: PageProps) {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<LineChart className="h-10 w-10" aria-hidden />}
          title="No trial balance yet"
          description="This area is empty. Contact support to set up accounting for your association."
        />
      </div>
    )
  }

  const sp = await searchParams
  const periods = await listFiscalPeriods(ctx.associationId)
  const periodId =
    sp.period && periods.some((p) => p.id === sp.period)
      ? sp.period
      : ctx.currentPeriod?.id

  if (!periodId) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<LineChart className="h-10 w-10" aria-hidden />}
          title="No fiscal period configured"
          description="Seed a fiscal period before viewing trial balance."
        />
      </div>
    )
  }

  const period = periods.find((p) => p.id === periodId)!
  const tb = await computeTrialBalance(ctx.associationId, periodId)

  const byType = new Map<AccountType, TrialBalanceRow[]>()
  for (const row of tb.rows) {
    const list = byType.get(row.accountType) ?? []
    list.push(row)
    byType.set(row.accountType, list)
  }

  const isBalanced = tb.totalDebits === tb.totalCredits

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/accounting"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Accounting
        </Link>
        <h1>Trial Balance</h1>
        <p className="text-sm text-muted">
          {format(new Date(period.start_date), 'MMM d, yyyy')} —{' '}
          {format(new Date(period.end_date), 'MMM d, yyyy')} ·{' '}
          <span className="font-mono">{period.status}</span> · posted entries only
        </p>
      </header>

      <Card>
        <form className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Period
            <Select
              name="period"
              defaultValue={periodId}
              className="w-full sm:w-56"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {format(new Date(p.start_date), 'yyyy')} · {p.status}
                </option>
              ))}
            </Select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg hover:bg-primary/90"
          >
            Refresh
          </button>
        </form>
      </Card>

      {tb.rows.length === 0 ? (
        <EmptyState
          icon={<LineChart className="h-10 w-10" aria-hidden />}
          title="No posted entries in this period"
          description="Trial balance is empty until journal entries are posted."
        />
      ) : (
        <>
          <Card>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 text-right font-medium">Total debits</th>
                  <th className="px-4 py-2 text-right font-medium">Total credits</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {TYPE_ORDER.filter((t) => (byType.get(t) ?? []).length > 0).map((type) => {
                  const rows = byType.get(type) ?? []
                  const subtotalDr = rows.reduce((s, r) => s + r.totalDebits, 0)
                  const subtotalCr = rows.reduce((s, r) => s + r.totalCredits, 0)
                  return (
                    <>
                      <tr key={`hdr-${type}`} className="bg-background/30">
                        <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                          {TYPE_LABEL[type]}
                        </td>
                      </tr>
                      {rows.map((r) => (
                        <tr key={r.accountId} className="border-b border-border">
                          <td className="px-4 py-2">
                            <div className="font-mono text-xs text-muted">
                              {r.accountNumber}
                            </div>
                            <div className="text-foreground">{r.accountName}</div>
                          </td>
                          <td className="px-4 py-2 text-right font-mono">
                            {r.totalDebits > 0 ? currency(r.totalDebits) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-mono">
                            {r.totalCredits > 0 ? currency(r.totalCredits) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-semibold">
                            {currency(r.balance)}{' '}
                            <span className="text-xs font-normal text-muted">
                              {r.isNormalDebit ? 'Dr' : 'Cr'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr key={`sub-${type}`} className="border-b-2 border-border bg-background/20">
                        <td className="px-4 py-2 text-xs uppercase tracking-wide text-muted">
                          Subtotal — {TYPE_LABEL[type]}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-foreground">
                          {currency(subtotalDr)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-foreground">
                          {currency(subtotalCr)}
                        </td>
                        <td className="px-4 py-2" />
                      </tr>
                    </>
                  )
                })}
              </tbody>
              <tfoot className="border-t-2 border-border bg-background/40">
                <tr>
                  <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    Totals
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">
                    {currency(tb.totalDebits)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">
                    {currency(tb.totalCredits)}
                  </td>
                  <td className="px-4 py-2 text-right text-xs">
                    {isBalanced ? (
                      <span className="text-emerald-500">✓ balanced</span>
                    ) : (
                      <span className="text-destructive">
                        ✗ off by {currency(Math.abs(tb.totalDebits - tb.totalCredits))}
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
            </div>
          </Card>
          {!isBalanced ? (
            <Card>
              <div className="p-4 text-sm text-destructive">
                The trial balance doesn't balance — debits and credits don't
                match. Open the Ledger and review the most recent entries for
                a mis-posted line.
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}
