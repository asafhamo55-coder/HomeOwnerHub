import { redirect } from 'next/navigation'
import {
  AppShell,
  AppShellContent,
  AppShellHeader,
  AppShellMain,
  AppShellSidebar,
} from '@homeownerhub/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { PmSidebar } from '@/components/layout/PmSidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const org = await getCurrentOrg()
  if (!org) redirect('/onboarding')

  return (
    <AppShell>
      <AppShellSidebar>
        <PmSidebar orgName={org.name} userEmail={user.email ?? ''} />
      </AppShellSidebar>
      <AppShellMain>
        <AppShellHeader />
        <AppShellContent>{children}</AppShellContent>
      </AppShellMain>
    </AppShell>
  )
}
