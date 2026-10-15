import * as React from 'react'
import { cn } from '../lib/cn'
import { BackLink } from './BackLink'

/**
 * The page container for board/admin/pm/eviction screens.
 *
 * Exists to stop two kinds of drift the UX audit found
 * (docs/specs/2026-10-15-enterprise-ux-plan.md, finding 8): content width
 * chosen per page (five different max-widths, so the title jumped
 * horizontally between sibling pages), and fifteen different `<h1>` class
 * strings. Width is one of three fixed values, and the page title is
 * rendered here and nowhere else.
 *
 * Not for the resident portal — that shell keeps its own mobile-first
 * `ScreenHeader` kit (decision 2 in the plan).
 */
export type PageWidth = 'narrow' | 'default' | 'wide'

const WIDTHS: Record<PageWidth, string> = {
  narrow: 'max-w-3xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
}

interface PageCommonProps {
  /** narrow = 3xl (forms, reading), default = 5xl (lists), wide = 7xl (dashboards). */
  width?: PageWidth
  /** Renders a BackLink above the title. */
  back?: { href: string; label?: React.ReactNode }
  /** Page-level sub-nav, typically a `<Tabs />`, rendered under the title. */
  tabs?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

interface PageWithTitle extends PageCommonProps {
  title: React.ReactNode
  description?: React.ReactNode
  /** Small uppercase label above the title ("Board record"). */
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
  header?: never
}

interface PageWithCustomHeader extends PageCommonProps {
  /**
   * Escape hatch for a header that is more than title + description (the
   * dashboard greeting). Whatever is passed MUST render the page's one
   * `<h1>` itself.
   */
  header: React.ReactNode
  title?: never
  description?: never
  eyebrow?: never
  actions?: never
}

export type PageProps = PageWithTitle | PageWithCustomHeader

export function Page(props: PageProps) {
  const { width = 'default', back, tabs, className, children } = props

  return (
    <div
      className={cn('mx-auto w-full space-y-6', WIDTHS[width], className)}
      data-page-width={width}
    >
      {back ? <BackLink href={back.href} label={back.label} /> : null}
      {props.header !== undefined ? (
        props.header
      ) : (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {props.eyebrow ? (
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                {props.eyebrow}
              </p>
            ) : null}
            <h1>{props.title}</h1>
            {props.description ? (
              <div className="text-sm text-muted">{props.description}</div>
            ) : null}
          </div>
          {props.actions ? (
            <div className="flex flex-wrap items-center gap-2">{props.actions}</div>
          ) : null}
        </header>
      )}
      {tabs ?? null}
      {children}
    </div>
  )
}
