import Link from 'next/link'
import { ChevronLeft, HandCoins } from 'lucide-react'
import { Card, EmptyState } from '@homeowner-portal/ui'
import { getAccountingContext } from '@/lib/accounting/queries'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { NewPlanForm } from './NewPlanForm'

export const metadata = { title: 'New Payment Plan' }

export default async function NewPlanPage() {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<HandCoins className="h-10 w-10" aria-hidden />}
          title="No data"
          description="Run pnpm seed:accounting first."
        />
      </div>
    )
  }

  const supabase = await getSupabaseServerClient()
  const { data: units } = await supabase
    .from('units')
    .select('id, address_line1, unit_number')
    .eq('association_id', ctx.associationId)
    .order('address_line1')

  const options = (units ?? []).map((u) => ({
    id: u.id,
    label:
      (u.address_line1 ?? 'Unit') +
      (u.unit_number ? ` · #${u.unit_number}` : ''),
  }))

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/accounting/payment-plans"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Payment Plans
        </Link>
        <h1 className="text-2xl font-bold text-foreground">New Payment Plan</h1>
        <p className="text-sm text-muted">
          Generates one assessment per installment, scheduled monthly from the
          start date. Each installment posts its own JE.
        </p>
      </header>

      {options.length === 0 ? (
        <EmptyState
          icon={<HandCoins className="h-10 w-10" aria-hidden />}
          title="No units on file"
          description="Add a unit before setting up a payment plan."
        />
      ) : (
        <Card>
          <div className="p-6">
            <NewPlanForm units={options} />
          </div>
        </Card>
      )}
    </div>
  )
}
