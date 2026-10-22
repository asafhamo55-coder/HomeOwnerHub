import Link from 'next/link'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getBoardLateFeePolicy } from '@/lib/late-fees/actions'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { AssociationNotSetUp } from '../../_components/AssociationNotSetUp'
import { LateFeePolicyForm } from './LateFeePolicyForm'

export const metadata = { title: 'Late fees' }
export const dynamic = 'force-dynamic'

// Settings → Late fees (BL-147): the board's late-fee policy and the state
// cap. Board or admin. With no saved policy, no late fee is charged.

export default async function LateFeeSettingsPage() {
  const { role } = await requireBoardOrAdmin()
  const load = await getBoardLateFeePolicy()

  const page = (body: React.ReactNode) => (
    <Page
      width="narrow"
      title="Late fees"
      description="Decide whether overdue charges get a late fee, how much, and after how many days."
      tabs={<SettingsTabs current="/settings/late-fees" role={role} />}
      linkAs={Link}
    >
      {body}
    </Page>
  )

  if (!load.ok) {
    if (load.reason === 'no_association') {
      return page(
        <AssociationNotSetUp
          needFor="A late-fee policy belongs to your association, and this HOA doesn’t have one yet."
          returnTo="/settings/late-fees"
        />,
      )
    }
    return page(<LoadFailed what="your late-fee policy" />)
  }
  const { data } = load

  return page(
    <>
      {data.state === 'none' ? (
        <Alert variant="info" title="No late fees are charged yet">
          Your board hasn’t saved a late-fee policy, so HomeownerHub adds no late fee to any charge. Set one below if
          your declaration provides for a late charge.
        </Alert>
      ) : null}
      {data.state === 'unverified' ? (
        <Alert variant="warning" title="Your saved late-fee policy isn’t in use">
          It was changed outside this screen, so no late fees are being charged. Check it and save again.
        </Alert>
      ) : null}
      <LateFeePolicyForm initial={data.policy} saved={data.state === 'saved'} updatedAt={data.updatedAt} law={data.law} />
    </>,
  )
}
