import Link from 'next/link'
import { Alert, Card, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getAccountingContext, listFiscalPeriods } from '@/lib/accounting/queries'
import { load1099Summary } from '@/lib/accounting/year-end/load-1099'
import {
  form1099NecMinimumCents,
  FORM_1099_NOT_TAX_ADVICE,
} from '@/lib/accounting/year-end/form1099'
import { todayIn } from '@/lib/association-time'
import { tryLoad } from '@/lib/load-or-fail'
import { periodLabel, usd } from '@/lib/money/format'
import { ExportDownloadButton } from '@/components/export/ExportDownloadButton'
import { PrintPacketButton } from '@/app/(dashboard)/meetings/[id]/packet/PrintPacketButton'
import { AccountingLoadFailed, AccountingNotSetUp, accountingCrumbs } from '../../../_components/shared'
import { PeriodFilter } from '../../../_components/PeriodFilter'

export const metadata = { title: '1099 vendor summary' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

// B9. Board or admin only. One sheet per vendor for the board or CPA to
// prepare Form 1099-NEC from. Tax ids show as the last four digits only.
export default async function Vendor1099Page({ searchParams }: PageProps) {
  await requireBoardOrAdmin()
  const crumbs = accountingCrumbs(['Reports', '/accounting/reports'], ['Year-end package', '/accounting/reports/year-end'], ['1099 vendor summary'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="1099 vendor summary" what="the 1099 summary" breadcrumbs={crumbs} />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="1099 vendor summary" returnTo="/accounting/reports/year-end/1099" />

  const sp = await searchParams
  const periodsRes = await tryLoad('fiscal periods', () => listFiscalPeriods(ctx.associationId))
  if (!periodsRes.ok) return <AccountingLoadFailed title="1099 vendor summary" what="the 1099 summary" breadcrumbs={crumbs} />
  const periods = periodsRes.data
  const today = todayIn(ctx.timeZone)
  const period = periods.find((p) => p.id === sp.period) ?? periods.find((p) => p.end_date < today) ?? periods[0]
  if (!period) {
    return (
      <Page linkAs={Link} breadcrumbs={crumbs} title="1099 vendor summary">
        <Alert variant="info" title="No fiscal year yet">This association has no fiscal year, so there is nothing to summarize.</Alert>
      </Page>
    )
  }

  const res = await tryLoad('1099 summary', () =>
    load1099Summary({
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
      title="1099 vendor summary"
      description={`${periodLabel(period)} · one sheet for each vendor paid $600 or more, to hand your board or CPA. Each sheet shows whether the vendor reaches the filing minimum`}
      actions={
        <span className="print:hidden">
          <PrintPacketButton />
        </span>
      }
    >
      <div className="print:hidden">
        <PeriodFilter periods={periods} periodId={period.id} resetHref="/accounting/reports/year-end/1099" filtered={Boolean(sp.period)} />
      </div>

      <Alert variant="warning" title="Check every figure. This is not tax advice.">
        {FORM_1099_NOT_TAX_ADVICE}
      </Alert>

      {!res.ok ? (
        <LoadFailed what="the 1099 summary" />
      ) : (
        <>
          <p className="text-sm text-muted">
            Payments made in {res.data.calendarYear}. For that year the IRS filing minimum for Form 1099-NEC is{' '}
            {usd(form1099NecMinimumCents(res.data.calendarYear) / 100, { whole: true })} (IRS instructions revised 12/2026, checked 2026-11-02). Vendors
            below that line are still listed so your CPA can decide. Payments made by card are usually reported by the card company, so
            they are taken out of the Box 1a figure. Your CPA decides if a vendor is a corporation and does not need a form.
          </p>
          <div className="print:hidden">
            <ExportDownloadButton
              url={`/api/accounting/year-end/${period.id}/1099`}
              label="Download as a spreadsheet"
              fallbackName={`1099-nec-summary-${res.data.calendarYear}.csv`}
            />
          </div>

          {res.data.rows.length === 0 ? (
            <Card className="p-5 text-sm text-foreground">No vendor was paid $600 or more in {res.data.calendarYear}.</Card>
          ) : (
            res.data.rows.map((r) => (
              <Card key={r.vendorId} className="break-inside-avoid p-5 print:break-after-page">
                <h2 className="text-lg font-semibold text-foreground">{r.name}</h2>
                {r.dba ? <p className="text-sm text-muted">Doing business as {r.dba}</p> : null}
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">Mailing address</dt>
                    <dd className="text-foreground">
                      {r.addressLines.length ? r.addressLines.map((l) => <span key={l} className="block">{l}</span>) : 'Not on file. Get it from the W-9.'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Tax ID (last 4 digits only)</dt>
                    <dd className="text-foreground">{r.tinLast4 ? `***-**-${r.tinLast4}` : 'Not on file. Get a W-9.'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">W-9 on file</dt>
                    <dd className="text-foreground">{r.w9OnFile == null ? 'Unknown' : r.w9OnFile ? 'Yes' : 'No'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Payments in the year</dt>
                    <dd className="text-foreground">{r.payments}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Total paid</dt>
                    <dd className="text-foreground">{usd(r.totalCents / 100)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Paid by card (not in Box 1a)</dt>
                    <dd className="text-foreground">{usd(r.cardCents / 100)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted">Box 1a, Nonemployee Compensation (suggested)</dt>
                    <dd className="text-base font-semibold text-foreground">{usd(r.box1aCents / 100)}</dd>
                    <dd className="text-muted">
                      {r.meetsThreshold ? 'At or over the filing minimum for this year.' : 'Under the filing minimum for this year. Your CPA decides.'}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-sm text-muted">Board or CPA: confirm the vendor type, the amounts and whether a form is due.</p>
              </Card>
            ))
          )}
        </>
      )}
    </Page>
  )
}
