'use client'

import * as React from 'react'
import { cn } from '../lib/cn'
import { useAppShell } from '../layouts/AppShell'
import { SidebarContext } from '../layouts/sidebar-context'
import { Tooltip } from './Tooltip'

/**
 * Sidebar building blocks. Every nav entry is a `NavItem` so that active
 * state, icon size, row height, focus ring and the collapsed icon-rail
 * behave identically in every app.
 */

export function SidebarBrand({
  children,
  logo,
  className,
}: {
  /** Name / org switcher. Hidden when the sidebar is a rail. */
  children: React.ReactNode
  /** Square mark shown in both expanded and rail modes. */
  logo?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-topbar shrink-0 items-center gap-2.5 px-3 text-sm font-semibold text-foreground',
        'md:in-rail:justify-center md:in-rail:px-0',
        className,
      )}
    >
      {logo ? <div className="shrink-0">{logo}</div> : null}
      <div className={cn('flex min-w-0 flex-1 items-center gap-2.5', logo && 'md:in-rail:hidden')}>{children}</div>
    </div>
  )
}

export function SidebarNav({
  children,
  className,
  'aria-label': ariaLabel = 'Sidebar',
}: {
  children: React.ReactNode
  className?: string
  'aria-label'?: string
}) {
  return (
    <nav
      className={cn('flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden px-3 py-3 scrollbar-none md:in-rail:px-2', className)}
      aria-label={ariaLabel}
    >
      {children}
    </nav>
  )
}

export interface NavItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  icon?: React.ReactNode
  label: string
  /** Count or short marker on the right (e.g. unread). Becomes a dot in the rail. */
  badge?: React.ReactNode
  active?: boolean
  /** Router link component. Defaults to AppShell's `linkAs`, then <a>. */
  linkAs?: React.ElementType
  /** Next.js-style prefetch flag, forwarded to `linkAs`. */
  prefetch?: boolean
}

export const NavItem = React.forwardRef<HTMLAnchorElement, NavItemProps>(
  ({ icon, label, badge, active, className, children, linkAs, ...props }, ref) => {
    const shell = useAppShell()
    const { collapsible } = React.useContext(SidebarContext)
    const LinkAs: React.ElementType = linkAs ?? shell?.linkAs ?? 'a'
    const inRail = Boolean(shell?.collapsed && collapsible)
    const hasBadge = badge !== undefined && badge !== null && badge !== false && badge !== 0

    const link = (
      <LinkAs
        ref={ref}
        className={cn(
          'group/nav relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium no-underline outline-none transition-colors duration-fast md:h-8',
          'focus-visible:ring-2 focus-visible:ring-ring',
          '[&_svg]:size-4 [&_svg]:shrink-0',
          active
            ? 'bg-subtle text-foreground [&_svg]:text-primary'
            : 'text-foreground-secondary hover:bg-subtle hover:text-foreground [&_svg]:text-muted hover:[&_svg]:text-foreground-secondary',
          'md:in-rail:justify-center md:in-rail:px-0',
          className,
        )}
        aria-current={active ? 'page' : undefined}
        {...props}
      >
        {active ? (
          <span aria-hidden className="absolute inset-y-1.5 -left-3 w-[3px] rounded-r-full bg-primary md:in-rail:-left-2" />
        ) : null}
        {icon ? <span className="flex size-5 shrink-0 items-center justify-center">{icon}</span> : null}
        <span className="flex-1 truncate md:in-rail:sr-only">{label}</span>
        {hasBadge ? (
          <>
            <span className="num ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary-subtle px-1.5 text-xs font-semibold text-primary md:in-rail:hidden">
              {badge}
            </span>
            <span aria-hidden className="absolute right-1.5 top-1.5 hidden size-1.5 rounded-full bg-primary md:in-rail:block" />
          </>
        ) : null}
        {children}
      </LinkAs>
    )

    return (
      <li>
        <Tooltip content={label} side="right" disabled={!inRail}>
          {link}
        </Tooltip>
      </li>
    )
  },
)
NavItem.displayName = 'NavItem'

export function SidebarFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 border-t border-border p-2',
        'md:in-rail:flex-col md:in-rail:px-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SidebarSection({
  label,
  children,
  className,
}: {
  label?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label ? (
        <>
          <p className="px-2.5 pb-1 text-xs font-medium text-muted md:in-rail:hidden">{label}</p>
          <div aria-hidden className="mx-2 mb-1 hidden h-px bg-border md:in-rail:block" />
        </>
      ) : null}
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  )
}
