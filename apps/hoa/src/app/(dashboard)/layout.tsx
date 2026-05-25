import { redirect } from 'next/navigation'
import {
  AppShell,
  AppShellContent,
  AppShellHeader,
  AppShellMain,
  AppShellSidebar,
} from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { getCurrentOrg, getUserHoaOrgs, getUserHubs } from '@/lib/orgs'
import { getEffectiveRoleInOrg } from '@/lib/role-override'
import { isPlatformAdmin } from '@/lib/platform-admin'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { HoaSidebar } from '@/components/layout/HoaSidebar'
import { HoaHubSwitcher } from '@/components/layout/HoaHubSwitcher'
import { DashboardProviders } from '@/components/layout/DashboardProviders'
import { PlatformAdminLink } from '@/components/layout/PlatformAdminLink'
import { RoleSwitcherMount } from '@/components/dev/RoleSwitcherMount'

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

  // No HOA membership at all. Two cases:
  //   1) Platform admins (no HOA org_members rows) clicking "Back to HOA Hub"
  //      from the platform tree. Send them somewhere useful — either the
  //      tenant they most recently previewed, or the tenants list — instead
  //      of /onboarding which prompts them to create a NEW HOA they don't
  //      need.
  //   2) Brand-new users who genuinely have no org → /onboarding flow.
  if (!org) {
    if (await isPlatformAdmin()) {
      const lastPreviewedOrgId = await findLastPreviewedOrgId(user.id)
      if (lastPreviewedOrgId) {
        redirect(`/admin/tenants/${lastPreviewedOrgId}`)
      }
      redirect('/admin/tenants')
    }
    redirect('/onboarding')
  }

  // RBAC: residents land on /resident; board/admin continue here. Anyone
  // without a role in their current org gets sent back through onboarding.
  // Migration 0012 establishes the {admin, board, resident} vocabulary.
  // getEffectiveRoleInOrg honors the dev override cookie for admins,
  // so admins can preview the resident UI without actually changing
  // their real role. Non-admins always get their real role.
  const role = await getEffectiveRoleInOrg(org.id)
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
            <div className="ml-auto flex items-center gap-2">
              <PlatformAdminLink />
              <HoaHubSwitcher userHubs={userHubs} />
            </div>
          </AppShellHeader>
          <AppShellContent>{children}</AppShellContent>
        </AppShellMain>
      </AppShell>
      {/* Dev-only role switcher. Renders nothing for non-admins.
          Remove this line when you no longer want the switcher. */}
      <RoleSwitcherMount />
    </DashboardProviders>
  )
}
