import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getMonthlyReportPreference } from '@/lib/monthly-report/actions'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { MonthlyReportToggle } from './MonthlyReportToggle'

export const metadata = { title: 'Email notifications' }
export const dynamic = 'force-dynamic'

/**
 * Your own email notifications (BL-073). Board and admin: the month-end
 * report goes to both, so both can turn it off. The choice is per person
 * (stored on the sign-in account), so it applies to every association you
 * are on the board of.
 */
export default async function NotificationSettingsPage() {
  const { role } = await requireBoardOrAdmin()
  const monthly = await getMonthlyReportPreference()

  return (
    <Page
      width="narrow"
      title="Email notifications"
      description="What HomeownerHub emails you. These are your own choices — they don’t change anyone else’s."
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
    </Page>
  )
}
