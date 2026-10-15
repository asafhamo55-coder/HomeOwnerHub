import Link from 'next/link'
import { Field, FilterBar, Select, filterFieldClass } from '@homeowner-portal/ui'
import type { FiscalPeriod } from '@/lib/accounting/queries'
import { periodLabel } from '@/lib/money/format'
import { PERIOD_STATUS, statusOf } from '@/lib/money/status'

/** The period picker shared by the period-bounded reports. */
export function PeriodFilter({
  periods,
  periodId,
  resetHref,
  filtered,
  children,
}: {
  periods: FiscalPeriod[]
  periodId: string
  resetHref: string
  filtered: boolean
  children?: React.ReactNode
}) {
  return (
    <FilterBar resetHref={resetHref} filtered={filtered} linkAs={Link} label="Report options">
      <Field label="Period" className={filterFieldClass}>
        <Select name="period" defaultValue={periodId}>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {periodLabel(p)} · {statusOf(PERIOD_STATUS, p.status).label}
            </option>
          ))}
        </Select>
      </Field>
      {children}
    </FilterBar>
  )
}
