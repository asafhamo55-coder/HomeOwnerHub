'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { LogOut, Monitor, Moon, Settings, Sun, Users } from 'lucide-react'
import {
  CommandPalette,
  DropdownMenuItem,
  UserMenu,
  useTheme,
  type PaletteCommand,
} from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { ADMIN_ACCOUNT, BOARD_ACCOUNT, HOA_CREATE, HOA_NAV } from './nav'

async function signOut() {
  const supabase = getSupabaseBrowserClient()
  await supabase.auth.signOut()
  window.location.href = '/login'
}

/** Top-bar account menu for board/admin users. */
export function HoaUserMenu({
  email,
  role,
  orgName,
}: {
  email: string
  role: 'admin' | 'board'
  orgName: string
}) {
  return (
    <UserMenu email={email} subtitle={`${role === 'admin' ? 'Admin' : 'Board'} · ${orgName}`} onSignOut={signOut}>
      {role === 'admin' ? (
        <DropdownMenuItem asChild>
          <Link href="/settings" className="no-underline">
            <Settings aria-hidden />
            <span className="flex-1">Settings</span>
          </Link>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem asChild>
        <Link href="/settings/members" className="no-underline">
          <Users aria-hidden />
          <span className="flex-1">Members</span>
        </Link>
      </DropdownMenuItem>
    </UserMenu>
  )
}

/** ⌘K palette: every sidebar destination, quick-create actions, theme, sign out. */
export function HoaCommandPalette({ role }: { role: 'admin' | 'board' }) {
  const router = useRouter()
  const { setTheme } = useTheme()

  const commands = useMemo<PaletteCommand[]>(() => {
    const go: PaletteCommand[] = HOA_NAV.flatMap((g) =>
      g.items.map((l) => {
        const Icon = l.icon
        return {
          id: `go:${l.href}`,
          label: l.label,
          group: 'Go to',
          href: l.href,
          icon: <Icon aria-hidden />,
          keywords: l.keywords,
          hint: g.label,
        }
      }),
    )
    const account: PaletteCommand[] = (role === 'admin' ? ADMIN_ACCOUNT : BOARD_ACCOUNT).map((l) => {
      const Icon = l.icon
      return { id: `go:${l.href}`, label: l.label, group: 'Go to', href: l.href, icon: <Icon aria-hidden />, keywords: l.keywords, hint: 'Account' }
    })
    const create: PaletteCommand[] = HOA_CREATE.map((l) => {
      const Icon = l.icon
      return { id: `new:${l.href}`, label: l.label, group: 'Create', href: l.href, icon: <Icon aria-hidden /> }
    })
    const prefs: PaletteCommand[] = [
      { id: 'theme:light', label: 'Use light theme', group: 'Preferences', icon: <Sun aria-hidden />, onSelect: () => setTheme('light'), keywords: ['appearance'] },
      { id: 'theme:dark', label: 'Use dark theme', group: 'Preferences', icon: <Moon aria-hidden />, onSelect: () => setTheme('dark'), keywords: ['appearance', 'night'] },
      { id: 'theme:system', label: 'Match system theme', group: 'Preferences', icon: <Monitor aria-hidden />, onSelect: () => setTheme('system'), keywords: ['appearance', 'auto'] },
      { id: 'signout', label: 'Sign out', group: 'Preferences', icon: <LogOut aria-hidden />, onSelect: () => void signOut(), keywords: ['log out'] },
    ]
    return [...go, ...account, ...create, ...prefs]
  }, [role, setTheme])

  return <CommandPalette commands={commands} onNavigate={(href) => router.push(href)} />
}
