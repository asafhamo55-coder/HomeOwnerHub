import { CalendarClock } from 'lucide-react'
import { DataTable, LoadFailed, Page } from '@homeowner-portal/ui'
import { getAccountingContext, listFiscalPeriods } from '@/lib/accounting/queries'
import { nextFiscalYearOffer } from '@/lib/accounting/open-next-fiscal-year'
import { getCurrentUserRole } from '@/lib/auth'
import { tryLoad } from '@/lib/load-or-fail'
import { todayIso } from '@/lib/money/format'
import { AccountingTabs } from '../AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp } from '../_components/shared'
import { BooksNotOpen } from '../../_components/BooksNotOpen'
import { OpenNextFiscalYearButton } from '../_components/OpenNextFiscalYearButton'
import { periodColumns } from './columns'

export const metadata = { title: 'Fiscal Periods' }
export const dynamic = 'force-dynamic'

export default async function PeriodsPage() {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Fiscal periods" what="fiscal periods" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Fiscal periods" returnTo="/accounting/periods" />

  const [res, role] = await Promise.all([
    tryLoad('fiscal periods', () => listFiscalPeriods(ctx.associationId)),
    getCurrentUserRole(),
  ])
  const today = todayIso(ctx.timeZone)
  // BL-076: admins only, like opening the books; offered only when there is a year to add.
  const offer = res.ok && role?.role === 'admin' ? nextFiscalYearOffer(res.data, today) : null

  return (
    <Page
      title="Fiscal periods"
      description="Closing a period moves its income and expenses into each fund’s balance and locks it. Closed periods still accept reversing entries. The board packet is a PDF of the period’s statements."
      tabs={<AccountingTabs />}
      actions={offer ? <OpenNextFiscalYearButton {...offer} /> : undefined}
    >
      {!res.ok ? (
        <LoadFailed what="fiscal periods" />
      ) : (
        <DataTable
          caption="Fiscal periods"
          mobile="cards"
          columns={periodColumns(today, ctx.currentPeriod?.id ?? null)}
          rows={res.data}
          rowKey={(p) => p.id}
          empty={
            <BooksNotOpen
              variant="compact"
              icon={<CalendarClock aria-hidden />}
              title="No fiscal periods"
              needFor="Entries post into a fiscal period, and this association has none yet."
              returnTo="/accounting/periods"
            />
          }
        />
      )}
    </Page>
  )
}
