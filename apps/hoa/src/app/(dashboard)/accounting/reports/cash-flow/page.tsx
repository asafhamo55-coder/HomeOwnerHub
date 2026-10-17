import Link from 'next/link'
import { ArrowDownUp } from 'lucide-react'
import { Kpi, LoadFailed, Page, StatementTable } from '@homeowner-portal/ui'
import { computeCashFlow, getAccountingContext, listFiscalPeriods } from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDayRange, periodLabel, usd, usdSigned } from '@/lib/money/format'
import { sourceLabel } from '@/lib/money/status'
import { AccountingLoadFailed, AccountingNotSetUp, accountingCrumbs } from '../../_components/shared'
import { BooksNotOpen } from '../../../_components/BooksNotOpen'
import { PeriodFilter } from '../../_components/PeriodFilter'

export const metadata = { title: 'Cash Flow' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

const dash = <span className="text-muted">—</span>

export default async function CashFlowPage({ searchParams }: PageProps) {
  const crumbs = accountingCrumbs(['Reports', '/accounting/reports'], ['Cash flow'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Cash flow" what="the cash flow report" breadcrumbs={crumbs} />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Cash flow" returnTo="/accounting/reports/cash-flow" />

  const sp = await searchParams
  const periodsRes = await tryLoad('fiscal periods', () => listFiscalPeriods(ctx.associationId))
  if (!periodsRes.ok) return <AccountingLoadFailed title="Cash flow" what="the cash flow report" breadcrumbs={crumbs} />
  const periods = periodsRes.data
  const periodId = sp.period && periods.some((p) => p.id === sp.period) ? sp.period : ctx.currentPeriod?.id
  const period = periods.find((p) => p.id === periodId)
  if (!periodId || !period) {
    return (
      <Page linkAs={Link} breadcrumbs={crumbs} title="Cash flow">
        <BooksNotOpen
          icon={<ArrowDownUp aria-hidden />}
          title="No fiscal period yet"
          needFor="Cash flow covers one fiscal period, and this association has none."
          returnTo="/accounting/reports/cash-flow"
        />
      </Page>
    )
  }

  const res = await tryLoad('cash flow', () => computeCashFlow(ctx.associationId, periodId))
  const tone = (n: number) => (n < 0 ? 'text-danger' : n > 0 ? 'text-success' : undefined)

  return (
    <Page
      linkAs={Link}
      breadcrumbs={crumbs}
      title="Cash flow"
      description={`${periodLabel(period)} · ${formatDayRange(period.start_date, period.end_date)} · operating and reserve cash, grouped by where each movement came from.`}
    >
      <PeriodFilter periods={periods} periodId={periodId} resetHref="/accounting/reports/cash-flow" filtered={Boolean(sp.period)} />

      {!res.ok ? (
        <LoadFailed what="the cash flow report" />
      ) : (
        <>
          <section aria-label="Totals" className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            <Kpi label="Opening cash" value={usd(res.data.openingCash, { whole: true })} />
            <Kpi label="Net change" value={<span className={tone(res.data.totalNet)}>{usdSigned(res.data.totalNet, { whole: true })}</span>} />
            <Kpi label="Closing cash" value={usd(res.data.closingCash, { whole: true })} />
          </section>
          <StatementTable
            caption={`Cash flow, ${periodLabel(period)}`}
            labelHeader="Source"
            columns={[
              { key: 'in', header: 'In' },
              { key: 'out', header: 'Out' },
              { key: 'net', header: 'Net' },
            ]}
            sections={[
              {
                key: 'moves',
                empty: 'No cash moved in this period.',
                rows: res.data.rows.map((r) => ({
                  key: r.source,
                  label: sourceLabel(r.source),
                  values: {
                    in: r.inflow > 0 ? usd(r.inflow) : dash,
                    out: r.outflow > 0 ? usd(r.outflow) : dash,
                    net: <span className={tone(r.net)}>{usdSigned(r.net)}</span>,
                  },
                })),
              },
            ]}
            totals={[
              { key: 'open', label: 'Opening cash', values: { net: usd(res.data.openingCash) } },
              { key: 'change', label: 'Net change', values: { net: <span className={tone(res.data.totalNet)}>{usdSigned(res.data.totalNet)}</span> } },
              { key: 'close', label: 'Closing cash', values: { net: usd(res.data.closingCash) } },
            ]}
          />
        </>
      )}
    </Page>
  )
}
