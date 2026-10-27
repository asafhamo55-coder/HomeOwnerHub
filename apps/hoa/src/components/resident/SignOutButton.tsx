'use client'

import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'
import { clearSessionCookiesOnSignOut } from '@/app/actions/sign-out'

export function SignOutButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false)

  async function handleSignOut() {
    setBusy(true)
    // Lazy: keeps @supabase/ssr + auth-js (~150 kB) out of every page's shared JS.
    const { getSupabaseBrowserClient } = await import('@/lib/supabase/browser')
    const supabase = getSupabaseBrowserClient()
    // Impersonation / role-override cookies are HTTPOnly: clear server-side.
    await clearSessionCookiesOnSignOut().catch(() => {})
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3.5 text-sm font-semibold text-foreground transition active:scale-[0.99] hover:border-destructive/40 hover:text-destructive disabled:opacity-60',
        className,
      )}
    >
      <LogOut className="h-[18px] w-[18px]" aria-hidden />
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
