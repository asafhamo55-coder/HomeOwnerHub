import Link from 'next/link'
import { format, differenceInCalendarDays } from 'date-fns'
import { Wallet } from 'lucide-react'
import { Badge, Card, EmptyState, Button } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ensureLeaseLedger } from '@/lib/rent'
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

interface PropertyRow {
  address: string
  monthly_rent: number | null
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

  const { data: prop } = await supabase
    .from('pm_properties')
    .select('id, address, monthly_rent')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Backfill any missing months between lease_start and today before
  // we read the ledger. Idempotent — only inserts gaps.
  if (prop?.id) {
    await ensureLeaseLedger(prop.id as string)
  }

  if (!prop) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-muted">Rent</h1>
        </header>
        <EmptyState
          icon={<Wallet className="h-10 w-10" aria-hidden />}
          title="No property yet"
          description="Add a property first; rent records auto-generate from the lease."
          action={
            <Button asChild>
              <Link href="/setup">Add property</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const property = prop as unknown as PropertyRow & { id: string }

  const { data } = await supabase
    .from('pm_rent_ledger')
    .select('id, period, due_date, amount_due, amount_paid, late_fee, late_fee_rate, status, paid_date')
    .eq('property_id', property.id)
    .order('due_date', { ascending: false })

  const rows = (data ?? []) as LedgerRow[]
  const today = new Date()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-muted">Rent ledger</h1>
        <p className="text-sm text-muted-fg">{property.address}</p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-10 w-10" aria-hidden />}
          title="No rent records yet"
          description="Visit the dashboard once to materialize this month's row, or wait until the 1st of next month."
          action={
            <Button asChild variant="outline">
              <Link href="/">Go to dashboard</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wide text-muted-fg">
                <tr>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Late fee</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const due = new Date(r.due_date)
                  const isPaid = r.status === 'paid'
                  const daysLate = isPaid ? 0 : Math.max(0, differenceInCalendarDays(today, due))
                  const computedFee =
                    r.late_fee ??
                    (daysLate > 0 && r.late_fee_rate
                      ? Math.round((r.amount_due * r.late_fee_rate) / 100)
                      : 0)
                  const isOverdue = !isPaid && daysLate > 0

                  return (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-muted">
                        {format(due, 'MMM yyyy')}
                      </td>
                      <td className="px-4 py-3 text-muted-fg">
                        {format(due, 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-muted">{currency(r.amount_due)}</td>
                      <td className="px-4 py-3">
                        {computedFee > 0 ? (
                          <span className="text-destructive">+ {currency(computedFee)}</span>
                        ) : (
                          <span className="text-muted-fg">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isPaid ? (
                          <Badge variant="success" size="sm">
                            paid
                            {r.paid_date ? ` · ${format(new Date(r.paid_date), 'MMM d')}` : ''}
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
                      <td className="px-4 py-3 text-right">
                        {!isPaid ? (
                          <MarkPaidButton ledgerId={r.id} amountDue={r.amount_due + computedFee} />
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
