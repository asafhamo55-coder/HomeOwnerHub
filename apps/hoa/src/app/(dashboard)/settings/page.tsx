import { Building2, User, Users } from 'lucide-react'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getMyProfile } from '@/lib/profile'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ProfileForm } from './ProfileForm'

export const metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const org = await getCurrentOrg()
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const [{ count: memberCount }, profile] = await Promise.all([
    supabase.from('org_members').select('user_id', { count: 'exact', head: true }),
    getMyProfile(),
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your HOA&apos;s configuration.</p>
      </header>

      {profile ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-muted" />
              My profile
            </CardTitle>
            <CardDescription>
              The name shown in the dashboard greeting, emails, and the members
              list.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={profile} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-muted" />
            HOA
          </CardTitle>
          <CardDescription>
            Editing these values will be added in a later checkpoint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Name">{org.name}</Row>
          <Row label="Plan">
            <Badge variant="outline" size="sm">
              {org.plan}
            </Badge>
          </Row>
          <Row label="Doors">
            {org.doors_count ?? <span className="text-muted">Not set</span>}
          </Row>
          <Row label="Hub type">{org.hub_type}</Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-muted" />
            Members
          </CardTitle>
          <CardDescription>
            Inviting board members and editing roles will be added in a later checkpoint.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <Row label="Current members">
            {memberCount ?? 1} {(memberCount ?? 1) === 1 ? 'person' : 'people'}
          </Row>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <span className="text-foreground">{children}</span>
    </div>
  )
}
