'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CircleUser, CreditCard, Home, LayoutGrid, Sparkles } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'

// App-style bottom tab bar — the primary navigation for the resident
// portal on every viewport. Five destinations, large touch targets,
// active tab in the brand color. Fixed to the bottom with safe-area
// padding so it clears the iOS home indicator.

interface Tab {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Extra path prefixes that should also light this tab up. */
  match?: string[]
}

const TABS: Tab[] = [
  { href: '/resident', label: 'Home', icon: Home },
  { href: '/resident/dues', label: 'Dues', icon: CreditCard },
  {
    href: '/resident/requests',
    label: 'Requests',
    icon: LayoutGrid,
    match: ['/resident/tickets', '/resident/arc', '/resident/violations', '/resident/report-violation'],
  },
  { href: '/resident/ask', label: 'Ask', icon: Sparkles },
  {
    href: '/resident/account',
    label: 'Account',
    icon: CircleUser,
    match: ['/resident/announcements'],
  },
]

function tabActive(pathname: string, tab: Tab): boolean {
  if (tab.href === '/resident') return pathname === '/resident'
  const prefixes = [tab.href, ...(tab.match ?? [])]
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function ResidentTabBar() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-2xl items-stretch">
        {TABS.map((tab) => {
          const active = tabActive(pathname, tab)
          const Icon = tab.icon
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 no-underline transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                  active ? 'text-primary' : 'text-muted hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-12 items-center justify-center rounded-full transition-colors',
                    active && 'bg-primary/10',
                  )}
                >
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <span className="text-[11px] font-medium leading-none">{tab.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
