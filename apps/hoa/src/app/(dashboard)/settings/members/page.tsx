import { Bell, Users } from 'lucide-react'
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { listMembers, listOrgProperties } from '@/lib/members'
import { countMyPushDevices } from '@/lib/push-subscriptions'
import { EnablePushButton } from '@/components/notifications/EnablePushButton'
import { InviteMemberForm } from './InviteMemberForm'
import { MemberRow } from './MemberRow'

export const metadata = { title: 'Members' }

export default async function MembersPage() {
  const { role } = await requireBoardOrAdmin()

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [members, properties, pushDevices] = await Promise.all([
    listMembers(),
    listOrgProperties(),
    // Board members are the people ticket notifications go to, and this
    // is the only settings page they can reach — /settings and
    // /settings/mailbox both gate on requireAdmin. Hence the opt-in card
    // living here rather than on the main Settings page.
    countMyPushDevices(),
  ])

  // null = the server could not read push_subscriptions at all (0053 not
  // applied yet). The card renders "not available yet" for that, which is
  // a different thing from "you have zero devices".
  const storedDeviceCount = pushDevices.ok ? pushDevices.data.count : null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Members</h1>
        </div>
        <p className="text-sm text-muted">
          Manage who has access to this HOA and at what role. Admins can
          do everything; Board members manage operations; Residents see
          their own dues, governing docs, and can submit ARC + violation
          reports.
        </p>
      </header>

      <Alert variant="info" title="Permanent demotion guardrail">
        <span className="block text-sm">
          You can't demote or remove the last Admin. Promote someone
          else first.
        </span>
      </Alert>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Invite a member</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteMemberForm properties={properties} role={role} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <MemberRow key={m.user_id} member={m} isSelf={m.user_id === user?.id} />
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-muted" />
            Ticket notifications
          </CardTitle>
          <CardDescription>
            Get an alert on this device the moment a resident opens a ticket —
            with the app closed, like a text message. This is per-device, so
            turn it on separately on your phone and your laptop.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EnablePushButton storedDeviceCount={storedDeviceCount} />
        </CardContent>
      </Card>
    </div>
  )
}
