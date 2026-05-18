// Server component. Renders a small "Platform" link in the dashboard
// header for users with platform-admin access. Returns null otherwise
// (no privilege disclosure on the wire).

import Link from 'next/link'
import { Shield } from 'lucide-react'
import { isPlatformAdmin } from '@/lib/platform-admin'

export async function PlatformAdminLink() {
  const ok = await isPlatformAdmin()
  if (!ok) return null

  return (
    <Link
      href="/admin"
      className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/5 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
      title="Open platform-admin tools"
    >
      <Shield className="h-3 w-3" />
      Platform
    </Link>
  )
}
