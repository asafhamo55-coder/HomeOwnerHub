import { differenceInCalendarDays, format } from 'date-fns'
import { AlertTriangle, CheckCircle2, CreditCard, Home, Wallet } from 'lucide-react'
import { Badge } from '@homeowner-portal/ui'
import { getResidentDashboard, type ResidentCharge } from '@/lib/resident-dashboard'
import type { ResidentUnit } from '@/lib/resident'
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

      {/* Every outstanding charge, most urgent first */}
      {dues.charges.length > 0 ? (
        <section className="space-y-2.5">
          <SectionLabel>
            {overdue ? 'Charges — past due first' : 'Open charges'}
          </SectionLabel>
          {dues.charges.map((charge) => (
            <ChargeRow
              key={charge.id}
              charge={charge}
              unitLabel={units.length > 1 ? unitLabel(units, charge.unitId) : null}
            />
          ))}
        </section>
      ) : null}

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

// Friendly names for the assessment_type enum (regular | special |
// late_fee | fine). Unknown types fall back to a humanized slug.
const CHARGE_TYPE_LABELS: Record<string, string> = {
  regular: 'Regular dues',
  special: 'Special assessment',
  late_fee: 'Late fee',
  fine: 'Fine',
}

function chargeTypeLabel(type: string): string {
  return CHARGE_TYPE_LABELS[type] ?? type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

function unitLabel(units: ResidentUnit[], unitId: string): string | null {
  const unit = units.find((u) => u.unit_id === unitId)
  if (!unit) return null
  return unit.unit_number ?? unit.address ?? null
}

function ChargeRow({ charge, unitLabel }: { charge: ResidentCharge; unitLabel: string | null }) {
  const daysLate = charge.pastDue ? differenceInCalendarDays(new Date(), new Date(charge.dueDate)) : 0
  const dueText = charge.pastDue
    ? daysLate > 0
      ? `Due ${format(new Date(charge.dueDate), 'PP')} · ${daysLate} ${daysLate === 1 ? 'day' : 'days'} late`
      : `Due ${format(new Date(charge.dueDate), 'PP')} · due today`
    : `Due ${format(new Date(charge.dueDate), 'PP')}`

  return (
    <TappableRow
      icon={charge.pastDue ? <AlertTriangle className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
      tone={charge.pastDue ? 'rose' : 'amber'}
      title={chargeTypeLabel(charge.assessmentType)}
      subtitle={unitLabel ? `${unitLabel} · ${dueText}` : dueText}
      trailing={
        <div className="flex flex-col items-end gap-1">
          <span className="text-[15px] font-semibold text-foreground">
            {usd.format(charge.amount)}
          </span>
          {charge.pastDue ? (
            <Badge variant="destructive" size="sm">
              Past due
            </Badge>
          ) : null}
        </div>
      }
    />
  )
}
