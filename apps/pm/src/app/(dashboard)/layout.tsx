import Link from 'next/link'
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
import { PmSidebar } from '@/components/layout/PmSidebar'
import { PmHubSwitcher } from '@/components/layout/PmHubSwitcher'
import { PmUserMenu } from '@/components/layout/PmUserMenu'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [org, userHubs] = await Promise.all([getCurrentOrg(), getUserHubs()])
  if (!org) redirect('/onboarding')

  return (
    <AppShell linkAs={Link}>
      <AppShellSidebar collapsible>
        <PmSidebar orgName={org.name} />
      </AppShellSidebar>
      <AppShellMain>
        <AppShellHeader>
          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            <PmHubSwitcher userHubs={userHubs} />
            <PmUserMenu email={user.email ?? ''} orgName={org.name} />
          </div>
        </AppShellHeader>
        <AppShellContent>{children}</AppShellContent>
      </AppShellMain>
    </AppShell>
  )
}
