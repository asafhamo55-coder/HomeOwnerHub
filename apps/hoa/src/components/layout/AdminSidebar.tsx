'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  ChartLine,
  ClipboardList,
  Home,
  LogOut,
  ScrollText,
  Shield,
} from 'lucide-react'
import {
  cn,
  SidebarBrand,
  SidebarFooter,
  SidebarNav,
  SidebarSection,
} from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

interface AdminSidebarProps {
  userEmail: string
}

interface NavLink {
  href: string
  icon: React.ReactNode
  label: string
}

const PLATFORM: NavLink[] = [
  { href: '/admin', icon: <Home className="h-4 w-4" />, label: 'Overview' },
  { href: '/admin/tenants', icon: <Building2 className="h-4 w-4" />, label: 'Tenants' },
  { href: '/admin/analytics', icon: <ChartLine className="h-4 w-4" />, label: 'Analytics' },
  { href: '/admin/audit', icon: <ClipboardList className="h-4 w-4" />, label: 'Audit log' },
  { href: '/admin/admins', icon: <Shield className="h-4 w-4" />, label: 'Platform admins' },
]

const RETURN: NavLink = {
  href: '/',
  icon: <ArrowLeft className="h-4 w-4" />,
  label: 'Back to HOA Hub',
}

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function SidebarLink({ link, active }: { link: NavLink; active: boolean }) {
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

export function AdminSidebar({ userEmail }: AdminSidebarProps) {
  const pathname = usePathname()

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <>
      <SidebarBrand>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive text-white">
          <ScrollText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-foreground">Platform</p>
          <p className="text-[11px] text-muted">HomeownerHub staff</p>
        </div>
      </SidebarBrand>

      <SidebarNav>
        <SidebarSection label="Platform">
          {PLATFORM.map((link) => (
            <SidebarLink key={link.href} link={link} active={isActive(pathname, link.href)} />
          ))}
        </SidebarSection>

        <SidebarSection label="Return">
          <SidebarLink link={RETURN} active={false} />
        </SidebarSection>
      </SidebarNav>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{userEmail}</p>
            <p className="text-[11px] text-muted">Platform admin</p>
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
