import Link from 'next/link'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getBoardZelleSettings } from '@/lib/pay-settings'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { AssociationNotSetUp } from '../../_components/AssociationNotSetUp'
import { ZelleSettingsForm } from './ZelleSettingsForm'

export const metadata = { title: 'Resident payments' }
export const dynamic = 'force-dynamic'

// Pay-by-Zelle setup (backlog BL-006). Board or admin: the treasurer is
// usually a board member, not the org admin.

export default async function ResidentPaymentsSettingsPage() {
  const { role } = await requireBoardOrAdmin()
  const load = await getBoardZelleSettings()

  const page = (body: React.ReactNode) => (
    <Page
      width="narrow"
      title="Resident payments"
      description="Let residents pay dues with Zelle. Each charge gets a memo code, so deposits match to the right home automatically."
      tabs={<SettingsTabs current="/settings/payments" role={role} />}
      linkAs={Link}
    >
      {body}
    </Page>
  )

  if (!load.ok) {
    if (load.reason === 'no_association') {
      return page(
        <AssociationNotSetUp
          needFor="Resident payments attach to your association’s accounting, and this HOA doesn’t have one yet."
          returnTo="/settings/payments"
        />,
      )
    }
    return page(<LoadFailed what="your payment settings" />)
  }
  const { data } = load

  return page(
    <>
      {data.read.state === 'unverified' ? (
        <Alert variant="warning" title="Residents can’t see your Zelle details right now">
          The saved details were changed outside this screen, so they’re hidden from residents. Check them below and
          save again.
        </Alert>
      ) : null}
      <ZelleSettingsForm
        initial={data.initial}
        configured={data.read.state === 'configured'}
        updatedAt={data.read.state === 'configured' ? data.read.settings.updatedAt : null}
        sampleMemoCode={data.sampleMemoCode}
      />
    </>,
  )
}
