'use client'

import Link from 'next/link'
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@homeowner-portal/ui'
import { MENU_FILTER_LABELS, type MenuFilter } from '@/lib/properties/list-params'
import type { PropertyFilterCounts } from '@/lib/properties/list-view'

const GROUPS: Array<{ label: string; keys: MenuFilter[] }> = [
  { label: 'Records', keys: ['incomplete', 'waiting'] },
  { label: 'Tenure', keys: ['owner_occupied', 'leased', 'unknown'] },
]

/** The "Filters" menu: each item is a link, so the filter stays a URL. */
export function PropertyFilterMenu({
  active,
  counts,
  hrefs,
}: {
  active: MenuFilter | null
  counts: PropertyFilterCounts | null
  hrefs: Record<MenuFilter, string>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" icon={<SlidersHorizontal aria-hidden />} iconRight={<ChevronDown aria-hidden />}>
          Filters
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem]">
        {GROUPS.map((g, i) => (
          <div key={g.label}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
            {g.keys.map((k) => (
              <DropdownMenuItem key={k} asChild>
                <Link href={hrefs[k]} aria-current={active === k ? 'true' : undefined} className="no-underline">
                  <span className="inline-flex size-4 items-center justify-center">
                    {active === k ? <Check className="!text-primary" aria-hidden /> : null}
                  </span>
                  <span className="flex-1 truncate text-foreground">{MENU_FILTER_LABELS[k]}</span>
                  {counts ? <span className="num text-xs text-muted">{counts[k]}</span> : null}
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
