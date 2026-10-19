'use client'

import * as React from 'react'
import { ChevronDown, ExternalLink, Building2, Gavel, Home as HomeIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './DropdownMenu'
import { OTHER_HUBS_ENABLED } from '../hubs'

export type HubType = 'hoa' | 'eviction' | 'pm'

export interface Hub {
  /** Stable identifier, drives the icon and the (current vs other) split. */
  type: HubType
  /** Display label, e.g. "HOA Hub" / "Eviction Hub" / "PM Hub". */
  label: string
  /** Absolute URL to that hub's dashboard. Pulled from NEXT_PUBLIC_*_URL env. */
  url: string
  /**
   * The user's org name in this hub, if any. Hubs the user has no org in
   * are still rendered (with a "Create" hint) so they can self-serve into
   * a second hub from the dropdown.
   */
  orgName?: string
}

interface HubSwitcherProps {
  current: HubType
  hubs: Hub[]
}

const ICONS: Record<HubType, React.ComponentType<{ className?: string }>> = {
  hoa: HomeIcon,
  eviction: Gavel,
  pm: Building2,
}

export function HubSwitcher({ current, hubs: allHubs }: HubSwitcherProps) {
  // BL-097: while the other hubs are unavailable, only the current hub is
  // offered — and a switcher with nothing to switch to is not rendered.
  const hubs = OTHER_HUBS_ENABLED ? allHubs : allHubs.filter((h) => h.type === current)
  const currentHub = hubs.find((h) => h.type === current)
  const CurrentIcon = ICONS[current]

  if (hubs.length < 2) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2 text-sm font-medium text-foreground-secondary transition-colors hover:bg-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-subtle"
          aria-label={`Switch hub (current: ${currentHub?.label ?? labelFor(current)})`}
          title={currentHub?.label ?? labelFor(current)}
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-primary-subtle text-primary">
            <CurrentIcon className="size-3.5" aria-hidden />
          </span>
          <span className="hidden bar-lg:inline">{currentHub?.label ?? labelFor(current)}</span>
          <ChevronDown className="size-3.5 text-muted" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuLabel>Switch hub</DropdownMenuLabel>
        {hubs.map((h) => {
          const Icon = ICONS[h.type]
          const isCurrent = h.type === current
          return (
            <DropdownMenuItem
              key={h.type}
              asChild={!isCurrent}
              disabled={isCurrent}
              className={cn('gap-3 py-2', isCurrent && 'data-[disabled]:opacity-100')}
            >
              {isCurrent ? (
                <HubRow icon={<Icon className="size-4" />} label={h.label} sub={`${h.orgName ?? 'Active'} · current`} current />
              ) : (
                <a href={h.url} className="no-underline">
                  <HubRow icon={<Icon className="size-4" />} label={h.label} sub={h.orgName ?? 'Sign in to set up'} />
                  <ExternalLink className="ml-auto size-3.5" aria-hidden />
                </a>
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function HubRow({ icon, label, sub, current }: { icon: React.ReactNode; label: string; sub: string; current?: boolean }) {
  return (
    <>
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:!text-current',
          current ? 'bg-primary-subtle text-primary' : 'bg-subtle text-muted',
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{label}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
    </>
  )
}

function labelFor(t: HubType): string {
  switch (t) {
    case 'hoa':
      return 'HOA Hub'
    case 'eviction':
      return 'Eviction Hub'
    case 'pm':
      return 'PM Hub'
  }
}
