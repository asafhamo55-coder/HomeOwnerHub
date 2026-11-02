import { notFound } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { LoadFailed } from '@homeowner-portal/ui'
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { getResidentActor } from '@/lib/impersonation'
import { getResidentUnits } from '@/lib/resident'
import { AutopayForm } from '@/components/resident/AutopayForm'
import { Panel, ScreenEmpty, ScreenHeader } from '@/components/resident/screen'
import { suggestedMaxCents } from '@/lib/online-payments/autopay'

export const metadata = { title: 'Autopay' }
export const dynamic = 'force-dynamic'

const BACK = { href: '/resident/dues', label: 'Dues' }

// BL-036. Dark behind M8_APPLIED (a 404 until the owner applies migration 0073).
// Reads go through the resident's own client, so RLS shows only their own rows.
export default async function ResidentAutopayPage() {
  if (!M8_APPLIED) notFound()
  const [actor, units] = await Promise.all([getResidentActor(), getResidentUnits()])
  const unit = units[0]
  if (!unit) {
    return (
      <div className="space-y-6">
        <ScreenHeader title="Pay my dues automatically" back={BACK} />
        <ScreenEmpty icon={<Wallet />} title="No home linked yet" description="Once your board links your account to a home, you can set up autopay here." />
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = actor.client as any
  const [methodsRes, enrollRes, dueRes] = await Promise.all([
    db
      .from('online_payment_methods')
      .select('id, method_type, brand, last4')
      .eq('user_id', actor.id)
      .eq('association_id', unit.association_id)
      .eq('is_active', true),
    db
      .from('autopay_enrollments')
      .select('id, max_cents, include_other_charges, status, payment_method_id')
      .eq('user_id', actor.id)
      .eq('unit_id', unit.unit_id)
      .in('status', ['active', 'paused'])
      .maybeSingle(),
    db
      .from('assessments')
      .select('amount')
      .eq('unit_id', unit.unit_id)
      .eq('assessment_type', 'regular')
      .is('deleted_at', null)
      .order('due_date', { ascending: false })
      .range(0, 0),
  ])
  if (methodsRes.error || enrollRes.error) {
    return (
      <div className="space-y-6">
        <ScreenHeader title="Pay my dues automatically" back={BACK} />
        <LoadFailed what="your autopay" hint="Nothing was changed. Try again in a minute." />
      </div>
    )
  }
  type M = { id: string; method_type: 'ach' | 'card'; brand: string | null; last4: string | null }
  const label = (m: M) =>
    `${m.method_type === 'ach' ? 'bank account' : (m.brand ?? 'card')}${m.last4 ? ` ending ${m.last4}` : ''}`
  const methods = ((methodsRes.data ?? []) as M[]).map((m) => ({ id: m.id, label: label(m) }))
  const e = enrollRes.data as { id: string; max_cents: number; include_other_charges: boolean; status: string; payment_method_id: string } | null
  const regularCents = Math.round(Number(((dueRes.data ?? [])[0] as { amount: number } | undefined)?.amount ?? 0) * 100)

  return (
    <div className="space-y-6">
      <ScreenHeader title="Pay my dues automatically" back={BACK} />
      <Panel>
        <AutopayForm
          unitId={unit.unit_id}
          methods={methods}
          suggestedMaxCents={suggestedMaxCents(regularCents)}
          existing={
            e
              ? {
                  id: e.id,
                  maxCents: e.max_cents,
                  includeOther: e.include_other_charges,
                  paused: e.status === 'paused',
                  methodLabel: methods.find((m) => m.id === e.payment_method_id)?.label ?? 'saved payment method',
                }
              : null
          }
        />
      </Panel>
    </div>
  )
}
