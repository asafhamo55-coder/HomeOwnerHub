import Link from 'next/link'
import { HandCoins, Plus } from 'lucide-react'
import { Button, DataTable, EmptyState, LoadFailed, Page, type DataTableColumn } from '@homeowner-portal/ui'
import { getAccountingContext, loadPaymentPlans, type PaymentPlanRow } from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDay, usd } from '@/lib/money/format'
import { PLAN_STATUS } from '@/lib/money/status'
import { AccountingTabs } from '../AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp, MoneyStatus } from '../_components/shared'

export const metadata = { title: 'Payment Plans' }
export const dynamic = 'force-dynamic'

const COLUMNS: DataTableColumn<PaymentPlanRow>[] = [
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

  const plansRes = await tryLoad('payment plans', () => loadPaymentPlans(ctx.associationId))

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
          rows={plansRes.data}
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
