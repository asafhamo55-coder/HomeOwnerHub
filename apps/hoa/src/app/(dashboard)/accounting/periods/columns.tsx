import type { DataTableColumn } from '@homeowner-portal/ui'
import type { FiscalPeriod } from '@/lib/accounting/queries'
import { formatDay, formatDayRange, formatStamp, periodLabel } from '@/lib/money/format'
import { PERIOD_STATUS } from '@/lib/money/status'
import { MoneyStatus } from '../_components/shared'
import { BoardPacketButton } from './BoardPacketButton'
import { ClosePeriodButton } from './ClosePeriodButton'
import { periodHasEnded, type CloseChecks } from './close-checks-shared'

// No checks were loaded for this period: say so rather than show all clear.
const UNCHECKED: CloseChecks = { drafts: { ok: false }, proposals: { ok: false }, unreconciled: { ok: false } }

/**
 * `today` is the association's day: a period that starts after it (next
 * year, opened early — BL-076) says when it starts and can't be closed yet.
 */
export function periodColumns(
  today: string,
  currentId: string | null,
  checksFor: (periodId: string) => CloseChecks | null = () => null,
): DataTableColumn<FiscalPeriod>[] {
  return [
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
    {
      key: 'status',
      header: 'Status',
      cell: (p) => (
        <span className="flex flex-col items-start gap-0.5">
          <MoneyStatus registry={PERIOD_STATUS} status={p.status} />
          {p.id === currentId ? <span className="text-xs text-muted">Current period</span> : null}
          {p.start_date > today ? <span className="text-xs text-muted">Starts {formatDay(p.start_date)}</span> : null}
        </span>
      ),
    },
    { key: 'closed', header: 'Closed', className: 'whitespace-nowrap text-muted', cell: (p) => (p.closed_at ? formatStamp(p.closed_at) : '—') },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (p) => (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <BoardPacketButton periodId={p.id} />
          {p.status === 'open' && p.start_date <= today ? (
            periodHasEnded(p.end_date, today) ? (
              <ClosePeriodButton
                periodId={p.id}
                label={periodLabel(p)}
                endDate={p.end_date}
                checks={checksFor(p.id) ?? UNCHECKED}
              />
            ) : (
              <span className="text-xs text-muted">Can close after {formatDay(p.end_date)}</span>
            )
          ) : null}
        </div>
      ),
    },
  ]
}
