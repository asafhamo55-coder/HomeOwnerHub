import * as React from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { cn } from '../lib/cn'

/**
 * PageHeader — the top of every board/admin/pm/eviction page: optional
 * breadcrumbs (or a back link), the page's ONE h1, a one-line
 * description, status meta, and right-aligned actions.
 *
 * Usually rendered for you by `<Page title=… />`. Use it directly only in
 * full-height layouts that cannot use Page (inbox, properties split pane).
 *
 * Actions: at most one primary Button, placed last. Everything else is
 * `secondary`/`ghost` or goes in a "⋯" DropdownMenu. On phones actions
 * wrap under the title.
 */

export interface Crumb {
  label: React.ReactNode
  href?: string
}

export interface BreadcrumbsProps {
  items: Crumb[]
  linkAs?: React.ElementType
  className?: string
}

export function Breadcrumbs({ items, linkAs: LinkAs = 'a', className }: BreadcrumbsProps) {
  if (items.length === 0) return null
  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0 print:hidden', className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted">
        {items.map((c, i) => {
          const last = i === items.length - 1
          return (
            <li key={i} className="flex min-w-0 items-center gap-1">
              {c.href && !last ? (
                <LinkAs
                  href={c.href}
                  className="truncate rounded no-underline transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {c.label}
                </LinkAs>
              ) : (
                <span className={cn('truncate', last && 'text-foreground-secondary')} aria-current={last ? 'page' : undefined}>
                  {c.label}
                </span>
              )}
              {last ? null : <ChevronRight className="size-3.5 shrink-0 text-muted/70" aria-hidden />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Small uppercase label above the title ("Board record"). */
  eyebrow?: React.ReactNode
  /** Trail above the title. The last crumb is the current page. */
  breadcrumbs?: Crumb[]
  /** A single "← Back to X" link. Ignored when `breadcrumbs` is set. */
  back?: { href: string; label?: React.ReactNode }
  /** Inline status next to the title (a StatusPill, a count). */
  meta?: React.ReactNode
  linkAs?: React.ElementType
  className?: string
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  breadcrumbs,
  back,
  meta,
  linkAs: LinkAs = 'a',
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <Breadcrumbs items={breadcrumbs} linkAs={LinkAs} />
      ) : back ? (
        <LinkAs
          href={back.href}
          className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-medium text-muted no-underline transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {back.label ?? 'Back'}
        </LinkAs>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1 space-y-1">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{eyebrow}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="min-w-0 break-words text-2xl font-semibold tracking-[-0.015em] text-foreground">{title}</h1>
            {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
          </div>
          {description ? (
            <div className="max-w-3xl text-sm text-muted">{description}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        ) : null}
      </div>
    </header>
  )
}
