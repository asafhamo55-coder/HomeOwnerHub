import Link from 'next/link'
import { cn } from '@homeowner-portal/ui'
import type { AppVersion as AppVersionInfo } from '@/lib/app-version'

/**
 * BL-071: a small muted "Version v2026.10.17 · c56061f" line. Props only
 * (no hooks), so it renders in server layouts and inside the client
 * sidebar alike; the caller resolves the version on the server with
 * `appVersion()`. `title` carries the full sha. With `href` it is an
 * ordinary link (one tab stop, no trap); without, plain text.
 */
export function AppVersion({
  version,
  href,
  compact = false,
  unread = false,
  className,
}: {
  version: AppVersionInfo
  href?: string
  /** Narrow chrome (sidebar footer): "Version" is screen-reader only. */
  compact?: boolean
  /** BL-070: a What's new entry this browser has not seen (a dot, plus screen-reader text). */
  unread?: boolean
  className?: string
}) {
  const text = (
    <>
      <span className={compact ? 'sr-only' : undefined}>Version </span>
      <span className="num">{version.label}</span>
      {unread ? (
        <>
          <span aria-hidden data-whats-new-dot className="ml-1.5 inline-block size-1.5 rounded-full bg-primary align-middle" />
          <span className="sr-only"> (new updates)</span>
        </>
      ) : null}
    </>
  )
  const base = cn('text-xs text-muted', className)
  if (!href) {
    return (
      <p className={base} title={version.title}>
        {text}
      </p>
    )
  }
  return (
    <Link
      href={href}
      title={`${version.title}. See what's new${unread ? ' (new updates)' : ''}`}
      className={cn(
        base,
        'rounded-sm underline-offset-2 hover:text-foreground-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {text}
    </Link>
  )
}
