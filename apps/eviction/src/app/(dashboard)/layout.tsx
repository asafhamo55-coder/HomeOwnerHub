import { redirect } from 'next/navigation'
import {
  AppShell,
  AppShellContent,
  AppShellHeader,
  AppShellMain,
  AppShellSidebar,
} from '@homeowner-portal/ui'
import { getCurrentOrg, getUserHubs } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { EvictionSidebar } from '@/components/layout/EvictionSidebar'
import { EvictionHubSwitcher } from '@/components/layout/EvictionHubSwitcher'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [org, userHubs] = await Promise.all([getCurrentOrg(), getUserHubs()])
  if (!org) redirect('/onboarding')

  return (
    <AppShell>
      <AppShellSidebar>
        <EvictionSidebar orgName={org.name} userEmail={user.email ?? ''} />
      </AppShellSidebar>
      <AppShellMain>
        <AppShellHeader>
          <div className="ml-auto">
            <EvictionHubSwitcher userHubs={userHubs} />
          </div>
        </AppShellHeader>
        <AppShellContent>{children}</AppShellContent>
      </AppShellMain>
    </AppShell>
  )
}
