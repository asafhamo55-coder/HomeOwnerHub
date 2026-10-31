'use client'

import { NavLink as Link } from '@/components/layout/NavLink'
import { usePathname } from 'next/navigation'
import { Calculator, FolderOpen, Gavel, Inbox, type LucideIcon } from 'lucide-react'
import { BrandMark, NavItem, SidebarBrand, SidebarFooter, SidebarNav, SidebarSection } from '@homeowner-portal/ui'
import { proNav, type ProRole } from '@/lib/professionals/model'

const ICON: Record<string, LucideIcon> = {
  '/pro/accounting': Calculator,
  '/pro/matters': Gavel,
  '/pro/counsel': FolderOpen,
  '/pro/submissions': Inbox,
}

/** The sidebar for an outside professional: only what their role can use (BL-168). */
export function ProSidebar({ role, orgName, general }: { role: ProRole; orgName: string; general: boolean }) {
  const pathname = usePathname()
  const links = proNav(role, { general })
  return (
    <>
      <SidebarBrand logo={<BrandMark className="size-8 rounded-lg shadow-xs" />}>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-foreground">HomeownerHub</p>
          <p className="truncate text-xs text-foreground-secondary">{orgName}</p>
        </div>
      </SidebarBrand>
      <SidebarNav>
        <SidebarSection label={role === 'cpa' ? 'CPA access' : 'Attorney access'}>
          {links.map((l) => {
            const Icon = ICON[l.href] ?? Inbox
            return (
              <NavItem
                key={l.href}
                href={l.href}
                linkAs={Link}
                icon={<Icon aria-hidden />}
                label={l.label}
                active={pathname === l.href || pathname.startsWith(`${l.href}/`)}
              />
            )
          })}
        </SidebarSection>
      </SidebarNav>
      <SidebarFooter>
        <span className="px-1.5 text-xs text-foreground-secondary">Read-only. Changes go to the board for approval.</span>
      </SidebarFooter>
    </>
  )
}
