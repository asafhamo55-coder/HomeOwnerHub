import Link from 'next/link'
import { CheckCircle2, Landmark, ShieldCheck, Wallet } from 'lucide-react'
import { Button, LoadFailed } from '@homeowner-portal/ui'
import { getResidentDues } from '@/lib/resident-dashboard'
import { getResidentZelleSettings } from '@/lib/pay-settings'
import { payLinesFor, type ZelleReadResult } from '@/lib/pay-by-zelle'
import type { ResidentUnit } from '@/lib/resident'
import { ZellePayInstructions } from '@/components/resident/ZellePayInstructions'
import { Hero, Panel, ScreenEmpty, ScreenHeader, Section } from '@/components/resident/screen'
import { TrackOnMount } from '@/components/analytics/ProductAnalytics'

export const metadata = { title: 'Pay dues' }
export const dynamic = 'force-dynamic'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const BACK = { href: '/resident/dues', label: 'Dues' }

// Pay-by-Zelle (ADR-005, backlog BL-006). Nothing here moves money or posts
// anything: the resident sends from their own bank, W18 matches the deposit
// by memo code + amount, and a board member approves the posting.

export default async function ResidentPayPage() {
  const { units, dues, failed } = await getResidentDues()

  if (units.length === 0) {
    return (
      <div className="space-y-6">
        <ScreenHeader title="Pay dues" back={BACK} />
        <ScreenEmpty
          icon={<Wallet />}
          title="No home linked yet"
          description="Once your board links your account to a home, you can pay its dues here."
        />
      </div>
    )
  }

  if (failed) {
    return (
      <div className="space-y-6">
        <ScreenHeader title="Pay dues" back={BACK} />
        <LoadFailed what="your balance" hint="We can’t show what to pay until it loads. Try again in a minute." />
      </div>
    )
  }

  if (dues.balance <= 0 || dues.charges.length === 0) {
    return (
      <div className="space-y-6">
        <ScreenHeader title="Pay dues" back={BACK} />
        <Hero
          tone="success"
          icon={<CheckCircle2 />}
          title="Nothing to pay right now"
          description="You have no open charges. New charges show up on your Dues screen."
        />
      </div>
    )
  }

  // One association in practice; group defensively for owners whose homes
  // sit in different associations of the same org.
  const assocOf = new Map(units.map((u) => [u.unit_id, u.association_id]))
  const groups = new Map<string, typeof dues.charges>()
  for (const c of dues.charges) {
    const key = assocOf.get(c.unitId) ?? ''
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  const settings = await getResidentZelleSettings([...groups.keys()].filter(Boolean))
  const multiUnit = units.length > 1
  const anyConfigured =
    settings.ok && Object.values(settings.byAssociation).some((r) => r.state === 'configured')

  return (
    <div className="space-y-8">
      {/* BL-009 "pay sheet opened": one boolean, no amount, no unit. */}
      <TrackOnMount event="resident.pay_opened" props={{ zelleConfigured: anyConfigured }} />
      <ScreenHeader
        title="Pay dues"
        back={BACK}
        subtitle={anyConfigured ? 'Pay with Zelle from your bank’s app.' : undefined}
      />

      <Hero
        tone={dues.pastDueCount > 0 ? 'danger' : 'warning'}
        eyebrow="Amount due"
        value={usd.format(dues.balance)}
        footer={`${dues.openCount} open ${dues.openCount === 1 ? 'charge' : 'charges'}`}
      />

      {!settings.ok ? (
        <LoadFailed what="your board’s payment details" hint="Try again in a minute. Your balance above is correct." />
      ) : (
        [...groups.entries()].map(([assocId, charges]) => {
          const read: ZelleReadResult = settings.byAssociation[assocId] ?? { state: 'not_configured' }
          const assocName = units.find((u) => u.association_id === assocId)?.association_name ?? null
          return (
            <Section
              key={assocId || 'none'}
              label={groups.size > 1 && assocName ? `Pay ${assocName}` : 'Send with Zelle'}
            >
              {read.state === 'configured' ? (
                <ZellePayInstructions
                  recipient={read.settings.recipient}
                  recipientName={read.settings.recipientName}
                  instructions={read.settings.instructions}
                  lines={payLinesFor(charges)}
                  unitLabelFor={
                    multiUnit
                      ? (id) => unitLabel(units, charges.find((c) => c.id === id)?.unitId ?? null)
                      : undefined
                  }
                />
              ) : (
                <NotSetUp />
              )}
            </Section>
          )
        })
      )}

      {anyConfigured ? (
        <Section label="How your payment is matched">
          <Panel>
            <ul className="space-y-3">
              <HowItem icon={<Landmark />}>
                Your bank sends the memo code along with the payment. When it reaches your association’s bank account,
                we match the code and amount to your charge.
              </HowItem>
              <HowItem icon={<ShieldCheck />}>
                A board member approves every match before it’s posted. Your balance updates after that — usually
                within a few business days.
              </HowItem>
              <HowItem icon={<CheckCircle2 />}>
                Forgot the memo, or sent a different amount? The payment still arrives; your board matches it by
                hand, which can take longer.
              </HowItem>
            </ul>
          </Panel>
        </Section>
      ) : null}
    </div>
  )
}

function NotSetUp() {
  return (
    <ScreenEmpty
      icon={<Wallet />}
      tone="slate"
      title="Online payments aren’t set up yet"
      description="Your board hasn’t added its Zelle details yet. Contact your board to pay — or ask them to turn on Pay by Zelle in their settings."
      action={
        <Button asChild variant="secondary">
          <Link href="/resident/tickets/new">Message your board</Link>
        </Button>
      }
    />
  )
}

function HowItem({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-muted [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <p className="text-sm text-foreground-secondary">{children}</p>
    </li>
  )
}

function unitLabel(units: ResidentUnit[], unitId: string | null): string | null {
  const unit = units.find((u) => u.unit_id === unitId)
  return unit ? unit.unit_number ?? unit.address ?? null : null
}
