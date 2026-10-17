import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getEffectiveRoleInOrg } from '@/lib/role-override'
import { getResidentActor, getImpersonationTarget } from '@/lib/impersonation'
import { ResidentTopBar } from '@/components/resident/ResidentTopBar'
import { ResidentTabBar } from '@/components/resident/ResidentTabBar'
import { RoleSwitcherMount } from '@/components/dev/RoleSwitcherMount'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'
import { ResidentProviders } from '@/components/resident/ResidentProviders'
import { AppVersion } from '@/components/layout/AppVersion'
import { appVersion } from '@/lib/app-version'
import { HelpDrawer } from '@/components/guide/HelpDrawer'
import { drawerData } from '@/lib/guide'

// Resident-only route tree. Unlike the board/admin dashboard (fixed
// sidebar shell), the resident portal wears a consumer app shell: a slim
// top bar, a centered single-column content area, and a sticky bottom tab
// bar on every viewport. Gating logic is unchanged — getEffectiveRoleInOrg
// so an admin with the dev override (or an active impersonation cookie)
// sees this UI; real residents always land here.

export default async function ResidentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/resident')

  const org = await getCurrentOrg()
  if (!org) redirect('/onboarding')

  const actor = await getResidentActor()

  if (!actor.impersonating) {
    const effectiveRole = await getEffectiveRoleInOrg(org.id)
    if (!effectiveRole) redirect('/onboarding')
    // Board or admin (without resident override) land on the manager
    // dashboard. Admin with override=resident reaches this branch.
    if (effectiveRole !== 'resident') redirect('/')
  }

  const impersonation = actor.impersonating ? await getImpersonationTarget() : null
  const userEmail = actor.impersonating ? actor.email ?? '' : user.email ?? ''

  return (
    <ResidentProviders>
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Dev-only role switcher: an in-flow strip, so it can never cover
          content or the tab bar. Renders nothing for non-admins. */}
      <div className="print:hidden">
        <RoleSwitcherMount placement="banner" />
      </div>

      <ResidentTopBar
        orgName={org.name}
        userEmail={userEmail}
        help={<HelpDrawer variant="resident" data={drawerData('resident')} />}
      />

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pb-10 pt-5 sm:pt-8 print:max-w-none print:p-0">
        {impersonation ? (
          <div className="print:hidden">
            <ImpersonationBanner name={impersonation.name} />
          </div>
        ) : null}
        {children}
        {/* BL-071: residents see the running version too (no link). */}
        <footer className="mt-10 text-center print:hidden">
          <AppVersion version={appVersion()} />
        </footer>
      </main>

      <ResidentTabBar />
    </div>
    </ResidentProviders>
  )
}
