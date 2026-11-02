import { notFound } from 'next/navigation'
import { LoadFailed } from '@homeowner-portal/ui'
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { getResidentActor } from '@/lib/impersonation'
import { isExpired, methodExpiry, methodLabel, type StoredMethod } from '@/lib/online-payments/saved-methods'
import { SavedMethodsList, type MethodView } from '@/components/resident/SavedMethodsList'
import { Panel, ScreenHeader } from '@/components/resident/screen'

export const metadata = { title: 'Payment methods' }
export const dynamic = 'force-dynamic'

const BACK = { href: '/resident/dues', label: 'Dues' }

// Saved cards and bank accounts (BL-035 PR 7). Dark until M8_APPLIED flips.
// Read through the resident's own client: RLS returns only their own rows
// (not even the board can see them). Only Stripe ids, brand, last4 and expiry
// are stored; no card or bank number exists here.
export default async function ResidentPaymentMethodsPage() {
  if (!M8_APPLIED) notFound()

  const actor = await getResidentActor()
  if (!actor.id) notFound()

  type Q = { eq(c: string, v: unknown): Q; order(c: string, o?: { ascending: boolean }): PromiseLike<{ data: unknown; error: unknown }> }
  const { data, error } = await (
    actor.client.from('online_payment_methods' as never).select('*') as unknown as Q
  )
    .eq('user_id', actor.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) {
    return (
      <div className="space-y-6">
        <ScreenHeader title="Payment methods" back={BACK} />
        <LoadFailed what="your payment methods" hint="Nothing was changed. Try again in a minute." />
      </div>
    )
  }

  const now = new Date()
  const methods: MethodView[] = ((data as StoredMethod[] | null) ?? []).map((m) => ({
    id: m.id,
    label: methodLabel(m),
    expiry: methodExpiry(m),
    expired: isExpired(m, now),
    isDefault: m.is_default,
  }))

  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Payment methods"
        back={BACK}
        subtitle="Cards and bank accounts you saved for paying dues. We never see your full card or account number."
      />
      <Panel>
        <SavedMethodsList methods={methods} returnUrl={`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/resident/dues/methods`} />
      </Panel>
    </div>
  )
}
