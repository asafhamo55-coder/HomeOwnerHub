'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  CalendarClock,
  ClipboardList,
  FileText,
  Home,
  LogOut,
  Megaphone,
  MessageSquare,
  Scale,
  Sparkles,
  Wallet,
} from 'lucide-react'
import {
  cn,
  SidebarBrand,
  SidebarFooter,
  SidebarNav,
  SidebarSection,
} from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

interface ResidentSidebarProps {
  orgName: string
  userEmail: string
}

interface NavLink {
  href: string
  icon: React.ReactNode
  label: string
  soon?: boolean
}

const NAV: Array<{ label?: string; items: NavLink[] }> = [
  {
    items: [
      { href: '/resident', icon: <Home className="h-4 w-4" />, label: 'My Home' },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/resident/dues', icon: <Wallet className="h-4 w-4" />, label: 'Dues' },
      { href: '/resident/announcements', icon: <Megaphone className="h-4 w-4" />, label: 'Announcements' },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { href: '/resident/governing', icon: <FileText className="h-4 w-4" />, label: 'Governing Docs' },
      { href: '/resident/ask', icon: <Sparkles className="h-4 w-4" />, label: 'Ask the Docs' },
      { href: '/resident/legal', icon: <Scale className="h-4 w-4" />, label: 'State Law' },
    ],
  },
  {
    label: 'Submit',
    items: [
      { href: '/resident/arc/new', icon: <ClipboardList className="h-4 w-4" />, label: 'ARC Application', soon: true },
      { href: '/resident/report-violation', icon: <CalendarClock className="h-4 w-4" />, label: 'Report Violation', soon: true },
      { href: '/resident/tickets', icon: <MessageSquare className="h-4 w-4" />, label: 'My Tickets' },
    ],
  },
]

function isActive(pathname: string, href: string) {
  if (href === '/resident') return pathname === '/resident'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function ResidentNavLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <li>
      <Link
        href={link.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          active
            ? 'bg-primary/10 text-primary'
            : 'text-muted hover:bg-background hover:text-foreground',
        )}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">{link.icon}</span>
        <span className="flex-1 truncate">{link.label}</span>
        {link.soon ? (
          <span className="rounded-full bg-muted/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
            Soon
          </span>
        ) : null}
      </Link>
    </li>
  )
}

export function ResidentSidebar({ orgName, userEmail }: ResidentSidebarProps) {
  const pathname = usePathname()

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <>
      <SidebarBrand>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-fg">
          <BookOpen className="h-4 w-4" />
        </div>
        <span className="truncate">{orgName}</span>
      </SidebarBrand>

      <SidebarNav>
        {NAV.map((group, idx) => (
          <SidebarSection
            key={group.label ?? `group-${idx}`}
            {...(group.label ? { label: group.label } : {})}
          >
            {group.items.map((link) => (
              <ResidentNavLink
                key={link.href}
                link={link}
                active={isActive(pathname, link.href)}
              />
            ))}
          </SidebarSection>
        ))}
      </SidebarNav>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{userEmail}</p>
            <p className="text-[11px] text-muted">Resident · {orgName}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-md p-1.5 text-muted hover:bg-background hover:text-foreground"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </>
  )
}
