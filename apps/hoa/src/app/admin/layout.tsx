import { redirect } from 'next/navigation'
import {
  AppShell,
  AppShellContent,
  AppShellHeader,
  AppShellMain,
  AppShellSidebar,
} from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform-admin'
import { AdminSidebar } from '@/components/layout/AdminSidebar'

// Platform-admin tree. Gated server-side by the platform_admins table
// (migration 0019). Renders a distinct UI shell so it's visually
// obvious you're operating across all tenants, not inside one.

export const metadata = { title: 'HomeownerHub — Platform' }

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/admin')

  const ok = await isPlatformAdmin()
  if (!ok) redirect('/')

  return (
    <AppShell>
      <AppShellSidebar>
        <AdminSidebar userEmail={user.email ?? ''} />
      </AppShellSidebar>
      <AppShellMain>
        <AppShellHeader>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-mono uppercase tracking-wide text-destructive">
              Platform admin
            </span>
          </div>
        </AppShellHeader>
        <AppShellContent>{children}</AppShellContent>
      </AppShellMain>
    </AppShell>
  )
}
