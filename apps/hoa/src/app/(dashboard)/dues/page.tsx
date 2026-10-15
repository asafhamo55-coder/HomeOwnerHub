import Link from 'next/link'
import { Plus, Wallet } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  LoadFailed,
  Page,
  Pager,
  StatusBadge,
  pageRange,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { MarkPaidButton } from './MarkPaidButton'
import { MaterializeButton } from './MaterializeButton'
import { DeleteAssessmentButton } from './DeleteAssessmentButton'
import { WhoOwesPanel } from './WhoOwesPanel'

export const metadata = { title: 'Dues' }
export const dynamic = 'force-dynamic'

// Was a silent `.limit(500)`, and the "$X overdue" headline was summed from
// those 500 rows — so at a large association the headline undercounted with
// no sign it had. The table now pages; the headline has its own query over
// every overdue charge.
const PAGE_SIZE = 500

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

interface OverdueRow {
  amount: number
  unit_id: string | null
  payments: { amount: number }[]
}

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const assoc = await getPrimaryAssociation()
  if (!assoc) {
    return (
      <Page title="Dues" width="narrow">
        <EmptyState
          icon={<Wallet className="h-10 w-10" aria-hidden />}
          title="No HOA association configured"
          description="Set up an association before viewing dues."
        />
      </Page>
    )
  }

  const page = parsePageParam((await searchParams).page)
  const { from, to } = pageRange(page, PAGE_SIZE)

  // Compared as date strings, not Dates: `new Date('2026-08-09') < today`
  // is true from 00:00:01 onward, because `today` carries a time — so a
  // charge due TODAY counted as overdue here while the Who owes panel
  // directly below, which compares 'YYYY-MM-DD' strings, called it current.
  // Due today is not late; this is the boundary both now use.
  const todayIso = new Date().toISOString().slice(0, 10)

  const supabase = await getSupabaseServerClient()
  const [listResult, overdueResult] = await Promise.all([
    loadOrFail(
      'dues',
      supabase
        .from('assessments')
        .select(
          'id, amount, due_date, status, assessment_type, fiscal_period:fiscal_period_id(id, start_date, end_date), unit:unit_id(id, unit_number, address_line1), payments(amount)',
          { count: 'exact' },
        )
        .eq('association_id', assoc.id)
        .is('deleted_at', null)
        .order('due_date', { ascending: false })
        .range(from, to),
    ),
    // The headline's own query: the same predicate it always used (not
    // paid, not waived, due before today), over every row rather than the
    // first page.
    loadOrFail(
      'overdue dues total',
      supabase
        .from('assessments')
        .select('amount, unit_id, payments(amount)')
        .eq('association_id', assoc.id)
        .is('deleted_at', null)
        .neq('status', 'paid')
        .neq('status', 'waived')
        .lt('due_date', todayIso)
        // PostgREST's default row cap would quietly truncate the sum.
        .range(0, 49_999),
    ),
  ])

  const rows = listResult.ok ? ((listResult.data ?? []) as unknown as AssessmentRow[]) : []
  const total = listResult.ok ? (listResult.count ?? rows.length) : 0

  // Group by fiscal period start month so the page reads as a stack.
  const byPeriod = new Map<string, AssessmentRow[]>()
  for (const row of rows) {
    if (!row.fiscal_period) continue
    const key = row.fiscal_period.start_date.slice(0, 7)
    if (!byPeriod.has(key)) byPeriod.set(key, [])
    byPeriod.get(key)!.push(row)
  }
  const periods = Array.from(byPeriod.entries()).sort((a, b) => b[0].localeCompare(a[0]))

  // A period cut by a page boundary has only part of its charges on this
  // page, so its billed/paid figures are this page's only. Rows run newest
  // due date first: the previous page can only continue into the top
  // period, and the next page only out of the bottom one.
  const hasNextPage = from + rows.length < total
  const cutPeriods = new Set<string>()
  if (periods.length > 0) {
    if (page > 1) cutPeriods.add(periods[0][0])
    if (hasNextPage) cutPeriods.add(periods[periods.length - 1][0])
  }

  const today = new Date()
  const currentMonthLabel = format(today, 'MMM yyyy')

  const overdueRows = overdueResult.ok
    ? ((overdueResult.data ?? []) as unknown as OverdueRow[])
    : []
  const totalOverdue = overdueRows.reduce((sum, r) => {
    const paid = (r.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    return sum + Math.max(Number(r.amount) - paid, 0)
  }, 0)
  const overdueUnitCount = new Set(overdueRows.map((r) => r.unit_id)).size

  return (
    <Page
      title="Dues"
      description={
        !overdueResult.ok
          ? 'Couldn’t load the overdue total — refresh to try again.'
          : totalOverdue > 0
            ? `${currency(totalOverdue)} overdue across ${overdueUnitCount} ${overdueUnitCount === 1 ? 'unit' : 'units'}`
            : 'All caught up.'
      }
      actions={
        <>
          <Button asChild>
            <Link href="/dues/new">
              <Plus className="h-4 w-4" />
              Add due
            </Link>
          </Button>
          <MaterializeButton monthLabel={currentMonthLabel} />
        </>
      }
    >
      <WhoOwesPanel associationId={assoc.id} />

      {/* Never the raw error.message — this page used to render it, which is
          exactly what (dashboard)/error.tsx exists to prevent. */}
      {!listResult.ok ? (
        <LoadFailed what="dues" />
      ) : rows.length === 0 && total === 0 ? (
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
            <PeriodTable
              key={period}
              period={period}
              rows={periodRows}
              today={today}
              partial={cutPeriods.has(period)}
            />
          ))}
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            rowCount={rows.length}
            hrefFor={(p) => (p > 1 ? `/dues?page=${p}` : '/dues')}
            linkAs={Link}
            noun="assessments"
            className="rounded-xl border border-border bg-surface"
          />
        </div>
      )}
    </Page>
  )
}

