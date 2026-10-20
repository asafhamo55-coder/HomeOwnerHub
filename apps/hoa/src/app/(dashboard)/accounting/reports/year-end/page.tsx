import Link from 'next/link'
import { FileArchive } from 'lucide-react'
import { Alert, Card, Kpi, LoadFailed, Page, StatementTable } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getAccountingContext, listFiscalPeriods } from '@/lib/accounting/queries'
import { loadYearEndPreview } from '@/lib/accounting/year-end/load'
import { BANK_REC_STATUS_LABEL, INCOME_CLASS_LABEL, NOT_TAX_ADVICE } from '@/lib/accounting/year-end/model'
import { todayIn } from '@/lib/association-time'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDayRange, periodLabel, usd } from '@/lib/money/format'
import { ExportDownloadButton } from '@/components/export/ExportDownloadButton'
import { AccountingLoadFailed, AccountingNotSetUp, accountingCrumbs } from '../../_components/shared'
import { BooksNotOpen } from '../../../_components/BooksNotOpen'
import { PeriodFilter } from '../../_components/PeriodFilter'

export const metadata = { title: 'Year-end package' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

const FILES = [
  'Trial balance',
  'Income statement',
  'Balance sheet at year end',
  'General ledger detail',
  'Amounts owed by each home at year end (AR aging)',
  'Bank reconciliation status for each account',
  'Vendor payments by vendor',
  'Budget vs. actual',
  'Form 1120-H worksheet',
  '1099-NEC candidate list',
]

const blank = (n: number | null, fmt: (n: number) => string) => (n == null ? <span className="text-muted">Blank, for the CPA</span> : fmt(n))

// BL-121. Board or admin only: the package carries the whole ledger and
// vendor payments. The gate runs before any read; residents are redirected.
export default async function YearEndPackagePage({ searchParams }: PageProps) {
  await requireBoardOrAdmin()
  const crumbs = accountingCrumbs(['Reports', '/accounting/reports'], ['Year-end package'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Year-end package" what="the year-end package" breadcrumbs={crumbs} />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Year-end package" returnTo="/accounting/reports/year-end" />

  const sp = await searchParams
  const periodsRes = await tryLoad('fiscal periods', () => listFiscalPeriods(ctx.associationId))
  if (!periodsRes.ok) return <AccountingLoadFailed title="Year-end package" what="the year-end package" breadcrumbs={crumbs} />
  const periods = periodsRes.data
  // Default: the most recent fiscal year that has ended — the one the CPA wants.
  const today = todayIn(ctx.timeZone)
  const fallback = periods.find((p) => p.end_date < today) ?? periods[0]
  const period = periods.find((p) => p.id === sp.period) ?? fallback
  if (!period) {
    return (
      <Page linkAs={Link} breadcrumbs={crumbs} title="Year-end package">
        <BooksNotOpen
          icon={<FileArchive aria-hidden />}
          title="No fiscal year yet"
          needFor="The year-end package covers one fiscal year, and this association has none."
          returnTo="/accounting/reports/year-end"
        />
      </Page>
    )
  }

  const preview = await tryLoad('year-end preview', () =>
    loadYearEndPreview({
      orgId: ctx.organizationId,
      associationId: ctx.associationId,
      associationName: ctx.associationName,
      timeZone: ctx.timeZone,
      period,
    }),
  )

  return (
    <Page
      linkAs={Link}
      breadcrumbs={crumbs}
      title="Year-end package"
      description={`${periodLabel(period)} · ${formatDayRange(period.start_date, period.end_date)} · one zip of spreadsheets to hand your CPA`}
    >
      <PeriodFilter periods={periods} periodId={period.id} resetHref="/accounting/reports/year-end" filtered={Boolean(sp.period)} />

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">What’s in the zip</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-muted">
            {FILES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
        <ExportDownloadButton
          url={`/api/accounting/year-end/${period.id}`}
          label="Download year-end package"
          fallbackName={`year-end-package-${period.end_date}.zip`}
          variant="primary"
        />
        <p className="text-xs text-muted">Each download is recorded in the activity log.</p>
      </Card>

      <Alert variant="info" title="Not tax advice">
        {NOT_TAX_ADVICE}
      </Alert>

      {!preview.ok ? (
        <LoadFailed what="the year-end preview" />
      ) : (
        <>
          <section aria-label="Totals" className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            <Kpi label="Gross income" value={usd(preview.data.worksheet.grossIncome, { whole: true })} />
            <Kpi label="1099-NEC candidates" value={String(preview.data.nec.length)} />
            <Kpi
              label="Bank accounts reconciled to year end"
              value={`${preview.data.bankRecs.filter((r) => r.status === 'reconciled_to_year_end').length} of ${preview.data.bankRecs.length}`}
            />
          </section>

          <StatementTable
            caption="Form 1120-H worksheet"
            labelHeader="Form 1120-H worksheet"
            columns={[{ key: 'amt', header: 'Amount' }]}
            sections={[
              {
                key: 'income',
                title: 'Income accounts',
                rows: preview.data.worksheet.incomeLines.map((l) => ({
                  key: l.accountNumber,
                  label: `${l.accountNumber} ${l.accountName}`,
                  detail: INCOME_CLASS_LABEL[l.classification],
                  values: { amt: usd(l.amount) },
                })),
              },
              {
                key: 'tests',
                title: 'For the CPA',
                rows: [
                  { key: 'exempt', label: 'Exempt function income', values: { amt: usd(preview.data.worksheet.exemptFunctionIncome) } },
                  { key: 'nonexempt', label: 'Income that is not exempt function income', values: { amt: usd(preview.data.worksheet.nonExemptIncome) } },
                  { key: 'unclassified', label: 'Left for the CPA to classify', values: { amt: usd(preview.data.worksheet.unclassifiedIncome) } },
                  {
                    key: 'share',
                    label: 'Exempt function income as a share of gross income',
                    values: { amt: blank(preview.data.worksheet.exemptSharePct, (n) => `${n}%`) },
                  },
                  {
                    key: 'ninety',
                    label: 'Spending on association property (90% test)',
                    values: { amt: <span className="text-muted">Blank, for the CPA</span> },
                  },
                ],
              },
            ]}
          />

          <StatementTable
            caption="1099-NEC candidates"
            labelHeader={`1099-NEC candidates, ${preview.data.calendarYear}`}
            columns={[
              { key: 'paid', header: 'Paid' },
              { key: 'w9', header: 'W-9 on file', hideOnMobile: true },
            ]}
            sections={[
              {
                key: 'nec',
                empty: 'No vendor was paid $600 or more this calendar year.',
                rows: preview.data.nec.map((r) => ({
                  key: r.vendorId ?? r.vendorName,
                  label: r.vendorName,
                  detail: 'Entity type not stored — verify W-9',
                  values: {
                    paid: usd(r.totalCents / 100),
                    w9: r.w9OnFile == null ? 'Unknown' : r.w9OnFile ? 'Yes' : 'No',
                  },
                })),
              },
            ]}
          />

          <StatementTable
            caption="Bank reconciliation status"
            labelHeader="Bank account"
            columns={[{ key: 'status', header: 'Status' }]}
            sections={[
              {
                key: 'bank',
                empty: 'No bank accounts.',
                rows: preview.data.bankRecs.map((r, i) => ({
                  key: `${r.accountName}-${i}`,
                  label: r.last4 ? `${r.accountName} ····${r.last4}` : r.accountName,
                  detail: r.statementDate ? `Last statement reconciled: ${r.statementDate}` : undefined,
                  values: { status: BANK_REC_STATUS_LABEL[r.status] },
                })),
              },
            ]}
          />
        </>
      )}
    </Page>
  )
}
