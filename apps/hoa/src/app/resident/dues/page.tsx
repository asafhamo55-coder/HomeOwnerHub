import { format } from 'date-fns'
import { CheckCircle2, CreditCard, Home, Wallet } from 'lucide-react'
import { Badge } from '@homeowner-portal/ui'
import { getResidentDashboard } from '@/lib/resident-dashboard'
import { IconTile, Panel, ScreenHeader, SectionLabel, TappableRow } from '@/components/resident/screen'

export const metadata = { title: 'Dues' }
export const dynamic = 'force-dynamic'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default async function ResidentDuesPage() {
  const { units, dues } = await getResidentDashboard()

  if (units.length === 0) {
    return (
      <div className="space-y-7">
        <ScreenHeader title="Dues" />
        <Panel className="flex flex-col items-center gap-3 py-10 text-center">
          <IconTile icon={<Wallet className="h-6 w-6" />} className="h-14 w-14" />
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">No home linked yet</p>
            <p className="mx-auto max-w-sm text-sm text-muted">
              Once your community manager links you to a unit, your dues and payment history will
              appear here.
            </p>
          </div>
        </Panel>
      </div>
    )
  }

  const overdue = dues.pastDueCount > 0
  const owes = dues.balance > 0

  return (
    <div className="space-y-7">
      <ScreenHeader title="Dues" subtitle="Your balance and the homes it covers." />

      {/* Balance hero */}
      {owes ? (
        <div
          className={
            overdue
              ? 'rounded-3xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-500/25 dark:bg-rose-500/10'
              : 'rounded-3xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/25 dark:bg-amber-500/10'
          }
        >
          <p className="text-sm font-medium text-muted">Current balance</p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-foreground">
            {usd.format(dues.balance)}
          </p>
          <p className="mt-2 text-sm font-medium text-foreground/80">
            {overdue
              ? `${dues.pastDueCount} past-due ${dues.pastDueCount === 1 ? 'charge' : 'charges'}`
              : dues.nextDueDate
                ? `Next due ${format(new Date(dues.nextDueDate), 'PP')}`
                : `${dues.openCount} open ${dues.openCount === 1 ? 'charge' : 'charges'}`}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3.5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/25 dark:bg-emerald-500/10">
          <IconTile icon={<CheckCircle2 className="h-6 w-6" />} tone="emerald" className="h-12 w-12" />
          <div>
            <p className="text-base font-semibold text-foreground">You&apos;re all paid up</p>
            <p className="text-sm text-muted">No outstanding assessments on your account.</p>
          </div>
        </div>
      )}

      {/* Homes the dues cover */}
      <section className="space-y-2.5">
        <SectionLabel>{units.length === 1 ? 'Your home' : 'Your homes'}</SectionLabel>
        {units.map((u) => (
          <TappableRow
            key={u.unit_id}
            icon={<Home className="h-5 w-5" />}
            tone="slate"
            title={u.unit_number ?? u.address ?? 'Your unit'}
            subtitle={u.unit_number && u.address ? u.address : u.association_name ?? undefined}
            trailing={
              u.association_name ? (
                <Badge variant="outline" size="sm">
                  {u.association_name}
                </Badge>
              ) : null
            }
          />
        ))}
      </section>

      <p className="flex items-center gap-2 px-1 text-[13px] text-muted">
        <CreditCard className="h-4 w-4 shrink-0" aria-hidden />
        For a detailed statement or to make a payment, contact your community manager.
      </p>
    </div>
  )
}
