import { redirect } from 'next/navigation'
import {
  AppShell,
  AppShellContent,
  AppShellHeader,
  AppShellMain,
  AppShellSidebar,
} from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getEffectiveRoleInOrg } from '@/lib/role-override'
import { getResidentActor, getImpersonationTarget } from '@/lib/impersonation'
import { ResidentSidebar } from '@/components/layout/ResidentSidebar'
import { RoleSwitcherMount } from '@/components/dev/RoleSwitcherMount'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'

// Resident-only route tree. Gates role + builds the AppShell sidebar.
// Uses getEffectiveRoleInOrg so an admin with the dev override cookie
// set to "resident" sees this UI; real residents always land here.
// An admin with an active impersonation cookie also reaches this tree,
// viewing the target owner's data read-only (see lib/impersonation.ts).

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

  return (
    <AppShell>
      <AppShellSidebar>
        <ResidentSidebar
          orgName={org.name}
          userEmail={actor.impersonating ? actor.email ?? '' : user.email ?? ''}
        />
      </AppShellSidebar>
      <AppShellMain>
        <AppShellHeader>
          <div className="ml-auto text-xs text-muted">Resident portal</div>
        </AppShellHeader>
        <AppShellContent>
          {impersonation ? (
            <ImpersonationBanner name={impersonation.name} />
          ) : null}
          {children}
        </AppShellContent>
      </AppShellMain>
      {/* Dev-only role switcher. Renders nothing for non-admins. */}
      <RoleSwitcherMount />
    </AppShell>
  )
}
