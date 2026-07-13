'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  CalendarHeart,
  ClipboardCheck,
  CreditCard,
  FileText,
  Home,
  KeyRound,
  LogOut,
  Megaphone,
  MessageSquare,
  Scale,
  ScrollText,
  Settings,
  Sparkles,
  Users,
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
import { OrgSwitcher } from '@/components/layout/OrgSwitcher'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import type { UserHoaOrg } from '@/lib/orgs'

interface HoaSidebarProps {
  currentOrgId: string
  currentOrgName: string
  hoaOrgs: UserHoaOrg[]
  userEmail: string
  role: 'admin' | 'board'
}

interface NavLink {
  href: string
  icon: React.ReactNode
  label: string
  soon?: boolean
}

interface NavGroup {
  label?: string
  items: NavLink[]
}

// Sidebar IA: 5 labeled sections + Account. Items that used to live as
// flat siblings (Vendor Invitations, Vendor Queue, RFPs, AI Approval
// Queue, Governing Docs) now live as page-level tabs inside their
// parent and are reachable via the parent's link here.
const GROUPS: NavGroup[] = [
  {
    items: [
      { href: '/', icon: <Home className="h-4 w-4" />, label: 'Dashboard' },
      { href: '/ai/ask', icon: <Sparkles className="h-4 w-4" />, label: 'Ask the Docs' },
    ],
  },
  {
    label: 'Community',
    items: [
      { href: '/properties', icon: <Building2 className="h-4 w-4" />, label: 'Properties' },
      { href: '/leases', icon: <KeyRound className="h-4 w-4" />, label: 'Leases' },
      { href: '/violations', icon: <AlertTriangle className="h-4 w-4" />, label: 'Violations' },
      { href: '/arc', icon: <ClipboardCheck className="h-4 w-4" />, label: 'ARC review' },
      { href: '/meetings', icon: <CalendarDays className="h-4 w-4" />, label: 'Meetings' },
      { href: '/events', icon: <CalendarHeart className="h-4 w-4" />, label: 'Events' },
      { href: '/communications', icon: <Megaphone className="h-4 w-4" />, label: 'Communications' },
      { href: '/tickets', icon: <MessageSquare className="h-4 w-4" />, label: 'Tickets' },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/dues', icon: <Wallet className="h-4 w-4" />, label: 'Dues' },
      { href: '/accounting', icon: <Calculator className="h-4 w-4" />, label: 'Accounting' },
    ],
  },
  {
    label: 'Vendors',
    items: [
      { href: '/vendors', icon: <Briefcase className="h-4 w-4" />, label: 'Vendors' },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { href: '/documents', icon: <FileText className="h-4 w-4" />, label: 'Documents' },
      { href: '/legal', icon: <Scale className="h-4 w-4" />, label: 'State Law' },
    ],
  },
]

const ADMIN_ACCOUNT: NavLink[] = [
  { href: '/settings', icon: <Settings className="h-4 w-4" />, label: 'Settings' },
  { href: '/settings/members', icon: <Users className="h-4 w-4" />, label: 'Members' },
  { href: '/settings/billing', icon: <CreditCard className="h-4 w-4" />, label: 'Billing' },
]

const BOARD_ACCOUNT: NavLink[] = [
  { href: '/settings/members', icon: <Users className="h-4 w-4" />, label: 'Members' },
  { href: '/settings/billing', icon: <CreditCard className="h-4 w-4" />, label: 'Billing' },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function HoaNavLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <li>
      <Link
        href={link.href}
        prefetch={true}
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

export function HoaSidebar({
  currentOrgId,
  currentOrgName,
  hoaOrgs,
  userEmail,
  role,
}: HoaSidebarProps) {
  const pathname = usePathname()

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <>
      <SidebarBrand>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-fg">
          <ScrollText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-foreground">HOA Hub</p>
          <OrgSwitcher
            currentOrgId={currentOrgId}
            currentOrgName={currentOrgName}
            orgs={hoaOrgs}
          />
        </div>
      </SidebarBrand>

      <SidebarNav>
        {GROUPS.map((group, idx) => (
          <SidebarSection
            key={group.label ?? `group-${idx}`}
            {...(group.label ? { label: group.label } : {})}
          >
            {group.items.map((link) => (
              <HoaNavLink
                key={link.href}
                link={link}
                active={isActive(pathname, link.href)}
              />
            ))}
          </SidebarSection>
        ))}

        <SidebarSection label="Account">
          {(role === 'admin' ? ADMIN_ACCOUNT : BOARD_ACCOUNT).map((link) => (
            <HoaNavLink
              key={link.href}
              link={link}
              active={isActive(pathname, link.href)}
            />
          ))}
        </SidebarSection>
      </SidebarNav>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{userEmail}</p>
            <p className="truncate text-[11px] text-muted">HOA Hub · {currentOrgName}</p>
          </div>
          <ThemeToggle className="rounded-md p-1.5 text-muted hover:bg-background hover:text-foreground" />
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
