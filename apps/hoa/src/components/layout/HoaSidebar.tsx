'use client'

import { NavLink as Link } from '@/components/layout/NavLink'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  BrandMark,
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
import {
  ADMIN_ACCOUNT,
  BOARD_ACCOUNT,
  HOA_NAV,
  NAV_FIRST_SEEN_KEY,
  NAV_MODE_KEY,
  activeNavHref,
  resolveNavMode,
  visibleNavLinks,
  type HoaNavLink,
  type NavMode,
} from './nav'

function isPromise<T>(v: T | Promise<T> | undefined): v is Promise<T> {
  return typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function'
}

interface HoaSidebarProps {
  currentOrgId: string
  currentOrgName: string
  hoaOrgs: UserHoaOrg[]
  /** All orgs the person belongs to; past 8 the switcher searches. */
  orgCount?: number
  role: 'admin' | 'board'
  /**
   * Count badges keyed by nav href (e.g. pending approvals). Null/absent = no
   * badge. A promise is how the server layout streams a slow count in without
   * blocking the page: the badge appears when it resolves.
   */
  badges?: Record<string, string | null> | Promise<Record<string, string | null>>
  /** BL-071: running version, resolved on the server by the layout. */
  version: AppVersionInfo
  /** BL-070: newest board What's new entry id, for the unread dot. */
  whatsNewLatestId?: string | null
}

export function HoaSidebar({ currentOrgId, currentOrgName, hoaOrgs, orgCount = 0, role, badges, version, whatsNewLatestId = null }: HoaSidebarProps) {
  const pathname = usePathname()
  const [resolvedBadges, setResolvedBadges] = useState<Record<string, string | null> | null>(
    badges && !isPromise(badges) ? badges : null,
  )
  useEffect(() => {
    if (!isPromise(badges)) {
      setResolvedBadges(badges ?? null)
      return
    }
    let live = true
    badges.then(
      (b) => {
        if (live) setResolvedBadges(b)
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [badges])
  const account = role === 'admin' ? ADMIN_ACCOUNT : BOARD_ACCOUNT
  const active = activeNavHref(pathname, [...HOA_NAV.flatMap((g) => g.items), ...account])

  // Per-user "basics only" choice. The first render uses the role default so
  // server and client markup match; the saved choice is applied after mount.
  const [mode, setMode] = useState<NavMode>(role === 'admin' ? 'all' : 'basics')
  useEffect(() => {
    let stored: string | null = null
    let firstSeen: number | null = null
    try {
      stored = window.localStorage.getItem(NAV_MODE_KEY)
      const raw = window.localStorage.getItem(NAV_FIRST_SEEN_KEY)
      if (raw) firstSeen = Number(raw)
      else window.localStorage.setItem(NAV_FIRST_SEEN_KEY, String(Date.now()))
    } catch {
      // Storage can be blocked; fall back to the role default.
    }
    setMode(resolveNavMode({ stored, role, firstSeen, now: Date.now() }))
  }, [role])
  function toggleMode() {
    const next: NavMode = mode === 'all' ? 'basics' : 'all'
    setMode(next)
    try {
      window.localStorage.setItem(NAV_MODE_KEY, next)
    } catch {
      // Not saved; the choice still applies until the page reloads.
    }
  }

  const item = (link: HoaNavLink) => {
    const Icon = link.icon
    return (
      <NavItem
        key={link.href}
        href={link.href}
        linkAs={Link}
        // Default (auto) prefetch: the shared layout only.
        // A full prefetch rendered all ~20 destinations on the server on
        // every page load (BL-074, navigation-perf-ratchet.test.ts).
        icon={<Icon aria-hidden />}
        label={link.label}
        badge={resolvedBadges?.[link.href] ?? undefined}
        active={active === link.href}
      />
    )
  }

  return (
    <>
      <SidebarBrand
        href="/"
        logo={<BrandMark className="size-8 rounded-lg shadow-xs" />}
      >
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-foreground">HomeownerHub</p>
          <OrgSwitcher currentOrgId={currentOrgId} currentOrgName={currentOrgName} orgs={hoaOrgs} orgCount={orgCount} />
        </div>
      </SidebarBrand>

      <SidebarNav>
        {HOA_NAV.map((group, idx) => {
          const links = visibleNavLinks(group.items, mode, active)
          if (links.length === 0) return null
          return (
            <SidebarSection key={group.label ?? `group-${idx}`} {...(group.label ? { label: group.label } : {})}>
              {links.map(item)}
            </SidebarSection>
          )
        })}
        <SidebarSection label="Account">{visibleNavLinks(account, mode, active).map(item)}</SidebarSection>
        <button
          type="button"
          onClick={toggleMode}
          className="mt-2 flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm font-medium text-foreground-secondary hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:in-rail:hidden"
        >
          {mode === 'all' ? 'Show only the basics' : 'Show all menu items'}
        </button>
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
