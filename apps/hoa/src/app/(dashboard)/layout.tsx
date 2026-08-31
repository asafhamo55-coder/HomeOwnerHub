import { Suspense } from 'react'
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
import { NavigationProgress } from '@/components/layout/NavigationProgress'
import { PlatformAdminLink } from '@/components/layout/PlatformAdminLink'
import { NotificationBell } from '@/components/notifications/NotificationBell'
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
      {/* Instant click-to-motion feedback. Renders nothing until a
          same-origin link is clicked; bar sweeps left-to-right during
          server fetch. Pure client component, no server-side risk. */}
      <NavigationProgress />
      <AppShell>
        <AppShellSidebar>
          <HoaSidebar
            currentOrgId={org.id}
            currentOrgName={org.name}
            hoaOrgs={role === 'admin' ? hoaOrgs : hoaOrgs.filter((o) => o.id === org.id)}
            userEmail={user.email ?? ''}
            role={role}
          />
        </AppShellSidebar>
        <AppShellMain>
          <AppShellHeader>
            <div className="ml-auto flex items-center gap-2">
              {role === 'admin' && <PlatformAdminLink />}
              {/* Wrapped in Suspense so two extra queries on the shared
                  dashboard chrome cannot delay first paint of the page
                  itself — the header streams the bell in when it resolves.
                  The fallback is deliberately nothing rather than a
                  skeleton: a bell that appears is less distracting in a
                  14px-tall header than a placeholder that swaps. */}
              <Suspense fallback={null}>
                <NotificationBell />
              </Suspense>
              {role === 'admin' && <HoaHubSwitcher userHubs={userHubs} />}
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

/**
 * Finds the most recently previewed tenant org_id for a given platform
 * admin from platform_admin_audit. Used when a platform admin with no
 * HOA membership clicks "Back to HOA Hub" — we route them to the last
 * tenant they actually looked at rather than the tenant list. Returns
 * null when there's no preview history yet (then we fall back to the
 * list).
 *
 * Service-role client because the audit table is locked down to
 * platform admins via app-side gating, and reading from it via the
 * user-bound client would be RLS-restricted.
 */
async function findLastPreviewedOrgId(userId: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_admin_audit' as never)
      .select('target_org_id, created_at, action')
      .eq('actor_user_id', userId)
      .eq('action', 'tenant.preview')
      .not('target_org_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ target_org_id: string | null }>()
    return data?.target_org_id ?? null
  } catch {
    return null
  }
}
