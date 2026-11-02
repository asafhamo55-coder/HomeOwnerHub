import Link from 'next/link'
import { notFound } from 'next/navigation'
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { AssociationNotSetUp } from '../../_components/AssociationNotSetUp'
import { adminDb, getAccountForAssociation } from '@/lib/payments/connect-store'
import { cardFeeAllowedInState, onboardingStatus } from '@/lib/payments/connect-account'
import { OnlinePaymentsPanel } from './OnlinePaymentsPanel'

export const metadata = { title: 'Online payments' }
export const dynamic = 'force-dynamic'

// Stripe Connect onboarding, status and fee choices (BL-035). Dark until M8.
export default async function OnlinePaymentsSettingsPage() {
  if (!M8_APPLIED) notFound()
  const { role, org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('associations')
    .select('id, name, state')
    .eq('organization_id', org.id)
    .order('name', { ascending: true })
    .range(0, 0)

  const page = (body: React.ReactNode) => (
    <Page
      width="narrow"
      title="Online payments"
      description="Let residents pay dues by bank transfer or card. The money goes straight to your association’s bank account."
      tabs={<SettingsTabs current="/settings/online-payments" role={role} />}
      linkAs={Link}
    >
      {body}
    </Page>
  )

  if (error) return page(<LoadFailed what="your online payment settings" />)
  const assoc = data?.[0]
  if (!assoc) return page(<AssociationNotSetUp needFor="Online payments attach to your association, and this HOA doesn’t have one yet." returnTo="/settings/online-payments" />)

  let row
  try {
    row = await getAccountForAssociation(adminDb(), assoc.id)
  } catch {
    return page(<LoadFailed what="your online payment settings" />)
  }
  const status = onboardingStatus(row)
  return page(
    <OnlinePaymentsPanel
      status={status}
      initial={{
        enabled: row?.onlinePaymentsEnabled ?? false,
        achFeePayer: row?.achFeePayer ?? 'association',
        cardFeePayer: row?.cardFeePayer ?? 'association',
        cardAcknowledged: Boolean(row?.cardFeeAcknowledgedAt),
        returnedFeeDollars: row?.returnedPaymentFeeCents ? (row.returnedPaymentFeeCents / 100).toFixed(2) : '',
        cardFeeAllowed: cardFeeAllowedInState(assoc.state),
        canTurnOn: Boolean(row?.chargesEnabled && row?.payoutsEnabled),
      }}
    />,
  )
}
