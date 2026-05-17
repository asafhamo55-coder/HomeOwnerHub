import Link from 'next/link'
import { ChevronLeft, ListChecks } from 'lucide-react'
import { format } from 'date-fns'
import { Card, EmptyState } from '@homeowner-portal/ui'
import {
  computeBalanceSheet,
  getAccountingContext,
  listFiscalPeriods,
  type ReportLineRow,
} from '@/lib/accounting/queries'

export const metadata = { title: 'Balance Sheet' }

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

interface PageProps {
  searchParams: Promise<{ asOf?: string }>
}

export default async function BalanceSheetPage({ searchParams }: PageProps) {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<ListChecks className="h-10 w-10" aria-hidden />}
          title="No data yet"
          description="Run pnpm seed:accounting first."
        />
      </div>
    )
  }

  const sp = await searchParams
  const periods = await listFiscalPeriods(ctx.associationId)
  const defaultAsOf =
    sp.asOf ?? periods[0]?.end_date ?? new Date().toISOString().slice(0, 10)

  const bs = await computeBalanceSheet(ctx.associationId, defaultAsOf)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/accounting"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Accounting
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Balance Sheet</h1>
        <p className="text-sm text-muted">
          Position as of {format(new Date(defaultAsOf), 'PP')} · posted entries only
        </p>
      </header>

      <Card>
        <form className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            As of
            <input
              type="date"
              name="asOf"
              defaultValue={defaultAsOf}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg hover:bg-primary/90"
          >
            Refresh
          </button>
        </form>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <tbody>
            <SectionHeader label="Assets" />
            <SectionRows rows={bs.assets} />
            <Subtotal label="Total assets" amount={bs.totalAssets} />

            <SectionHeader label="Liabilities" />
            <SectionRows rows={bs.liabilities} />
            <Subtotal label="Total liabilities" amount={bs.totalLiabilities} />

            <SectionHeader label="Equity" />
            <SectionRows rows={bs.equity} />
            <tr className="border-b border-border">
              <td className="px-4 py-1 italic text-muted">
                <span className="font-mono text-xs">PTD</span> Net income (period-to-date)
              </td>
              <td className="px-4 py-1 text-right font-mono text-foreground">
                {currency(bs.netIncomePtd)}
              </td>
            </tr>
            <Subtotal label="Total equity" amount={bs.totalEquity} />

            <tr className="border-t-2 border-border bg-background/40">
              <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Total liabilities + equity
              </td>
              <td className="px-4 py-2 text-right font-mono font-semibold">
                {currency(bs.totalLiabilities + bs.totalEquity)}
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="px-4 py-2 text-right text-xs">
                {bs.isBalanced ? (
                  <span className="text-emerald-500">✓ balanced</span>
                ) : (
                  <span className="text-destructive">
                    ✗ off by {currency(Math.abs(bs.totalAssets - (bs.totalLiabilities + bs.totalEquity)))}
                  </span>
                )}
              </td>
            </tr>
          </tbody>
          </table>
        </div>
      </Card>

      {!bs.isBalanced ? (
        <Card>
          <div className="p-4 text-sm text-destructive">
            Balance sheet does not balance — Assets ≠ Liabilities + Equity. This
            should be impossible if the validate_je_balances trigger is doing
            its job. Investigate immediately.
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="bg-background/30">
      <td colSpan={2} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </td>
    </tr>
  )
}

function SectionRows({ rows }: { rows: ReportLineRow[] }) {
  if (rows.length === 0) {
    return (
      <tr className="border-b border-border">
        <td colSpan={2} className="px-4 py-1 text-xs italic text-muted">
          (none)
        </td>
      </tr>
    )
  }
  return (
    <>
      {rows.map((r) => (
        <tr key={r.accountId} className="border-b border-border">
          <td className="px-4 py-1">
            <span className="font-mono text-xs text-muted">{r.accountNumber}</span>{' '}
            {r.accountName}
          </td>
          <td className="px-4 py-1 text-right font-mono text-foreground">
            {(r.balance).toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 2,
            })}
          </td>
        </tr>
      ))}
    </>
  )
}

function Subtotal({ label, amount }: { label: string; amount: number }) {
  return (
    <tr className="border-b-2 border-border bg-background/20">
      <td className="px-4 py-2 text-xs uppercase tracking-wide text-muted">{label}</td>
      <td className="px-4 py-2 text-right font-mono font-semibold">
        {amount.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 2,
        })}
      </td>
    </tr>
  )
}
