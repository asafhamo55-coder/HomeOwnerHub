// Server-side gate for the role switcher. Renders nothing for
// non-admins. Reads the real role + current override and passes both
// to the client component.
//
// Placement: docked in the board top bar (`toolbar`) and as an in-flow
// strip above the resident top bar (`banner`). It never floats over the
// page — the old fixed bottom-right pill covered dashboard cards and the
// resident tab bar.
//
// To DISABLE the switcher app-wide: remove the <RoleSwitcherMount />
// JSX from the dashboard + resident layouts. The server actions in
// lib/role-override.ts stay safe even when this is gone (they refuse
// any non-admin caller).

import { getCurrentOrg } from '@/lib/orgs'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { getRoleOverride } from '@/lib/role-override'
import { RoleSwitcher } from './RoleSwitcher'

export async function RoleSwitcherMount({
  placement,
}: {
  placement: 'toolbar' | 'banner'
}) {
  const org = await getCurrentOrg()
  if (!org) return null

  const realRole = await getCurrentUserRoleInOrg(org.id)
  if (realRole !== 'admin') return null

  const override = await getRoleOverride()
  return <RoleSwitcher realRole={realRole} override={override} placement={placement} />
}