function PeriodTable({
  period,
  rows,
  today,
  partial,
}: {
  period: string
  rows: AssessmentRow[]
  today: Date
  /** Some of this period's charges are on another page. */
  partial: boolean
}) {
  const totalDue = rows.reduce((sum, r) => sum + Number(r.amount), 0)
  const totalPaid = rows.reduce(
    (sum, r) => sum + (r.payments ?? []).reduce((s, p) => s + Number(p.amount), 0),
    0,
  )
  const remaining = Math.max(totalDue - totalPaid, 0)

  const [year, month] = period.split('-')
  const label = format(new Date(Number(year), Number(month) - 1, 1), 'MMMM yyyy')

  const columns: DataTableColumn<AssessmentRow>[] = [
    {
      key: 'unit',
      header: 'Unit',
      cell: (r) => (
        <>
          <p className="font-medium text-foreground">{r.unit?.address_line1 ?? 'Unknown unit'}</p>
          {r.unit?.unit_number ? (
            <p className="text-xs text-muted">Unit {r.unit.unit_number}</p>
          ) : null}
        </>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      className: 'text-xs text-muted',
      cell: (r) => r.assessment_type,
    },
    {
      key: 'due',
      header: 'Due',
      className: 'text-muted',
      cell: (r) => format(new Date(r.due_date), 'MMM d'),
    },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      cell: (r) => currency(Number(r.amount)),
    },
    {
      key: 'paid',
      header: 'Paid',
      numeric: true,
      className: 'text-muted',
      cell: (r) => {
        const paidAmount = paidOf(r)
        return paidAmount > 0 ? currency(paidAmount) : '—'
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <DuesStatus row={r} today={today} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (r) =>
        r.status !== 'paid' ? (
          <div className="flex items-center justify-end gap-1">
            <MarkPaidButton
              assessmentId={r.id}
              balance={Math.max(Number(r.amount) - paidOf(r), 0)}
            />
            <DeleteAssessmentButton assessmentId={r.id} />
          </div>
        ) : null,
    },
  ]

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted">
            {rows.length} {rows.length === 1 ? 'assessment' : 'assessments'} ·
            billed {currency(totalDue)} · paid {currency(totalPaid)}
            {partial ? ' · on this page only — the rest of this period is on another page' : ''}
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

      <DataTable
        framed={false}
        caption={`${label} assessments`}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
      />
    </Card>
  )
}

function paidOf(r: AssessmentRow): number {
  return (r.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
}

function DuesStatus({ row, today }: { row: AssessmentRow; today: Date }) {
  const isPaid = row.status === 'paid'
  const daysLate = isPaid ? 0 : Math.max(0, differenceInCalendarDays(today, new Date(row.due_date)))
  const isOverdue = !isPaid && daysLate > 0

  if (isPaid) {
    return <StatusBadge status="paid" tones={DUES_STATUS_TONES} labels={DUES_STATUS_LABELS} size="sm" />
  }
  if (row.status === 'partial') {
    return <StatusBadge status="partial" tones={DUES_STATUS_TONES} labels={DUES_STATUS_LABELS} size="sm" />
  }
  if (isOverdue) {
    return (
      <Badge variant="destructive" size="sm">
        {daysLate} days late
      </Badge>
    )
  }
  return <StatusBadge status="due" tones={DUES_STATUS_TONES} labels={DUES_STATUS_LABELS} size="sm" />
}
