'use client'

import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

export function SignOutButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false)

  async function handleSignOut() {
    setBusy(true)
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3.5 text-[15px] font-semibold text-foreground transition active:scale-[0.99] hover:border-destructive/40 hover:text-destructive disabled:opacity-60',
        className,
      )}
    >
      <LogOut className="h-[18px] w-[18px]" aria-hidden />
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
