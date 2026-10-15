import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  KeyValue,
  KeyValueList,
  NoOrgSelected,
  Page,
  StatusPill,
} from '@homeowner-portal/ui'
import { requireAdmin } from '@/lib/auth'
import { getCurrentOrg } from '@/lib/orgs'
import { getMyProfile } from '@/lib/profile'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { ProfileForm } from './ProfileForm'

export const metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  trial: 'Trial',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

export default async function SettingsPage() {
  await requireAdmin()
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />

  const supabase = await getSupabaseServerClient()
  const [membersRes, profile] = await Promise.all([
    supabase.from('org_members').select('user_id', { count: 'exact', head: true }),
    getMyProfile(),
  ])
  // A failed count reads "—", never a confident "1 person".
  const memberCount = membersRes.error ? null : membersRes.count

  return (
    <Page
      width="narrow"
      title="Settings"
      description="Your profile and your association’s account."
      tabs={<SettingsTabs current="/settings" role="admin" />}
      linkAs={Link}
    >
      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Your profile</CardTitle>
          <CardDescription>The name shown in the dashboard greeting, emails and the members list.</CardDescription>
        </CardHeader>
        <CardContent>
          {profile ? (
            <ProfileForm profile={profile} />
          ) : (
            <p className="text-sm text-muted">Your profile couldn’t be loaded. Refresh to try again.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Association</CardTitle>
          <CardDescription>Read-only for now — contact support to change these.</CardDescription>
        </CardHeader>
        <CardContent>
          <KeyValueList>
            <KeyValue label="Name" value={org.name} />
            <KeyValue
              label="Plan"
              value={<StatusPill tone="brand" icon={null} label={PLAN_LABEL[org.plan] ?? org.plan} />}
            />
            <KeyValue
              label="Doors"
              value={org.doors_count != null ? <span className="num">{org.doors_count}</span> : 'Not set'}
            />
            <KeyValue
              label="Members"
              value={
                <Link href="/settings/members" className="font-medium text-primary hover:underline">
                  {memberCount == null
                    ? 'View members'
                    : `${memberCount} ${memberCount === 1 ? 'person' : 'people'}`}
                </Link>
              }
            />
          </KeyValueList>
        </CardContent>
      </Card>
    </Page>
  )
}
