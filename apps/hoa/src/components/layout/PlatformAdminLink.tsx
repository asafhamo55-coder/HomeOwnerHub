// Server component. Renders a small "Platform" link in the dashboard
// header for users with platform-admin access. Returns null otherwise
// (no privilege disclosure on the wire). Hidden below sm: with the Menu and
// Help labels always shown there is no room for it in a 375px bar; /admin
// is still reachable by URL.

import Link from 'next/link'
import { Shield } from 'lucide-react'
import { isPlatformAdmin } from '@/lib/platform-admin'

export async function PlatformAdminLink() {
  const ok = await isPlatformAdmin()
  if (!ok) return null

  return (
    <Link
      href="/admin"
      className="hidden h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-destructive/40 bg-destructive/5 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 sm:inline-flex"
      title="Open platform-admin tools"
    >
      <Shield className="h-3 w-3" aria-hidden />
      <span className="hidden bar-lg:inline">Platform</span>
      <span className="sr-only bar-lg:hidden">Platform admin</span>
    </Link>
  )
}
