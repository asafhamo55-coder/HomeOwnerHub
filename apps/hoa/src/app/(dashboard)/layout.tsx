import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import {
  AppShell,
  AppShellContent,
  AppShellHeader,
  AppShellMain,
  AppShellSearchTrigger,
  AppShellSidebar,
} from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { getCurrentOrg, getSignedInUser, getUserHoaOrgs, getUserHubs } from '@/lib/orgs'
import { getEffectiveRoleInOrg } from '@/lib/role-override'
import { isPlatformAdmin } from '@/lib/platform-admin'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { HoaSidebar } from '@/components/layout/HoaSidebar'
import { HoaHubSwitcher } from '@/components/layout/HoaHubSwitcher'
import { HoaCommandPalette, HoaUserMenu } from '@/components/layout/HoaChrome'
import { DashboardProviders } from '@/components/layout/DashboardProviders'
import { NavigationProgress } from '@/components/layout/NavigationProgress'
import { PlatformAdminLink } from '@/components/layout/PlatformAdminLink'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { RoleSwitcherMount } from '@/components/dev/RoleSwitcherMount'
import { Copilot, CopilotTrigger } from '@/components/copilot/Copilot'
import { countPendingApprovals } from '@/lib/approvals-inbox/load'
import { approvalsBadge } from '@/lib/approvals-inbox/model'
import { appVersion } from '@/lib/app-version'
import { HelpDrawer } from '@/components/guide/HelpDrawer'
import { articlesFor, drawerData, articleHref } from '@/lib/guide'
import { latestBoardWhatsNewId } from '@/lib/guide/whats-new'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [supabase, user] = await Promise.all([getSupabaseServerClient(), getSignedInUser()])
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

  // Sidebar count for /approvals (BL-014): four head-only counts. A failed
  // count yields no badge (or a "3+" lower bound), never a false 0.
  const approvalCounts = await countPendingApprovals(supabase, org.id)

  return (
    <DashboardProviders>
      {/* Instant click-to-motion feedback. Renders nothing until a
          same-origin link is clicked; bar sweeps left-to-right during
          server fetch. Pure client component, no server-side risk. */}
      <NavigationProgress />
      <AppShell>
        <AppShellSidebar collapsible>
          <HoaSidebar
            currentOrgId={org.id}
            currentOrgName={org.name}
            hoaOrgs={role === 'admin' ? hoaOrgs : hoaOrgs.filter((o) => o.id === org.id)}
            role={role}
            badges={{ '/approvals': approvalsBadge(approvalCounts) }}
            version={appVersion()}
            whatsNewLatestId={latestBoardWhatsNewId()}
          />
        </AppShellSidebar>
        <AppShellMain>
          <AppShellHeader>
            <AppShellSearchTrigger />
            {/* shrink-0: the search field is what gives way when the bar
                narrows (Copilot open, small laptop); these collapse to
                icons below the bar-lg container width instead. */}
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
              {/* Dev-only role switcher, docked in the top bar so it never
                  floats over page content. Renders nothing for non-admins. */}
              <RoleSwitcherMount placement="toolbar" />
              {role === 'admin' && <PlatformAdminLink />}
              <HelpDrawer data={drawerData(role)} />
              <CopilotTrigger />
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
              <HoaUserMenu email={user.email ?? ''} role={role} orgName={org.name} />
            </div>
          </AppShellHeader>
          <AppShellContent>{children}</AppShellContent>
        </AppShellMain>
        {/* Docked copilot panel: an in-flow column at lg+ (the page narrows
            rather than being covered), an overlay below. Toggled from the
            top bar. */}
        <Copilot />
        <HoaCommandPalette
          role={role}
          helpArticles={articlesFor(role).map((a) => ({ id: a.id, title: a.title, href: articleHref(a.id, 'board'), keywords: a.keywords }))}
        />
      </AppShell>
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
