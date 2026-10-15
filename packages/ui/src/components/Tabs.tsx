import * as React from 'react'
import { cn } from '../lib/cn'

// Underline tabs used as in-page sub-nav (e.g. /vendors with Active /
// Invitations / Approval Queue / RFPs sub-pages). Each tab is a LINK —
// it changes the URL. For switching panels without navigation, use
// `TabGroup` (TabGroup.tsx). Active state is driven by the caller passing
// the current pathname or an explicit `active` flag — keeps this RSC-safe.

export interface TabItem {
  label: string
  href: string
  badge?: string | number | null
  /** When provided, overrides the pathname-prefix match. */
  active?: boolean
}

export interface TabsProps {
  items: TabItem[]
  /** Used to compute active state when `item.active` is not set. */
  currentPath?: string
  className?: string
  'aria-label'?: string
  /** Router link component (e.g. next/link). Defaults to a plain <a>. */
  linkAs?: React.ElementType
}

function isActive(item: TabItem, currentPath?: string): boolean {
  if (typeof item.active === 'boolean') return item.active
  if (!currentPath) return false
  if (item.href === currentPath) return true
  // Treat /vendors as active for /vendors and /vendors/<id> but not
  // /vendors/invitations.
  return currentPath.startsWith(`${item.href}/`)
}

export function Tabs({ items, currentPath, className, linkAs: LinkAs = 'a', ...aria }: TabsProps) {
  return (
    <nav
      aria-label={aria['aria-label'] ?? 'Page sections'}
      className={cn('-mx-1 overflow-x-auto scrollbar-none border-b border-border sm:mx-0', className)}
    >
      <div className="flex min-w-max items-end gap-1 px-1 sm:px-0">
        {items.map((item) => {
          const active = isActive(item, currentPath)
          return (
            <LinkAs
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative -mb-px inline-flex h-10 items-center gap-2 rounded-t-md border-b-2 px-3 text-sm font-medium no-underline transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted hover:border-border-strong hover:text-foreground',
              )}
            >
              <span>{item.label}</span>
              {item.badge != null && item.badge !== '' && item.badge !== 0 ? (
                <span
                  className={cn(
                    'num inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold leading-none',
                    active ? 'bg-primary-subtle text-primary' : 'bg-subtle text-muted',
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
            </LinkAs>
          )
        })}
      </div>
    </nav>
  )
}
