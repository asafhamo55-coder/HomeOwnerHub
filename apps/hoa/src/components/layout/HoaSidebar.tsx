'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ScrollText } from 'lucide-react'
import {
  NavItem,
  SidebarBrand,
  SidebarCollapseToggle,
  SidebarFooter,
  SidebarNav,
  SidebarSection,
} from '@homeowner-portal/ui'
import { OrgSwitcher } from '@/components/layout/OrgSwitcher'
import { WhatsNewVersionLink } from '@/components/layout/WhatsNewVersionLink'
import type { UserHoaOrg } from '@/lib/orgs'
import type { AppVersion as AppVersionInfo } from '@/lib/app-version'
import { ADMIN_ACCOUNT, BOARD_ACCOUNT, HOA_NAV, isActive, type HoaNavLink } from './nav'

interface HoaSidebarProps {
  currentOrgId: string
  currentOrgName: string
  hoaOrgs: UserHoaOrg[]
  role: 'admin' | 'board'
  /** Count badges keyed by nav href (e.g. pending approvals). Null/absent = no badge. */
  badges?: Record<string, string | null>
  /** BL-071: running version, resolved on the server by the layout. */
  version: AppVersionInfo
  /** BL-070: newest board What's new entry id, for the unread dot. */
  whatsNewLatestId?: string | null
}

/** The single most specific nav href that matches — so /settings/members
 *  lights "Members", not also "Settings". */
function bestMatch(pathname: string, links: HoaNavLink[]): string | null {
  let best: string | null = null
  for (const l of links) {
    if (isActive(pathname, l.href) && (!best || l.href.length > best.length)) best = l.href
  }
  return best
}

export function HoaSidebar({ currentOrgId, currentOrgName, hoaOrgs, role, badges, version, whatsNewLatestId = null }: HoaSidebarProps) {
  const pathname = usePathname()
  const account = role === 'admin' ? ADMIN_ACCOUNT : BOARD_ACCOUNT
  const active = bestMatch(pathname, [...HOA_NAV.flatMap((g) => g.items), ...account])

  const item = (link: HoaNavLink) => {
    const Icon = link.icon
    return (
      <NavItem
        key={link.href}
        href={link.href}
        linkAs={Link}
        // Default (auto) prefetch: down to the loading.tsx skeleton only.
        // A full prefetch rendered all ~20 destinations on the server on
        // every page load (BL-074, navigation-perf-ratchet.test.ts).
        icon={<Icon aria-hidden />}
        label={link.label}
        badge={badges?.[link.href] ?? undefined}
        active={active === link.href}
      />
    )
  }

  return (
    <>
      <SidebarBrand
        logo={
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-fg shadow-xs">
            <ScrollText className="size-4" aria-hidden />
          </div>
        }
      >
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-foreground">HOA Hub</p>
          <OrgSwitcher currentOrgId={currentOrgId} currentOrgName={currentOrgName} orgs={hoaOrgs} />
        </div>
      </SidebarBrand>

      <SidebarNav>
        {HOA_NAV.map((group, idx) => (
          <SidebarSection key={group.label ?? `group-${idx}`} {...(group.label ? { label: group.label } : {})}>
            {group.items.map(item)}
          </SidebarSection>
        ))}
        <SidebarSection label="Account">{account.map(item)}</SidebarSection>
      </SidebarNav>

      {/* Same sidebar is the mobile drawer, so the version shows in both.
          In the collapsed rail only the toggle remains. */}
      <SidebarFooter className="justify-between">
        <WhatsNewVersionLink version={version} latestId={whatsNewLatestId} className="min-w-0 truncate px-1.5 md:in-rail:hidden" />
        <SidebarCollapseToggle />
      </SidebarFooter>
    </>
  )
}
