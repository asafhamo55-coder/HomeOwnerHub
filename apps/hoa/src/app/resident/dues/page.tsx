import { differenceInCalendarDays, format } from 'date-fns'
import { AlertTriangle, CheckCircle2, CreditCard, Home, Info, Wallet } from 'lucide-react'
import { Badge, LoadFailed, StatusPill } from '@homeowner-portal/ui'
import { getResidentDashboard, type ResidentCharge } from '@/lib/resident-dashboard'
import type { ResidentUnit } from '@/lib/resident'
import { chargeTypeLabel } from '@/lib/assessment-labels'
import { Hero, Panel, RowGroup, ScreenEmpty, ScreenHeader, Section, TappableRow } from '@/components/resident/screen'

export const metadata = { title: 'Dues' }
export const dynamic = 'force-dynamic'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default async function ResidentDuesPage() {
  const { units, dues, failed } = await getResidentDashboard()

  if (units.length === 0) {
    return (
      <div className="space-y-6">
        <ScreenHeader title="Dues" />
        <ScreenEmpty
          icon={<Wallet />}
          title="No home linked yet"
          description="Once your community manager links you to a unit, your dues and charges will appear here."
        />
      </div>
    )
  }

  // A failed read would otherwise fall through to "You're all paid up".
  if (failed.dues) {
    return (
      <div className="space-y-6">
        <ScreenHeader title="Dues" subtitle="Your balance and the homes it covers." />
        <LoadFailed
          what="your dues"
          hint="Your balance is unknown right now — not zero. For a statement, contact your community manager."
        />
      </div>
    )
  }

  const overdue = dues.pastDueCount > 0
  const owes = dues.balance > 0

  return (
    <div className="space-y-8">
      <ScreenHeader title="Dues" subtitle="Your balance and the homes it covers." />

      {owes ? (
        <Hero
          tone={overdue ? 'danger' : 'warning'}
          eyebrow={overdue ? 'Balance past due' : 'Current balance'}
          value={usd.format(dues.balance)}
          footer={
            overdue
              ? `${dues.pastDueCount} past-due ${dues.pastDueCount === 1 ? 'charge' : 'charges'}`
              : dues.nextDueDate
                ? `Next due ${format(new Date(dues.nextDueDate), 'PP')}`
                : `${dues.openCount} open ${dues.openCount === 1 ? 'charge' : 'charges'}`
          }
        />
      ) : (
        <Hero
          tone="success"
          icon={<CheckCircle2 />}
          title="You’re all paid up"
          description="No outstanding charges on your account."
        />
      )}

      {dues.charges.length > 0 ? (
        <Section label={overdue ? 'Open charges · past due first' : 'Open charges'}>
          <RowGroup>
            {dues.charges.map((charge) => (
              <ChargeRow
                key={charge.id}
                charge={charge}
                unitLabel={units.length > 1 ? unitLabel(units, charge.unitId) : null}
              />
            ))}
          </RowGroup>
        </Section>
      ) : null}

      <Section label={units.length === 1 ? 'Your home' : 'Your homes'}>
        <RowGroup>
          {units.map((u) => (
            <TappableRow
              key={u.unit_id}
              icon={<Home />}
              tone="slate"
              title={u.unit_number ?? u.address ?? 'Your unit'}
              subtitle={u.unit_number && u.address ? u.address : u.association_name ?? undefined}
              trailing={
                u.association_name && units.length > 1 ? (
                  <Badge variant="neutral" size="sm">
                    {u.association_name}
                  </Badge>
                ) : null
              }
            />
          ))}
        </RowGroup>
      </Section>

      <Panel className="flex items-start gap-3 bg-subtle">
        <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <p className="text-sm text-foreground-secondary">
          For a detailed statement or to make a payment, contact your community manager.
        </p>
      </Panel>
    </div>
  )
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
      icon={charge.pastDue ? <AlertTriangle /> : <CreditCard />}
      tone={charge.pastDue ? 'rose' : 'slate'}
      title={chargeTypeLabel(charge.assessmentType)}
      subtitle={unitLabel ? `${unitLabel} · ${dueText}` : dueText}
      trailing={
        <span className="flex flex-col items-end gap-1">
          <span className="num text-sm font-semibold text-foreground">{usd.format(charge.amount)}</span>
          {charge.pastDue ? <StatusPill tone="danger" label="Past due" /> : null}
        </span>
      }
    />
  )
}
