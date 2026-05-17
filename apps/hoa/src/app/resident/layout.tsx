import { redirect } from 'next/navigation'
import {
  AppShell,
  AppShellContent,
  AppShellHeader,
  AppShellMain,
  AppShellSidebar,
} from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentUserRole } from '@/lib/auth'
import { ResidentSidebar } from '@/components/layout/ResidentSidebar'

// Resident-only route tree. Gates role + builds the AppShell sidebar.

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

  const ctx = await getCurrentUserRole()
  if (!ctx) redirect('/onboarding')
  if (ctx.role !== 'resident') redirect('/')

  return (
    <AppShell>
      <AppShellSidebar>
        <ResidentSidebar orgName={ctx.org.name} userEmail={user.email ?? ''} />
      </AppShellSidebar>
      <AppShellMain>
        <AppShellHeader>
          <div className="ml-auto text-xs text-muted">Resident portal</div>
        </AppShellHeader>
        <AppShellContent>{children}</AppShellContent>
      </AppShellMain>
    </AppShell>
  )
}
