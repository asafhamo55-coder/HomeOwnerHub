import * as React from 'react'
import { cn } from '../lib/cn'
import { PageHeader, type Crumb } from './PageHeader'
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
  /** Renders a back link above the title (ignored when `breadcrumbs` is set). */
  back?: { href: string; label?: React.ReactNode }
  /** Router link component for back/breadcrumb links (e.g. next/link). */
  linkAs?: React.ElementType
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
  /** Trail above the title; the last crumb is this page. */
  breadcrumbs?: Crumb[]
  /** Inline status next to the title (a StatusPill, a count). */
  meta?: React.ReactNode
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
  breadcrumbs?: never
  meta?: never
}

export type PageProps = PageWithTitle | PageWithCustomHeader

export function Page(props: PageProps) {
  const { width = 'default', back, tabs, className, children, linkAs } = props

  return (
    <div
      className={cn('mx-auto w-full space-y-6', WIDTHS[width], className)}
      data-page-width={width}
    >
      {props.header !== undefined ? (
        <>
          {back ? <BackLink href={back.href} label={back.label} linkAs={linkAs} /> : null}
          {props.header}
        </>
      ) : (
        <PageHeader
          title={props.title}
          description={props.description}
          eyebrow={props.eyebrow}
          actions={props.actions}
          breadcrumbs={props.breadcrumbs}
          meta={props.meta}
          back={back}
          linkAs={linkAs}
        />
      )}
      {tabs ?? null}
      {children}
    </div>
  )
}
