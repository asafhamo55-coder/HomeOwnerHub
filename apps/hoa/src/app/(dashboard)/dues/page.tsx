import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'
import { Badge, Button, Card, EmptyState } from '@homeownerhub/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MarkPaidButton } from './MarkPaidButton'
import { MaterializeButton } from './MaterializeButton'

export const metadata = { title: 'Dues' }

interface DuesRow {
  id: string
  period: string
  due_date: string
  amount_due: number
  amount_paid: number | null
  late_fee: number | null
  status: string | null
  paid_date: string | null
  property: { address: string; unit_number: string | null } | null
}

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export default async function DuesPage() {
  const org = await getCurrentOrg()
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('hoa_dues')
    .select(
      'id, period, due_date, amount_due, amount_paid, late_fee, status, paid_date, property:hoa_properties(address, unit_number)',
    )
    .order('due_date', { ascending: false })
    .order('property_id', { ascending: true })
    .limit(500)

  const rows = (data ?? []) as unknown as DuesRow[]

  // Group by period (YYYY-MM) so the page reads as a stack of months.
  const byPeriod = new Map<string, DuesRow[]>()
  for (const row of rows) {
    const key = row.period
    if (!byPeriod.has(key)) byPeriod.set(key, [])
    byPeriod.get(key)!.push(row)
  }
  const periods = Array.from(byPeriod.entries()).sort((a, b) => b[0].localeCompare(a[0]))

  const today = new Date()
  const currentMonthLabel = format(today, 'MMM yyyy')

  // Top-of-page totals
  const totalOverdue = rows
    .filter((r) => r.status !== 'paid' && new Date(r.due_date) < today)
    .reduce(
      (sum, r) =>
        sum + Math.max((r.amount_due ?? 0) + (r.late_fee ?? 0) - (r.amount_paid ?? 0), 0),
      0,
    )
  const overduePropertyCount = new Set(
    rows
      .filter((r) => r.status !== 'paid' && new Date(r.due_date) < today)
      .map((r) => r.property?.address),
  ).size

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-muted">Dues</h1>
          <p className="text-sm text-muted-fg">
            {totalOverdue > 0
              ? `${currency(totalOverdue)} overdue across ${overduePropertyCount} ${overduePropertyCount === 1 ? 'property' : 'properties'}`
              : 'All caught up.'}
          </p>
        </div>
        <MaterializeButton monthLabel={currentMonthLabel} />
      </header>

      {error ? (
        <Card>
          <div className="p-6 text-sm text-destructive">{error.message}</div>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-10 w-10" aria-hidden />}
          title="No dues records yet"
          description="Generate this month's dues to get started. The Inngest cron will flip overdue rows to 'late' automatically each midnight."
          action={
            <div className="flex flex-col items-center gap-2">
              <MaterializeButton monthLabel={currentMonthLabel} />
              <Button asChild variant="ghost" size="sm">
                <Link href="/properties">Add properties first</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          {periods.map(([period, periodRows]) => (
            <PeriodTable key={period} period={period} rows={periodRows} today={today} />
          ))}
        </div>
      )}
    </div>
  )
}

function PeriodTable({
  period,
  rows,
  today,
}: {
  period: string
  rows: DuesRow[]
  today: Date
}) {
  const totalDue = rows.reduce(
    (sum, r) => sum + (r.amount_due ?? 0) + (r.late_fee ?? 0),
    0,
  )
  const totalPaid = rows.reduce((sum, r) => sum + (r.amount_paid ?? 0), 0)
  const remaining = Math.max(totalDue - totalPaid, 0)

  // Period is e.g. "2026-05"; show a friendly label.
  const [year, month] = period.split('-')
  const label = format(new Date(Number(year), Number(month) - 1, 1), 'MMMM yyyy')

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-muted">{label}</p>
          <p className="text-xs text-muted-fg">
            {rows.length} {rows.length === 1 ? 'property' : 'properties'} · billed{' '}
            {currency(totalDue)} · paid {currency(totalPaid)}
          </p>
        </div>
        {remaining > 0 ? (
          <Badge variant="warning" size="sm">
            {currency(remaining)} outstanding
          </Badge>
        ) : (
          <Badge variant="success" size="sm">
            paid in full
          </Badge>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-fg">
            <tr>
              <th className="px-4 py-2 font-medium">Property</th>
              <th className="px-4 py-2 font-medium">Due</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Late fee</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const due = new Date(r.due_date)
              const isPaid = r.status === 'paid'
              const daysLate = isPaid ? 0 : Math.max(0, differenceInCalendarDays(today, due))
              const isOverdue = !isPaid && daysLate > 0
              const totalRowDue = (r.amount_due ?? 0) + (r.late_fee ?? 0)

              return (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <p className="font-medium text-muted">
                      {r.property?.address ?? 'Unknown property'}
                    </p>
                    {r.property?.unit_number ? (
                      <p className="text-xs text-muted-fg">Unit {r.property.unit_number}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-muted-fg">{format(due, 'MMM d')}</td>
                  <td className="px-4 py-2 text-muted">{currency(r.amount_due)}</td>
                  <td className="px-4 py-2">
                    {r.late_fee ? (
                      <span className="text-destructive">+ {currency(r.late_fee)}</span>
                    ) : (
                      <span className="text-muted-fg">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isPaid ? (
                      <Badge variant="success" size="sm">
                        paid{r.paid_date ? ` · ${format(new Date(r.paid_date), 'MMM d')}` : ''}
                      </Badge>
                    ) : isOverdue ? (
                      <Badge variant="destructive" size="sm">
                        {daysLate} days late
                      </Badge>
                    ) : (
                      <Badge variant="outline" size="sm">
                        pending
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!isPaid ? (
                      <MarkPaidButton duesId={r.id} totalDue={totalRowDue} />
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
