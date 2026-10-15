import Link from 'next/link'
import { format, differenceInCalendarDays } from 'date-fns'
import { Wallet } from 'lucide-react'
import { Button, DataTable, EmptyState, LoadFailed, Page, StatusPill, type DataTableColumn } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ensureLeaseLedger } from '@/lib/rent'
import { loadOrFail } from '@/lib/load-or-fail'
import { MarkPaidButton } from './MarkPaidButton'

export const metadata = { title: 'Rent' }

interface LedgerRow {
  id: string
  period: string
  due_date: string
  amount_due: number
  amount_paid: number | null
  late_fee: number | null
  late_fee_rate: number | null
  status: string | null
  paid_date: string | null
}

interface Row extends LedgerRow {
  daysLate: number
  fee: number
  isPaid: boolean
}

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export default async function RentLedgerPage() {
  const supabase = await getSupabaseServerClient()

  const propRes = await loadOrFail(
    'your property',
    supabase
      .from('pm_properties')
      .select('id, address, monthly_rent')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  )
  if (!propRes.ok) {
    return (
      <Page width="default" title="Rent ledger">
        <LoadFailed what="your property" />
      </Page>
    )
  }
  const prop = propRes.data as { id: string; address: string; monthly_rent: number | null } | null

  if (!prop) {
    return (
      <Page width="default" title="Rent ledger">
        <EmptyState
          icon={<Wallet aria-hidden />}
          title="No property yet"
          description="Add a property first; rent records are generated from the lease."
          action={
            <Button asChild>
              <Link href="/setup">Add property</Link>
            </Button>
          }
        />
      </Page>
    )
  }

  // Backfill any missing months between lease_start and today before we
  // read the ledger. Idempotent — only inserts gaps.
  await ensureLeaseLedger(prop.id)

  // Every month of one lease: a few dozen rows at most, so no paging.
  const ledgerRes = await loadOrFail(
    'the rent ledger',
    supabase
      .from('pm_rent_ledger')
      .select('id, period, due_date, amount_due, amount_paid, late_fee, late_fee_rate, status, paid_date')
      .eq('property_id', prop.id)
      .order('due_date', { ascending: false }),
  )

  const today = new Date()
  const rows: Row[] = ledgerRes.ok
    ? ((ledgerRes.data ?? []) as LedgerRow[]).map((r) => {
        const isPaid = r.status === 'paid'
        const daysLate = isPaid ? 0 : Math.max(0, differenceInCalendarDays(today, new Date(r.due_date)))
        const fee =
          r.late_fee ?? (daysLate > 0 && r.late_fee_rate ? Math.round((r.amount_due * r.late_fee_rate) / 100) : 0)
        return { ...r, isPaid, daysLate, fee }
      })
    : []

  const outstanding = rows.filter((r) => !r.isPaid && r.daysLate > 0).reduce((s, r) => s + r.amount_due + r.fee, 0)

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'period',
      header: 'Period',
      mobilePrimary: true,
      cell: (r) => <span className="font-medium text-foreground">{format(new Date(r.due_date), 'MMMM yyyy')}</span>,
    },
    { key: 'due', header: 'Due', cell: (r) => format(new Date(r.due_date), 'MMM d, yyyy'), hideOnMobile: true },
    { key: 'amount', header: 'Rent', numeric: true, cell: (r) => currency(r.amount_due) },
    {
      key: 'fee',
      header: 'Late fee',
      numeric: true,
      cell: (r) => (r.fee > 0 ? <span className="text-danger">+ {currency(r.fee)}</span> : <span className="text-muted">—</span>),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) =>
        r.isPaid ? (
          <StatusPill tone="success" label={r.paid_date ? `Paid ${format(new Date(r.paid_date), 'MMM d')}` : 'Paid'} />
        ) : r.daysLate > 0 ? (
          <StatusPill tone="danger" label={`${r.daysLate} ${r.daysLate === 1 ? 'day' : 'days'} late`} />
        ) : (
          <StatusPill tone="neutral" label="Not due yet" />
        ),
    },
    {
      key: 'action',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (r) => (!r.isPaid ? <MarkPaidButton ledgerId={r.id} amountDue={r.amount_due + r.fee} /> : null),
    },
  ]

  return (
    <Page
      width="default"
      title="Rent ledger"
      description={prop.address}
      meta={outstanding > 0 ? <StatusPill tone="danger" label={`${currency(outstanding)} overdue`} /> : null}
    >
      {!ledgerRes.ok ? (
        <LoadFailed what="the rent ledger" />
      ) : (
        <DataTable
          caption="Rent ledger by month"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          mobile="cards"
          empty={
            <EmptyState
              variant="compact"
              icon={<Wallet aria-hidden />}
              title="No rent records yet"
              description="This month's row is created from the lease start date. Check back on the 1st."
            />
          }
        />
      )}
    </Page>
  )
}
