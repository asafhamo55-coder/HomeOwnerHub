import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * SkipLink — the first focusable element on every page. Hidden until it
 * receives keyboard focus, then jumps past the sidebar / top bar to the
 * `<main id="main">` landmark (WCAG 2.4.1 Bypass Blocks). Rendered for you
 * by `AppShell`; the resident portal layout renders its own.
 */
export function SkipLink({
  href = '#main',
  className,
  children = 'Skip to main content',
}: {
  href?: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <a
      href={href}
      className={cn(
        'sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-primary-fg focus:no-underline focus:shadow-lg',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background print:hidden',
        className,
      )}
    >
      {children}
    </a>
  )
}
