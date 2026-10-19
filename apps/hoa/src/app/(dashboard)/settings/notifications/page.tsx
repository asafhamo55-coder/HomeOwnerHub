import Link from 'next/link'
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getMonthlyReportPreference } from '@/lib/monthly-report/actions'
import { getBoardResidentNotifySettings } from '@/lib/resident-notify/actions'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { MonthlyReportToggle } from './MonthlyReportToggle'
import { ResidentNotifyToggle } from './ResidentNotifyToggle'

export const metadata = { title: 'Email notifications' }
export const dynamic = 'force-dynamic'

/**
 * Your own email notifications (BL-073). Board and admin: the month-end
 * report goes to both, so both can turn it off. The choice is per person
 * (stored on the sign-in account), so it applies to every association you
 * are on the board of.
 *
 * "Resident emails" (BL-082) is different: one switch for the whole
 * association, stored on the association, off until a board turns it on.
 */
export default async function NotificationSettingsPage() {
  const { role } = await requireBoardOrAdmin()
  const [monthly, residents] = await Promise.all([getMonthlyReportPreference(), getBoardResidentNotifySettings()])

  return (
    <Page
      width="narrow"
      title="Email notifications"
      description="What HomeownerHub emails you, and what it tells your residents."
      tabs={<SettingsTabs current="/settings/notifications" role={role} />}
      linkAs={Link}
    >
      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Board emails</CardTitle>
          <CardDescription>
            Applies to every association you’re on the board of. Alerts that need action (like a disconnected mailbox)
            always come through.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {monthly === null ? (
            <LoadFailed what="your email settings" />
          ) : (
            <MonthlyReportToggle initial={monthly} />
          )}
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader className="pb-4">
          <CardTitle as="h2">Resident emails</CardTitle>
          <CardDescription>
            One setting for the whole association, shared by every board member. Off until you turn it on. Residents
            who turned off emails or texts in their preferences aren’t contacted that way.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!residents.ok ? (
            residents.reason === 'no_association' ? (
              <p className="text-sm text-muted">Set up your association first, then turn this on.</p>
            ) : (
              <LoadFailed what="your resident email settings" />
            )
          ) : (
            <>
              {residents.data.state === 'unverified' ? (
                <Alert variant="warning" title="Resident notices are paused">
                  The saved setting was changed outside this screen, so nothing will send. Turn it on again to resume.
                </Alert>
              ) : null}
              {!residents.data.emailConfigured ? (
                <Alert variant="warning" title="Email isn’t set up on this server">
                  You can turn this on, but no email will go out until email delivery is configured.
                </Alert>
              ) : null}
              <ResidentNotifyToggle initial={residents.data.on} />
            </>
          )}
        </CardContent>
      </Card>
    </Page>
  )
}
