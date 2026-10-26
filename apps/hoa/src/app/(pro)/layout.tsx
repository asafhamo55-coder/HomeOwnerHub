import { redirect } from 'next/navigation'
import { AppShell, AppShellContent, AppShellHeader, AppShellMain, AppShellSidebar, Alert, EmptyState, Page } from '@homeowner-portal/ui'
import { M6_APPLIED } from '@homeowner-portal/db/m6'
import { getCurrentOrg, getMembershipDetail, getSignedInUser } from '@/lib/orgs'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { homeFor, isProfessionalRole } from '@/lib/roles'
import { ProSidebar } from '@/components/layout/ProSidebar'
import { HoaUserMenu } from '@/components/layout/HoaChrome'
import { DashboardProviders } from '@/components/layout/DashboardProviders'

export const metadata = { title: 'Professional access' }

/**
 * BL-168: the home of an outside CPA or attorney. Not the board dashboard:
 * its own sidebar, and every page below asks for its own role. Before
 * migration 0070 is applied (M6_APPLIED false) nothing here is reachable.
 */
export default async function ProLayout({ children }: { children: React.ReactNode }) {
  if (!M6_APPLIED) redirect('/')
  const user = await getSignedInUser()
  if (!user) redirect('/login')
  const org = await getCurrentOrg()
  if (!org) redirect('/onboarding')

  const role = await getCurrentUserRoleInOrg(org.id)
  const detail = await getMembershipDetail(org.id)

  // An ended grant: say so, show nothing else.
  if (!role && detail?.expired) {
    return (
      <DashboardProviders>
        <Page title="Your access has ended">
          <EmptyState
            title={`Your access to ${org.name} has ended`}
            description="The board sets how long a professional can see the association’s records. Ask them to renew your access if you still need it."
          />
        </Page>
      </DashboardProviders>
    )
  }
  if (!role) redirect('/onboarding')
  if (!isProfessionalRole(role)) redirect(homeFor(role))

  return (
    <DashboardProviders>
      <AppShell>
        <AppShellSidebar collapsible>
          <ProSidebar role={role} orgName={org.name} general={detail?.generalCounsel === true} />
        </AppShellSidebar>
        <AppShellMain>
          <AppShellHeader>
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
              <HoaUserMenu email={user.email ?? ''} role={role} orgName={org.name} />
            </div>
          </AppShellHeader>
          <AppShellContent>
            {detail?.accessExpiresAt ? (
              <Alert variant="info" className="mb-5">
                Your access runs until {detail.accessExpiresAt.slice(0, 10)}. Everything you send goes to the board for approval first.
              </Alert>
            ) : null}
            {children}
          </AppShellContent>
        </AppShellMain>
      </AppShell>
    </DashboardProviders>
  )
}
