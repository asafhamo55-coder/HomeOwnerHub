import Link from 'next/link'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadFailed,
  Page,
} from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { listMembers, listOrgProperties } from '@/lib/members'
import { tryLoad } from '@/lib/load-or-fail'
import { countMyPushDevices } from '@/lib/push-subscriptions'
import { EnablePushButton } from '@/components/notifications/EnablePushButton'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { InviteMemberForm } from './InviteMemberForm'
import { MemberRow } from './MemberRow'

export const metadata = { title: 'Members' }

export default async function MembersPage() {
  const { role } = await requireBoardOrAdmin()

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [membersResult, properties, pushDevices] = await Promise.all([
    tryLoad('members', () => listMembers()),
    listOrgProperties(),
    // Board members are the people ticket notifications go to, and this
    // is the only settings page besides Billing they can reach — /settings
    // and /settings/mailbox both gate on requireAdmin. Hence the opt-in
    // card living here rather than on the main Settings page.
    countMyPushDevices(),
  ])

  // null = the server could not read push_subscriptions at all (0053 not
  // applied yet). The card renders "not available yet" for that, which is
  // a different thing from "you have zero devices".
  const storedDeviceCount = pushDevices.ok ? pushDevices.data.count : null

  return (
    <Page
      width="narrow"
      title="Settings"
      description="Who has access to this HOA, and at what role."
      tabs={<SettingsTabs current="/settings/members" role={role} />}
      linkAs={Link}
    >
      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Invite a member</CardTitle>
          <CardDescription>
            Admins can do everything. Board members run day-to-day operations. Residents see their own dues and
            documents and can submit requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteMemberForm properties={properties} role={role} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          className="pb-3"
          actions={
            membersResult.ok ? (
              <Badge variant="neutral" className="num">
                {membersResult.data.length}
              </Badge>
            ) : null
          }
        >
          <CardTitle as="h2">Members</CardTitle>
          <CardDescription>The last admin can’t be demoted or removed — promote someone else first.</CardDescription>
        </CardHeader>
        {membersResult.ok ? (
          <ul className="divide-y divide-border border-t border-border">
            {membersResult.data.map((m) => (
              <MemberRow key={m.user_id} member={m} isSelf={m.user_id === user?.id} viewerRole={role} />
            ))}
          </ul>
        ) : (
          <CardContent>
            <LoadFailed what="members" retryHref="/settings/members" />
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Ticket notifications on this device</CardTitle>
          <CardDescription>
            Get an alert the moment a resident opens a ticket, even with the app closed. Turn it on separately on
            each phone and computer you use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EnablePushButton storedDeviceCount={storedDeviceCount} />
        </CardContent>
      </Card>
    </Page>
  )
}
