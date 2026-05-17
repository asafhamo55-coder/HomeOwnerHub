'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  CreditCard,
  Home,
  LogOut,
  Settings,
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

interface PmSidebarProps {
  orgName: string
  userEmail: string
}

interface NavLink {
  href: string
  icon: React.ReactNode
  label: string
}

const PRIMARY: NavLink[] = [
  { href: '/', icon: <Home className="h-4 w-4" />, label: 'Dashboard' },
  { href: '/setup', icon: <Building2 className="h-4 w-4" />, label: 'Property' },
  { href: '/rent', icon: <Wallet className="h-4 w-4" />, label: 'Rent' },
]

const SECONDARY: NavLink[] = [
  { href: '/settings', icon: <Settings className="h-4 w-4" />, label: 'Settings' },
  { href: '/settings/billing', icon: <CreditCard className="h-4 w-4" />, label: 'Billing' },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavLink({ link, active }: { link: NavLink; active: boolean }) {
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
      </Link>
    </li>
  )
}

export function PmSidebar({ orgName, userEmail }: PmSidebarProps) {
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
          <Home className="h-4 w-4" />
        </div>
        <span className="truncate">{orgName}</span>
      </SidebarBrand>

      <SidebarNav>
        <SidebarSection>
          {PRIMARY.map((link) => (
            <NavLink key={link.href} link={link} active={isActive(pathname, link.href)} />
          ))}
        </SidebarSection>

        <SidebarSection label="Account">
          {SECONDARY.map((link) => (
            <NavLink key={link.href} link={link} active={isActive(pathname, link.href)} />
          ))}
        </SidebarSection>
      </SidebarNav>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{userEmail}</p>
            <p className="text-[11px] text-muted">PM Hub · {orgName}</p>
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
