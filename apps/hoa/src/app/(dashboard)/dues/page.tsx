import Link from 'next/link'
import { Plus, Wallet } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'
import { Badge, Button, Card, EmptyState, StatusBadge } from '@homeowner-portal/ui'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MarkPaidButton } from './MarkPaidButton'
import { MaterializeButton } from './MaterializeButton'
import { DeleteAssessmentButton } from './DeleteAssessmentButton'
import { WhoOwesPanel } from './WhoOwesPanel'

export const metadata = { title: 'Dues' }
export const dynamic = 'force-dynamic'

const DUES_STATUS_TONES: Record<string, 'success' | 'warning' | 'destructive' | 'neutral' | 'outline'> = {
  paid: 'success',
  partial: 'warning',
  overdue: 'destructive',
  due: 'neutral',
  waived: 'neutral',
}

const DUES_STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  partial: 'Partly paid',
  overdue: 'Overdue',
  due: 'Due',
  waived: 'Waived',
}

interface AssessmentRow {
  id: string
  amount: number
  due_date: string
  status: string
  assessment_type: string
  fiscal_period: { id: string; start_date: string; end_date: string } | null
  unit: {
    id: string
    unit_number: string | null
    address_line1: string | null
  } | null
  payments: { amount: number }[]
}

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export default async function DuesPage() {
  const assoc = await getPrimaryAssociation()
  if (!assoc) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<Wallet className="h-10 w-10" aria-hidden />}
          title="No HOA association configured"
          description="Set up an association before viewing dues."
        />
      </div>
    )
  }

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('assessments')
    .select(
      'id, amount, due_date, status, assessment_type, fiscal_period:fiscal_period_id(id, start_date, end_date), unit:unit_id(id, unit_number, address_line1), payments(amount)',
    )
    .eq('association_id', assoc.id)
    .is('deleted_at', null)
    .order('due_date', { ascending: false })
    .limit(500)

  const rows = (data ?? []) as unknown as AssessmentRow[]

  // Group by fiscal period start month so the page reads as a stack.
  const byPeriod = new Map<string, AssessmentRow[]>()
  for (const row of rows) {
    if (!row.fiscal_period) continue
    const key = row.fiscal_period.start_date.slice(0, 7)
    if (!byPeriod.has(key)) byPeriod.set(key, [])
    byPeriod.get(key)!.push(row)
  }
  const periods = Array.from(byPeriod.entries()).sort((a, b) => b[0].localeCompare(a[0]))

  const today = new Date()
  const currentMonthLabel = format(today, 'MMM yyyy')

  // Compared as date strings, not Dates: `new Date('2026-08-09') < today`
  // is true from 00:00:01 onward, because `today` carries a time — so a
  // charge due TODAY counted as overdue here while the Who owes panel
  // directly below, which compares 'YYYY-MM-DD' strings, called it current.
  // Due today is not late; this is the boundary both now use.
  const todayIso = new Date().toISOString().slice(0, 10)
  const overdueRows = rows.filter(
    (r) => r.status !== 'paid' && r.status !== 'waived' && r.due_date < todayIso,
  )

  const totalOverdue = overdueRows.reduce((sum, r) => {
    const paid = (r.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    return sum + Math.max(Number(r.amount) - paid, 0)
  }, 0)
  const overdueUnitCount = new Set(overdueRows.map((r) => r.unit?.id)).size

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Dues</h1>
          <p className="text-sm text-muted">
            {totalOverdue > 0
              ? `${currency(totalOverdue)} overdue across ${overdueUnitCount} ${overdueUnitCount === 1 ? 'unit' : 'units'}`
              : 'All caught up.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/dues/new">
              <Plus className="h-4 w-4" />
              Add due
            </Link>
          </Button>
          <MaterializeButton monthLabel={currentMonthLabel} />
        </div>
      </header>

      <WhoOwesPanel associationId={assoc.id} />

      {error ? (
        <Card>
          <div className="p-6 text-sm text-destructive">{error.message}</div>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-10 w-10" aria-hidden />}
          title="No assessments yet"
          description="Generate this period's assessments to get started. Each one posts a Dr AR / Cr Assessment Income journal entry — visible under Accounting → General Ledger."
          action={
            <div className="flex flex-col items-center gap-2">
              <MaterializeButton monthLabel={currentMonthLabel} />
              <Button asChild variant="ghost" size="sm">
                <Link href="/properties">Add units first</Link>
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
  rows: AssessmentRow[]
  today: Date
}) {
  const totalDue = rows.reduce((sum, r) => sum + Number(r.amount), 0)
  const totalPaid = rows.reduce(
    (sum, r) => sum + (r.payments ?? []).reduce((s, p) => s + Number(p.amount), 0),
    0,
  )
  const remaining = Math.max(totalDue - totalPaid, 0)

  const [year, month] = period.split('-')
  const label = format(new Date(Number(year), Number(month) - 1, 1), 'MMMM yyyy')

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted">
            {rows.length} {rows.length === 1 ? 'assessment' : 'assessments'} ·
            billed {currency(totalDue)} · paid {currency(totalPaid)}
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
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Unit</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Due</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
              <th className="px-4 py-2 text-right font-medium">Paid</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const due = new Date(r.due_date)
              const paidAmount = (r.payments ?? []).reduce(
                (s, p) => s + Number(p.amount),
                0,
              )
              const isPaid = r.status === 'paid'
              const daysLate = isPaid ? 0 : Math.max(0, differenceInCalendarDays(today, due))
              const isOverdue = !isPaid && daysLate > 0
              const balance = Math.max(Number(r.amount) - paidAmount, 0)

              return (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <p className="font-medium text-foreground">
                      {r.unit?.address_line1 ?? 'Unknown unit'}
                    </p>
                    {r.unit?.unit_number ? (
                      <p className="text-xs text-muted">Unit {r.unit.unit_number}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {r.assessment_type}
                  </td>
                  <td className="px-4 py-2 text-muted">{format(due, 'MMM d')}</td>
                  <td className="px-4 py-2 text-right font-mono text-foreground">
                    {currency(Number(r.amount))}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-muted">
                    {paidAmount > 0 ? currency(paidAmount) : '—'}
                  </td>
                  <td className="px-4 py-2">
                    {isPaid ? (
                      <StatusBadge
                        status="paid"
                        tones={DUES_STATUS_TONES}
                        labels={DUES_STATUS_LABELS}
                        size="sm"
                      />
                    ) : r.status === 'partial' ? (
                      <StatusBadge
                        status="partial"
                        tones={DUES_STATUS_TONES}
                        labels={DUES_STATUS_LABELS}
                        size="sm"
                      />
                    ) : isOverdue ? (
                      <Badge variant="destructive" size="sm">
                        {daysLate} days late
                      </Badge>
                    ) : (
                      <StatusBadge
                        status="due"
                        tones={DUES_STATUS_TONES}
                        labels={DUES_STATUS_LABELS}
                        size="sm"
                      />
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!isPaid ? (
                        <>
                          <MarkPaidButton assessmentId={r.id} balance={balance} />
                          <DeleteAssessmentButton assessmentId={r.id} />
                        </>
                      ) : null}
                    </div>
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
