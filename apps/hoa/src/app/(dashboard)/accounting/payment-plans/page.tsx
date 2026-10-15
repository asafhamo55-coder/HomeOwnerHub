import Link from 'next/link'
import { HandCoins, Plus } from 'lucide-react'
import { Button, DataTable, EmptyState, LoadFailed, Page, type DataTableColumn } from '@homeowner-portal/ui'
import { getAccountingContext } from '@/lib/accounting/queries'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { formatDay, usd } from '@/lib/money/format'
import { PLAN_STATUS } from '@/lib/money/status'
import { AccountingTabs } from '../AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp, MoneyStatus } from '../_components/shared'

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

const COLUMNS: DataTableColumn<PlanRow>[] = [
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
]

export default async function PaymentPlansPage() {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Payment plans" what="payment plans" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Payment plans" />

  const supabase = await getSupabaseServerClient()
  // payment_plans is org-scoped — narrow to this association's units.
  const unitsRes = await loadOrFail('units', supabase.from('units').select('id').eq('association_id', ctx.associationId))
  const unitIds = unitsRes.ok ? (unitsRes.data ?? []).map((u) => u.id) : []
  const plansRes = !unitsRes.ok
    ? ({ ok: false } as const)
    : unitIds.length === 0
      ? ({ ok: true, data: [] as PlanRow[], count: 0 } as const)
      : await loadOrFail(
          'payment plans',
          supabase
            .from('payment_plans')
            .select('id, total_amount, installment_amount, installment_count, start_date, status, unit:unit_id(address_line1, unit_number)')
            .in('unit_id', unitIds)
            .order('start_date', { ascending: false }),
        )

  return (
    <Page
      title="Payment plans"
      description="Spread a balance an owner can’t pay at once into monthly installments. Each installment becomes its own charge on the owner’s account."
      tabs={<AccountingTabs />}
      actions={
        <Button asChild>
          <Link href="/accounting/payment-plans/new">
            <Plus aria-hidden />
            New plan
          </Link>
        </Button>
      }
    >
      {!plansRes.ok ? (
        <LoadFailed what="payment plans" />
      ) : (
        <DataTable
          caption="Payment plans"
          mobile="cards"
          columns={COLUMNS}
          rows={(plansRes.data ?? []) as unknown as PlanRow[]}
          rowKey={(p) => p.id}
          empty={
            <EmptyState
              variant="compact"
              icon={<HandCoins aria-hidden />}
              title="No payment plans"
              description="When an owner asks to pay a special assessment or a past-due balance over time, set the plan up here."
            />
          }
        />
      )}
    </Page>
  )
}
