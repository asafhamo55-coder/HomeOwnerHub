import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'

// Consumer-grade building blocks for the resident portal. These give
// every resident screen the same warm, app-like language — big friendly
// headings, rounded tappable rows, soft icon tiles — so the portal reads
// as a phone app rather than the dense admin dashboard.

export function ScreenHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string
  subtitle?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle ? <p className="text-[15px] leading-snug text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{children}</h2>
  )
}

// Soft rounded tile that holds a lucide icon. `tone` picks the accent.
const TONES = {
  primary: 'bg-primary/10 text-primary',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
  slate: 'bg-foreground/5 text-foreground',
} as const

export type Tone = keyof typeof TONES

export function IconTile({
  icon,
  tone = 'primary',
  className,
}: {
  icon: React.ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
        TONES[tone],
        className,
      )}
      aria-hidden
    >
      {icon}
    </span>
  )
}

// The core list pattern: a large tappable row with a leading icon tile,
// a title + optional subtitle, an optional trailing node (badge/value),
// and a chevron. Renders as a link when `href` is given.
export function TappableRow({
  icon,
  tone,
  title,
  subtitle,
  trailing,
  href,
  className,
}: {
  icon?: React.ReactNode
  tone?: Tone
  title: React.ReactNode
  subtitle?: React.ReactNode
  trailing?: React.ReactNode
  href?: string
  className?: string
}) {
  const inner = (
    <>
      {icon ? <IconTile icon={icon} tone={tone} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-foreground">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-[13px] text-muted">{subtitle}</span>
        ) : null}
      </span>
      {trailing ? <span className="flex shrink-0 items-center gap-2">{trailing}</span> : null}
      {href ? <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden /> : null}
    </>
  )

  const base = cn(
    'flex items-center gap-3.5 rounded-2xl border border-border bg-surface px-4 py-3.5',
    href && 'transition active:scale-[0.99] hover:border-primary/30 hover:bg-primary/[0.03]',
    className,
  )

  if (href) {
    return (
      <Link
        href={href}
        className={cn(base, 'no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary')}
      >
        {inner}
      </Link>
    )
  }
  return <div className={base}>{inner}</div>
}

// Friendly, centered empty state that matches the portal's rounded
// language (rather than the admin dashed-border EmptyState).
export function ScreenEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
      <IconTile icon={icon} className="h-14 w-14" />
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}

// A soft rounded surface used to group rows or hold freeform content.
export function Panel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-2xl border border-border bg-surface p-4', className)}>{children}</div>
  )
}
