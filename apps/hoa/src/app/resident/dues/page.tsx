import Link from 'next/link'
import { timed } from '@/lib/perf/timing'
import { AlertTriangle, CheckCircle2, CreditCard, FileText, Home, Send, Wallet } from 'lucide-react'
import { Badge, Button, LoadFailed, StatusPill } from '@homeowner-portal/ui'
import { getResidentDues, type ResidentCharge } from '@/lib/resident-dashboard'
import type { ResidentUnit } from '@/lib/resident'
import { chargeTypeLabel } from '@/lib/assessment-labels'
import { chargeDueText, nextDueText } from '@/lib/resident-due-text'
import { DuesTabs } from '@/components/resident/DuesTabs'
import { Hero, Panel, RowGroup, ScreenEmpty, ScreenHeader, Section, TappableRow } from '@/components/resident/screen'

export const metadata = { title: 'Dues' }
export const dynamic = 'force-dynamic'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default async function ResidentDuesPage() {
  const { units, dues, failed } = await timed('/resident/dues', 'resident.dues', () => getResidentDues())

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
  if (failed) {
    return (
      <div className="space-y-6">
        <ScreenHeader title="Dues" subtitle="Your balance and the homes it covers." />
        <DuesTabs current="balance" />
        <LoadFailed
          what="your dues"
          hint="Your balance is unknown right now — not zero. Try again in a minute."
        />
      </div>
    )
  }

  const overdue = dues.pastDueCount > 0
  const owes = dues.balance > 0

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <ScreenHeader title="Dues" subtitle="Your balance and the homes it covers." />
        <DuesTabs current="balance" />
      </div>

      {owes ? (
        <div className="space-y-3">
          <Hero
            tone={overdue ? 'danger' : 'warning'}
            eyebrow={overdue ? 'Balance past due' : 'Current balance'}
            value={usd.format(dues.balance)}
            footer={
              overdue
                ? `${dues.pastDueCount} past-due ${dues.pastDueCount === 1 ? 'charge' : 'charges'}`
                : dues.nextDueDate
                  ? nextDueText(dues.nextDueDate)
                  : `${dues.openCount} open ${dues.openCount === 1 ? 'charge' : 'charges'}`
            }
          />
          <Button asChild size="lg" className="w-full">
            <Link href="/resident/dues/pay">
              <Send aria-hidden />
              Pay {usd.format(dues.balance)}
            </Link>
          </Button>
        </div>
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
                today={dues.today}
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

      <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground">Need a statement?</p>
            <p className="text-sm text-muted">Every charge and payment, ready to print or save as a PDF.</p>
          </div>
        </div>
        <Button asChild variant="secondary" className="shrink-0">
          <Link href="/resident/dues/statement">View statement</Link>
        </Button>
      </Panel>
    </div>
  )
}

function unitLabel(units: ResidentUnit[], unitId: string): string | null {
  const unit = units.find((u) => u.unit_id === unitId)
  if (!unit) return null
  return unit.unit_number ?? unit.address ?? null
}

function ChargeRow({
  charge,
  today,
  unitLabel,
}: {
  charge: ResidentCharge
  today: string
  unitLabel: string | null
}) {
  const dueText = chargeDueText(charge, today)

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
