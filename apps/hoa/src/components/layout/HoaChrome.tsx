'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Gavel,
  LogOut,
  Mail,
  MessageSquare,
  Monitor,
  Moon,
  Settings,
  Sun,
  User,
  Users,
} from 'lucide-react'
import {
  CommandPalette,
  DropdownMenuItem,
  UserMenu,
  useTheme,
  type PaletteCommand,
  type PaletteSearchResult,
} from '@homeowner-portal/ui'
import { fetchRecordSearch } from '@/lib/search/client'
import type { RecordType } from '@/lib/search/types'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { clearSessionCookiesOnSignOut } from '@/app/actions/sign-out'
import { askGuideCommand, helpArticleCommands, type PaletteHelpArticle } from '@/components/guide/palette-help'
import { ADMIN_ACCOUNT, BOARD_ACCOUNT, HOA_CREATE, HOA_NAV } from './nav'

async function signOut() {
  const supabase = getSupabaseBrowserClient()
  // Impersonation / role-override cookies are HTTPOnly: clear server-side.
  await clearSessionCookiesOnSignOut().catch(() => {})
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

// Same icons as the sidebar entries for these areas (nav.ts).
const RECORD_ICON: Record<RecordType, typeof User> = {
  owner: User,
  property: Building2,
  violation: AlertTriangle,
  arc: ClipboardCheck,
  ticket: MessageSquare,
  thread: Mail,
  meeting: CalendarDays,
  motion: Gavel,
  document: FileText,
  vendor: Briefcase,
}

/**
 * ⌘K palette: every sidebar destination, quick-create actions, theme, sign
 * out — and records in the current org (BL-022) via /api/search, which is
 * board/admin-only and RLS-scoped. BL-070: a Help group of guide article
 * titles (with their keywords), and "Ask the guide: …" when nothing matches.
 */
export function HoaCommandPalette({ role, helpArticles = [] }: { role: 'admin' | 'board'; helpArticles?: PaletteHelpArticle[] }) {
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
      return { id: `new:${l.href}`, label: l.label, group: 'Create', href: l.href, icon: <Icon aria-hidden />, keywords: l.keywords }
    })
    const prefs: PaletteCommand[] = [
      { id: 'theme:light', label: 'Use light theme', group: 'Preferences', icon: <Sun aria-hidden />, onSelect: () => setTheme('light'), keywords: ['appearance'] },
      { id: 'theme:dark', label: 'Use dark theme', group: 'Preferences', icon: <Moon aria-hidden />, onSelect: () => setTheme('dark'), keywords: ['appearance', 'night'] },
      { id: 'theme:system', label: 'Match system theme', group: 'Preferences', icon: <Monitor aria-hidden />, onSelect: () => setTheme('system'), keywords: ['appearance', 'auto'] },
      { id: 'signout', label: 'Sign out', group: 'Preferences', icon: <LogOut aria-hidden />, onSelect: () => void signOut(), keywords: ['log out'] },
    ]
    const help = helpArticleCommands(helpArticles)
    return [...go, ...account, ...create, ...help, ...prefs]
  }, [role, setTheme, helpArticles])

  const search = useCallback(async (query: string, signal: AbortSignal): Promise<PaletteSearchResult> => {
    const { hits, notice } = await fetchRecordSearch(query, signal)
    return {
      notice,
      commands: hits.map((h) => {
        const Icon = RECORD_ICON[h.type]
        return { id: h.id, label: h.label, hint: h.hint, meta: h.detail, href: h.href, group: h.group, icon: <Icon aria-hidden /> }
      }),
    }
  }, [])

  const fallback = useCallback((query: string) => askGuideCommand(query, () => router.push('/help')), [router])

  return <CommandPalette commands={commands} search={search} fallback={fallback} onNavigate={(href) => router.push(href)} />
}
