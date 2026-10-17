import { Lock, ScrollText } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'
import { AppVersion } from '@/components/layout/AppVersion'
import { appVersion } from '@/lib/app-version'

/**
 * The signed-out (and pre-org) frame: a calm canvas, the product mark, one
 * centered surface, and a short trust line. Used by the (auth) layout and
 * by onboarding, which sit outside the board AppShell.
 *
 * It renders no heading: each page renders its own single <h1> via
 * `AuthHeader`, so the document outline names the task ("Sign in"), not
 * the product.
 */
export function AuthShell({
  children,
  width = 'sm',
  footer,
}: {
  children: React.ReactNode
  /** sm = auth forms (28rem); md = onboarding steps (36rem). */
  width?: 'sm' | 'md'
  /** Replaces the default trust line. */
  footer?: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="flex flex-1 flex-col items-center px-4 pb-10 pt-12 sm:justify-center sm:pt-10">
        <div className={cn('w-full space-y-6', width === 'sm' ? 'max-w-md' : 'max-w-xl')}>
          <div className="flex items-center justify-center gap-2.5">
            <span
              className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-xs"
              aria-hidden
            >
              <ScrollText className="size-[18px]" />
            </span>
            <span className="text-lg font-semibold tracking-[-0.01em] text-foreground">HOA Hub</span>
          </div>
          {children}
          <div className="text-center text-xs text-muted">
            {footer ?? (
              <p className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5" aria-hidden />
                Encrypted connection · sessions end after 24 hours
              </p>
            )}
            {/* BL-071: which build is running, on every signed-out screen. */}
            <AppVersion version={appVersion()} className="mt-2" />
          </div>
        </div>
      </main>
    </div>
  )
}

/** The card every auth step sits in. */
export function AuthPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface p-6 shadow-md sm:p-8', className)}>
      {children}
    </div>
  )
}

/** Page title + one-line context. Renders the page's only <h1>. */
export function AuthHeader({
  title,
  description,
  icon,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="mb-6 space-y-1.5">
      {icon ? (
        <span
          className="mb-3 flex size-10 items-center justify-center rounded-full bg-primary-subtle text-primary [&_svg]:size-5"
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
      <h1 className="text-xl font-semibold tracking-[-0.015em] text-foreground">{title}</h1>
      {description ? <div className="text-sm text-muted">{description}</div> : null}
    </div>
  )
}
