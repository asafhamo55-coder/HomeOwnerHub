'use client'

import { NavLink as Link } from '@/components/layout/NavLink'
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
  Upload,
} from 'lucide-react'
import {
  NavItem,
  SidebarBrand,
  SidebarFooter,
  SidebarNav,
  SidebarSection,
} from '@homeowner-portal/ui'
import { clearSessionCookiesOnSignOut } from '@/app/actions/sign-out'

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
  { href: '/admin/import-units', icon: <Upload className="h-4 w-4" />, label: 'Import units' },
]

const RETURN: NavLink = {
  href: '/',
  icon: <ArrowLeft className="h-4 w-4" />,
  label: 'Back to HomeownerHub',
}

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function SidebarLink({ link, active }: { link: NavLink; active: boolean }) {
  return <NavItem href={link.href} linkAs={Link} icon={link.icon} label={link.label} active={active} />
}

export function AdminSidebar({ userEmail }: AdminSidebarProps) {
  const pathname = usePathname()

  async function handleSignOut() {
    // Lazy: keeps @supabase/ssr + auth-js (~150 kB) out of every page's shared JS.
    const { getSupabaseBrowserClient } = await import('@/lib/supabase/browser')
    const supabase = getSupabaseBrowserClient()
    // Impersonation / role-override cookies are HTTPOnly: clear server-side.
    await clearSessionCookiesOnSignOut().catch(() => {})
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <>
      <SidebarBrand>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger-solid text-on-solid">
          <ScrollText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-foreground">Platform</p>
          <p className="text-xs text-muted">HomeownerHub staff</p>
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
        <div className="flex w-full items-center justify-between gap-2 px-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{userEmail}</p>
            <p className="text-xs text-muted">Platform admin</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center justify-center rounded-md p-1.5 text-muted coarse:min-h-11 coarse:min-w-11 hover:bg-subtle hover:text-foreground"
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
