import { redirect } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getEffectiveRoleInOrg } from '@/lib/role-override'
import { getResidentActor, getImpersonationTarget } from '@/lib/impersonation'
import { ResidentTopBar } from '@/components/resident/ResidentTopBar'
import { ResidentTabBar } from '@/components/resident/ResidentTabBar'
import { RoleSwitcherMount } from '@/components/dev/RoleSwitcherMount'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'

// Resident-only route tree. Unlike the board/admin dashboard (fixed
// sidebar shell), the resident portal wears a consumer app shell: a slim
// top bar, a centered single-column content area, and a fixed bottom tab
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
    <div className="flex min-h-screen flex-col bg-background">
      <ResidentTopBar orgName={org.name} userEmail={userEmail} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-5">
        {impersonation ? (
          <div className="mb-4">
            <ImpersonationBanner name={impersonation.name} />
          </div>
        ) : null}
        {children}
      </main>

      <ResidentTabBar />

      {/* Dev-only role switcher. Renders nothing for non-admins. */}
      <RoleSwitcherMount />
    </div>
  )
}
