import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { Button, Card, CardContent, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { getAccountingContext } from '@/lib/accounting/queries'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { AccountingLoadFailed, AccountingNotSetUp, accountingCrumbs } from '../../_components/shared'
import { NewPlanForm } from './NewPlanForm'

export const metadata = { title: 'New Payment Plan' }

export default async function NewPlanPage() {
  const crumbs = accountingCrumbs(['Payment plans', '/accounting/payment-plans'], ['New plan'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="New payment plan" what="the plan form" breadcrumbs={crumbs} width="narrow" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="New payment plan" tabs={false} />

  const supabase = await getSupabaseServerClient()
  const units = await loadOrFail(
    'units',
    supabase.from('units').select('id, address_line1, unit_number').eq('association_id', ctx.associationId).order('address_line1'),
  )
  const options = units.ok
    ? (units.data ?? []).map((u) => ({ id: u.id, label: (u.address_line1 ?? 'Unit') + (u.unit_number ? ` · #${u.unit_number}` : '') }))
    : []

  return (
    <Page
      width="narrow"
      linkAs={Link}
      breadcrumbs={crumbs}
      title="New payment plan"
      description="Creates one charge per installment, due monthly from the start date. Each posts to the ledger when it is created."
    >
      {!units.ok ? (
        <LoadFailed what="properties" />
      ) : options.length === 0 ? (
        <EmptyState
          icon={<Building2 aria-hidden />}
          title="No properties on file"
          description="A plan is set up for a property. Add your properties first."
          action={
            <Button asChild>
              <Link href="/properties">Go to properties</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <NewPlanForm units={options} />
          </CardContent>
        </Card>
      )}
    </Page>
  )
}
