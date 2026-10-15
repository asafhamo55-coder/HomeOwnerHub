import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'

// Consumer-grade building blocks for the resident portal (plan decision 2:
// residents keep a mobile-first kit, not the board <Page>). These give
// every resident screen the same app-like language — a large title, inset
// grouped lists, soft icon tiles — so the portal reads as a phone app
// rather than the dense admin dashboard. Design-system v2 tokens only:
// radii md/lg/xl/full, text-xs/sm/base, semantic colours.

export function ScreenHeader({
  title,
  subtitle,
  action,
  back,
  meta,
  className,
}: {
  title: string
  subtitle?: React.ReactNode
  /** One action, right-aligned (usually a small "New" button). */
  action?: React.ReactNode
  /** A one-level "back" affordance above the title (detail screens). */
  back?: { href: string; label: string }
  /** Inline status/category pills under the title. */
  meta?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('space-y-2', className)}>
      {back ? (
        <Link
          href={back.href}
          className="-ml-1.5 inline-flex h-8 items-center gap-0.5 rounded-lg pl-0.5 pr-2 text-sm font-medium text-primary no-underline transition-colors duration-fast hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-5" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground [overflow-wrap:anywhere]">
            {title}
          </h1>
          {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-1.5">{meta}</div> : null}
    </header>
  )
}

export function SectionLabel({
  children,
  aside,
}: {
  children: React.ReactNode
  /** Right-aligned link or count on the label row. */
  aside?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {aside ? <div className="text-sm">{aside}</div> : null}
    </div>
  )
}

/** A screen section: label + content, consistent spacing. */
export function Section({
  label,
  aside,
  children,
  className,
}: {
  label: React.ReactNode
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-2.5', className)}>
      <SectionLabel aside={aside}>{label}</SectionLabel>
      {children}
    </section>
  )
}

// Soft rounded tile that holds a lucide icon. `tone` picks the accent.
const TONES = {
  // Design-system v2 tokens: AA-checked in light and dark (tokens.test.ts).
  primary: 'bg-primary-subtle text-primary',
  amber: 'bg-warning-subtle text-warning',
  emerald: 'bg-success-subtle text-success',
  rose: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
  ai: 'bg-accent-subtle text-accent-fg',
  slate: 'bg-subtle text-foreground-secondary',
} as const

export type Tone = keyof typeof TONES

export function IconTile({
  icon,
  tone = 'primary',
  size = 'md',
  className,
}: {
  icon: React.ReactNode
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        size === 'sm' && 'size-8 rounded-lg [&_svg]:size-4',
        size === 'md' && 'size-10 rounded-xl [&_svg]:size-5',
        size === 'lg' && 'size-14 rounded-xl [&_svg]:size-6',
        TONES[tone],
        className,
      )}
      aria-hidden
    >
      {icon}
    </span>
  )
}

/**
 * Inset grouped list (iOS Settings style): one rounded surface, rows
 * separated by hairlines. Put `TappableRow`s inside.
 */
export function RowGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface',
        // Rows inside a group drop their own card chrome.
        '[&>*]:rounded-none [&>*]:border-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

// The core list pattern: a large tappable row with a leading icon tile,
// a title + optional subtitle, an optional trailing node (status/value),
// and a chevron. Renders as a link when `href` is given. Standalone it is
// a card; inside a RowGroup it is a grouped row.
export function TappableRow({
  icon,
  tone,
  title,
  subtitle,
  trailing,
  status,
  href,
  className,
}: {
  icon?: React.ReactNode
  tone?: Tone
  title: React.ReactNode
  subtitle?: React.ReactNode
  trailing?: React.ReactNode
  /** A status pill shown on its own line under the title, so long titles
   *  keep the full row width on phones. */
  status?: React.ReactNode
  href?: string
  className?: string
}) {
  const inner = (
    <>
      {icon ? <IconTile icon={icon} tone={tone} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
        {subtitle ? <span className="mt-0.5 block truncate text-xs text-muted">{subtitle}</span> : null}
        {status ? <span className="mt-1.5 flex">{status}</span> : null}
      </span>
      {trailing ? <span className="flex shrink-0 items-center gap-2">{trailing}</span> : null}
      {href ? <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden /> : null}
    </>
  )

  const base = cn(
    'flex min-h-16 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3',
    href && 'transition-colors duration-fast hover:bg-subtle active:bg-subtle',
    className,
  )

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          'no-underline focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        )}
      >
        {inner}
      </Link>
    )
  }
  return <div className={base}>{inner}</div>
}

// Friendly, centered empty state that matches the portal's language
// (rather than the admin dashed-border EmptyState).
export function ScreenEmpty({
  icon,
  title,
  description,
  action,
  tone = 'primary',
}: {
  icon: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  tone?: Tone
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-10 text-center">
      <IconTile icon={icon} tone={tone} size="lg" />
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        {description ? <p className="mx-auto max-w-sm text-sm text-muted">{description}</p> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}

// A soft rounded surface used to group rows or hold freeform content.
export function Panel({
  children,
  className,
  title,
  icon,
}: {
  children: React.ReactNode
  className?: string
  /** Optional heading row inside the panel. */
  title?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface p-4', className)}>
      {title ? (
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground [&_svg]:size-4 [&_svg]:text-muted">
          {icon}
          {title}
        </h2>
      ) : null}
      {children}
    </div>
  )
}

const HERO_TONES = {
  danger: 'border-danger/20 bg-danger-subtle',
  warning: 'border-warning/25 bg-warning-subtle',
  success: 'border-success/20 bg-success-subtle',
  neutral: 'border-border bg-surface',
} as const

/**
 * The one big status block at the top of a screen (account standing,
 * balance). Tinted by tone; a link when `href` is given.
 */
export function Hero({
  tone,
  eyebrow,
  value,
  title,
  description,
  icon,
  href,
  footer,
}: {
  tone: keyof typeof HERO_TONES
  eyebrow?: React.ReactNode
  /** Large figure (money). */
  value?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  href?: string
  /** Bottom line, e.g. "2 past-due charges · View dues". */
  footer?: React.ReactNode
}) {
  const body = (
    <div className="flex items-start gap-3.5">
      {icon ? (
        <IconTile
          icon={icon}
          tone={tone === 'danger' ? 'rose' : tone === 'warning' ? 'amber' : tone === 'success' ? 'emerald' : 'primary'}
          className="bg-surface/70"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="text-sm font-medium text-foreground-secondary">{eyebrow}</p> : null}
        {value ? (
          <p className="num mt-0.5 text-4xl font-semibold tracking-tight text-foreground">{value}</p>
        ) : null}
        {title ? <p className="text-base font-semibold text-foreground">{title}</p> : null}
        {description ? <p className="mt-0.5 text-sm text-foreground-secondary">{description}</p> : null}
        {footer ? (
          <p className="mt-3 flex items-center gap-1 text-sm font-medium text-foreground">
            {footer}
            {href ? <ChevronRight className="size-4" aria-hidden /> : null}
          </p>
        ) : null}
      </div>
    </div>
  )
  const cls = cn('block rounded-xl border p-5', HERO_TONES[tone])
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          cls,
          'no-underline transition-[filter] duration-fast hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        {body}
      </Link>
    )
  }
  return <div className={cls}>{body}</div>
}
