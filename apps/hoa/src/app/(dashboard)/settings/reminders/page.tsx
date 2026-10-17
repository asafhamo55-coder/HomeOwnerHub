import Link from 'next/link'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { appUrl } from '@/lib/email'
import { getBoardReminderSettings, previewReminderRun } from '@/lib/reminder-settings'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { AssociationNotSetUp } from '../../_components/AssociationNotSetUp'
import { DuesRemindersForm } from './DuesRemindersForm'

export const metadata = { title: 'Dues reminders' }
export const dynamic = 'force-dynamic'

// Automated dues reminders (backlog BL-013). Board or admin: the treasurer
// is usually a board member, not the org admin.

export default async function DuesRemindersSettingsPage() {
  const { role } = await requireBoardOrAdmin()
  const load = await getBoardReminderSettings()

  const page = (body: React.ReactNode) => (
    <Page
      width="narrow"
      title="Dues reminders"
      description="Email owners with a balance on the days you choose around each due date. Nothing is sent until you turn it on."
      tabs={<SettingsTabs current="/settings/reminders" role={role} />}
      linkAs={Link}
    >
      {body}
    </Page>
  )

  if (!load.ok) {
    if (load.reason === 'no_association') {
      return page(
        <AssociationNotSetUp
          needFor="Reminders go to the owners in your association, and this HOA doesn’t have one yet."
          returnTo="/settings/reminders"
        />,
      )
    }
    return page(<LoadFailed what="your reminder settings" />)
  }
  const { data } = load
  const initialPreview = await previewReminderRun({ offsets: data.settings.offsets })

  return page(
    <>
      {data.state === 'unverified' ? (
        <Alert variant="warning" title="Automatic reminders are paused">
          The saved settings were changed outside this screen, so nothing will send. Check them below and save again.
        </Alert>
      ) : null}
      {!data.emailConfigured ? (
        <Alert variant="warning" title="Email isn’t set up on this server">
          Reminders can be scheduled, but none will go out until email delivery is configured.
        </Alert>
      ) : null}
      <DuesRemindersForm
        associationName={data.association.name}
        portalUrl={appUrl('/resident/dues')}
        initial={data.settings}
        configured={data.state === 'configured'}
        approvedAt={data.approvedAt}
        limits={data.limits}
        initialPreview={initialPreview}
      />
    </>,
  )
}
