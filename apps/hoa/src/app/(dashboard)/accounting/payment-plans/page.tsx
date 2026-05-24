import Link from 'next/link'
import { ChevronLeft, HandCoins, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Button, Card, EmptyState } from '@homeowner-portal/ui'
import { getAccountingContext } from '@/lib/accounting/queries'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Payment Plans' }
export const dynamic = 'force-dynamic'

interface PlanRow {
  id: string
  total_amount: number
  installment_amount: number
  installment_count: number
  start_date: string
  status: string
  unit: { address_line1: string | null; unit_number: string | null } | null
}

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export default async function PaymentPlansPage() {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<HandCoins className="h-10 w-10" aria-hidden />}
          title="Payment plans aren't available yet"
          description="This area is empty. Contact support to set up accounting for your association."
        />
      </div>
    )
  }

  const supabase = await getSupabaseServerClient()
  // payment_plans is org-scoped — narrow to this association's units.
  const { data: units } = await supabase
    .from('units')
    .select('id')
    .eq('association_id', ctx.associationId)
  const unitIds = (units ?? []).map((u) => u.id)

  const plansPromise =
    unitIds.length > 0
      ? supabase
          .from('payment_plans')
          .select(
            'id, total_amount, installment_amount, installment_count, start_date, status, unit:unit_id(address_line1, unit_number)',
          )
          .in('unit_id', unitIds)
          .order('start_date', { ascending: false })
      : Promise.resolve({ data: [] as PlanRow[] })

  const { data } = await plansPromise
  const plans = (data ?? []) as unknown as PlanRow[]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/accounting"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Accounting
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1>Payment Plans</h1>
          <Button asChild>
            <Link href="/accounting/payment-plans/new">
              <Plus className="h-4 w-4" />
              New plan
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted">
          Convert a balance into monthly installments. Each installment posts
          its own Dr AR / Cr Assessment Income entry.
        </p>
      </header>

      {plans.length === 0 ? (
        <EmptyState
          icon={<HandCoins className="h-10 w-10" aria-hidden />}
          title="No plans on file"
          description="Set up the first payment plan when a homeowner can't pay a special assessment up front."
          action={
            <Button asChild>
              <Link href="/accounting/payment-plans/new">
                <Plus className="h-4 w-4" />
                Create first plan
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Unit</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Starts</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <p className="text-foreground">{p.unit?.address_line1 ?? '—'}</p>
                    {p.unit?.unit_number ? (
                      <p className="text-xs text-muted">Unit {p.unit.unit_number}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {p.installment_count} × {currency(Number(p.installment_amount))} / month
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {format(new Date(p.start_date), 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-foreground">
                    {currency(Number(p.total_amount))}
                  </td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={
                        p.status === 'completed'
                          ? 'success'
                          : p.status === 'defaulted'
                            ? 'destructive'
                            : p.status === 'active'
                              ? 'warning'
                              : 'outline'
                      }
                      size="sm"
                    >
                      {p.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
