import { Building2, Users } from 'lucide-react'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const org = await getCurrentOrg()
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const { count: memberCount } = await supabase
    .from('org_members')
    .select('user_id', { count: 'exact', head: true })

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-muted">Settings</h1>
        <p className="mt-1 text-sm text-muted-fg">Manage your HOA&apos;s configuration.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-muted-fg" />
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
            {org.doors_count ?? <span className="text-muted-fg">Not set</span>}
          </Row>
          <Row label="Hub type">{org.hub_type}</Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-muted-fg" />
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
      <span className="text-xs uppercase tracking-wide text-muted-fg">{label}</span>
      <span className="text-muted">{children}</span>
    </div>
  )
}
