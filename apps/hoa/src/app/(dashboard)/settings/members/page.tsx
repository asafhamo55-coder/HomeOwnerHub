import { Users } from 'lucide-react'
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import { requireAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { listMembers } from '@/lib/members'
import { InviteMemberForm } from './InviteMemberForm'
import { MemberRow } from './MemberRow'

export const metadata = { title: 'Members' }

export default async function MembersPage() {
  await requireAdmin()

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const members = await listMembers()

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
          <InviteMemberForm />
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
    </div>
  )
}
