import { redirect } from 'next/navigation'
import {
  AppShell,
  AppShellContent,
  AppShellHeader,
  AppShellMain,
  AppShellSidebar,
} from '@homeowner-portal/ui'
import { getCurrentOrg, getUserHoaOrgs, getUserHubs } from '@/lib/orgs'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { HoaSidebar } from '@/components/layout/HoaSidebar'
import { HoaHubSwitcher } from '@/components/layout/HoaHubSwitcher'
import { DashboardProviders } from '@/components/layout/DashboardProviders'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [org, userHubs, hoaOrgs] = await Promise.all([
    getCurrentOrg(),
    getUserHubs(),
    getUserHoaOrgs(),
  ])
  if (!org) redirect('/onboarding')

  // RBAC: residents land on /resident; board/admin continue here. Anyone
  // without a role in their current org gets sent back through onboarding.
  // Migration 0012 establishes the {admin, board, resident} vocabulary.
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role === 'resident') redirect('/resident')
  if (!role) redirect('/onboarding')

  return (
    <DashboardProviders>
      <AppShell>
        <AppShellSidebar>
          <HoaSidebar
            currentOrgId={org.id}
            currentOrgName={org.name}
            hoaOrgs={hoaOrgs}
            userEmail={user.email ?? ''}
          />
        </AppShellSidebar>
        <AppShellMain>
          <AppShellHeader>
            <div className="ml-auto">
              <HoaHubSwitcher userHubs={userHubs} />
            </div>
          </AppShellHeader>
          <AppShellContent>{children}</AppShellContent>
        </AppShellMain>
      </AppShell>
    </DashboardProviders>
  )
}
