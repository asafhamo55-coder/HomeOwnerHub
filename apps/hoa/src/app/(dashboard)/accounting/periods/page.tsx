import { CalendarClock } from 'lucide-react'
import { DataTable, LoadFailed, Page, type DataTableColumn } from '@homeowner-portal/ui'
import { getAccountingContext, listFiscalPeriods, type FiscalPeriod } from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDayRange, formatStamp, periodLabel } from '@/lib/money/format'
import { PERIOD_STATUS } from '@/lib/money/status'
import { AccountingTabs } from '../AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp, MoneyStatus } from '../_components/shared'
import { BooksNotOpen } from '../../_components/BooksNotOpen'
import { BoardPacketButton } from './BoardPacketButton'
import { ClosePeriodButton } from './ClosePeriodButton'

export const metadata = { title: 'Fiscal Periods' }
export const dynamic = 'force-dynamic'

const COLUMNS: DataTableColumn<FiscalPeriod>[] = [
  {
    key: 'period',
    header: 'Period',
    mobilePrimary: true,
    cell: (p) => (
      <span className="block">
        <span className="block font-medium text-foreground">{periodLabel(p)}</span>
        {periodLabel(p).startsWith('FY') ? (
          <span className="block text-xs text-muted">{formatDayRange(p.start_date, p.end_date)}</span>
        ) : null}
      </span>
    ),
  },
  { key: 'status', header: 'Status', cell: (p) => <MoneyStatus registry={PERIOD_STATUS} status={p.status} /> },
  { key: 'closed', header: 'Closed', className: 'whitespace-nowrap text-muted', cell: (p) => (p.closed_at ? formatStamp(p.closed_at) : '—') },
  {
    key: 'actions',
    header: <span className="sr-only">Actions</span>,
    className: 'text-right',
    cell: (p) => (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <BoardPacketButton periodId={p.id} />
        {p.status === 'open' ? <ClosePeriodButton periodId={p.id} label={periodLabel(p)} /> : null}
      </div>
    ),
  },
]

export default async function PeriodsPage() {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Fiscal periods" what="fiscal periods" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Fiscal periods" returnTo="/accounting/periods" />

  const res = await tryLoad('fiscal periods', () => listFiscalPeriods(ctx.associationId))

  return (
    <Page
      title="Fiscal periods"
      description="Closing a period moves its income and expenses into each fund’s balance and locks it. Closed periods still accept reversing entries. The board packet is a PDF of the period’s statements."
      tabs={<AccountingTabs />}
    >
      {!res.ok ? (
        <LoadFailed what="fiscal periods" />
      ) : (
        <DataTable
          caption="Fiscal periods"
          mobile="cards"
          columns={COLUMNS}
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
