'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CreditCard, Gavel, ScrollText, Settings } from 'lucide-react'
import {
  NavItem,
  SidebarBrand,
  SidebarCollapseToggle,
  SidebarFooter,
  SidebarNav,
  SidebarSection,
} from '@homeowner-portal/ui'

interface NavLink {
  href: string
  icon: React.ReactNode
  label: string
}

const PRIMARY: NavLink[] = [
  { href: '/', icon: <ScrollText aria-hidden />, label: 'Cases' },
]

const SECONDARY: NavLink[] = [
  { href: '/settings', icon: <Settings aria-hidden />, label: 'Settings' },
  { href: '/settings/billing', icon: <CreditCard aria-hidden />, label: 'Billing' },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname.startsWith('/cases')
  // /settings must not light up while on /settings/billing.
  if (href === '/settings') return pathname === '/settings'
  return pathname === href || pathname.startsWith(`${href}/`)
}

// Identity, theme and sign-out live in the top-bar user menu
// (EvictionUserMenu); the sidebar is navigation only, so it can collapse to a rail.
export function EvictionSidebar({ orgName }: { orgName: string }) {
  const pathname = usePathname()

  return (
    <>
      <SidebarBrand
        logo={
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-fg">
            <Gavel className="size-4" aria-hidden />
          </span>
        }
      >
        <span className="min-w-0">
          <span className="block truncate leading-tight">Eviction Hub</span>
          <span className="block truncate text-xs font-normal text-muted">{orgName}</span>
        </span>
      </SidebarBrand>

      <SidebarNav>
        <SidebarSection>
          {PRIMARY.map((link) => (
            <NavItem
              key={link.href}
              href={link.href}
              linkAs={Link}
              icon={link.icon}
              label={link.label}
              active={isActive(pathname, link.href)}
            />
          ))}
        </SidebarSection>
        <SidebarSection label="Account">
          {SECONDARY.map((link) => (
            <NavItem
              key={link.href}
              href={link.href}
              linkAs={Link}
              icon={link.icon}
              label={link.label}
              active={isActive(pathname, link.href)}
            />
          ))}
        </SidebarSection>
      </SidebarNav>

      <SidebarFooter>
        <SidebarCollapseToggle className="ml-auto" />
      </SidebarFooter>
    </>
  )
}
