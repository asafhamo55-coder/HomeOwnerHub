import Link from 'next/link'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getBoardVendorInsuranceSettings } from '@/lib/vendor-insurance-settings'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { AssociationNotSetUp } from '../../_components/AssociationNotSetUp'
import { VendorInsuranceForm } from './VendorInsuranceForm'

export const metadata = { title: 'Vendor settings' }
export const dynamic = 'force-dynamic'

// Settings → Vendors (BL-083 / BL-084): insurance minimums and the COI
// expiry reminder opt-out. Board or admin.

export default async function VendorSettingsPage() {
  const { role } = await requireBoardOrAdmin()
  const load = await getBoardVendorInsuranceSettings()

  const page = (body: React.ReactNode) => (
    <Page
      width="narrow"
      title="Vendors"
      description="Set the insurance every vendor must carry, and whether the board is notified before a certificate expires."
      tabs={<SettingsTabs current="/settings/vendors" role={role} />}
      linkAs={Link}
    >
      {body}
    </Page>
  )

  if (!load.ok) {
    if (load.reason === 'no_association') {
      return page(
        <AssociationNotSetUp
          needFor="Insurance minimums belong to your association, and this HOA doesn’t have one yet."
          returnTo="/settings/vendors"
        />,
      )
    }
    return page(<LoadFailed what="your vendor settings" />)
  }
  const { data } = load

  return page(
    <>
      {data.state === 'unverified' ? (
        <Alert variant="warning" title="Your saved vendor settings aren’t in use">
          They were changed outside this screen, so the defaults below apply and board reminders stay on. Check them
          and save again.
        </Alert>
      ) : null}
      <VendorInsuranceForm initial={data.settings} configured={data.state === 'configured'} updatedAt={data.updatedAt} />
    </>,
  )
}
