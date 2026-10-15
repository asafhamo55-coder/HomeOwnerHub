'use client'

import Link from 'next/link'
import { CreditCard, Settings } from 'lucide-react'
import { DropdownMenuItem, UserMenu } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

async function signOut() {
  const supabase = getSupabaseBrowserClient()
  await supabase.auth.signOut()
  window.location.href = '/login'
}

/** Top-bar account menu: identity, settings, theme (light/dark/system), sign out. */
export function EvictionUserMenu({ email, orgName }: { email: string; orgName: string }) {
  return (
    <UserMenu email={email} subtitle={`Eviction Hub · ${orgName}`} onSignOut={signOut}>
      <DropdownMenuItem asChild>
        <Link href="/settings" className="no-underline">
          <Settings aria-hidden />
          <span className="flex-1">Settings</span>
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href="/settings/billing" className="no-underline">
          <CreditCard aria-hidden />
          <span className="flex-1">Billing</span>
        </Link>
      </DropdownMenuItem>
    </UserMenu>
  )
}
