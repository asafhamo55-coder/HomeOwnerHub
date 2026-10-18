import { StatusPill, type DataTableColumn } from '@homeowner-portal/ui'
import type { PaymentPlanRow } from '@/lib/accounting/queries'
import { formatDay, usd } from '@/lib/money/format'
import { describePlanStanding, type PlanStandingView } from '@/lib/money/plan-standing'
import { PLAN_STATUS } from '@/lib/money/status'
import { MoneyStatus } from '../_components/shared'

/**
 * Payment plans table. `standings` is null when the progress read failed:
 * the Progress column then says so instead of guessing (BL-080).
 */
export function paymentPlanColumns(standings: Record<string, PlanStandingView> | null): DataTableColumn<PaymentPlanRow>[] {
  return [
    {
      key: 'unit',
      header: 'Property',
      mobilePrimary: true,
      cell: (p) => (
        <span className="block">
          <span className="block font-medium text-foreground">{p.unit?.address_line1 ?? 'Unknown property'}</span>
          {p.unit?.unit_number ? <span className="block text-xs text-muted">Unit {p.unit.unit_number}</span> : null}
        </span>
      ),
    },
    {
      key: 'schedule',
      header: 'Schedule',
      className: 'whitespace-nowrap',
      cell: (p) => (
        <span className="num">
          {p.installment_count} × {usd(Number(p.installment_amount))}
          <span className="text-muted"> / month</span>
        </span>
      ),
    },
    { key: 'start', header: 'Starts', className: 'whitespace-nowrap text-muted', cell: (p) => formatDay(p.start_date) },
    { key: 'total', header: 'Total', numeric: true, cell: (p) => usd(Number(p.total_amount)) },
    { key: 'status', header: 'Status', cell: (p) => <MoneyStatus registry={PLAN_STATUS} status={p.status} /> },
    {
      key: 'progress',
      header: 'Progress',
      cell: (p) => {
        if (standings === null && (p.status === 'active' || p.status === 'completed')) {
          return <span className="text-sm text-muted">Couldn’t load</span>
        }
        const text = describePlanStanding(standings?.[p.id], p)
        if (!text) return <span className="text-muted">—</span>
        // Completed already shows in Status; repeat only the detail.
        return (
          <span className="block space-y-1">
            {p.status === 'completed' ? null : <StatusPill tone={text.tone} label={text.label} size="sm" />}
            <span className="block text-xs text-muted">{text.detail}</span>
          </span>
        )
      },
    },
  ]
}

/** How many active plans are behind, for the page's summary line. */
export function behindCount(standings: Record<string, PlanStandingView> | null): number {
  if (!standings) return 0
  return Object.values(standings).filter((s) => s.standing === 'behind').length
}
