'use client'

import { useEffect, useState } from 'react'

/**
 * Render a server-provided ISO timestamp in the BROWSER's timezone.
 *
 * Why this exists: pages in apps/hoa are mostly server components.
 * Calls to date-fns `format(new Date(iso), '...')` inside a server
 * component format in the server's timezone — which is UTC on Vercel.
 * Users in EDT/EST then see times that are 4–5 hours off.
 *
 * This component does the right thing: ships the raw ISO string to the
 * client, formats with Intl.DateTimeFormat in the user's locale, and
 * falls back to the same UTC-looking string SSR'd while hydration
 * completes so there's no layout shift.
 *
 * Usage:
 *   <LocalDateTime iso={comm.sent_at} variant="long" />
 *   <LocalDateTime iso={comm.scheduled_for} variant="short" />
 */
type Variant = 'long' | 'short' | 'date-only' | 'time-only'

const FORMATS: Record<Variant, Intl.DateTimeFormatOptions> = {
  // "May 25, 2026, 7:30 PM"
  long: {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
  // "May 25, 7:30 PM"
  short: {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
  'date-only': {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  },
  'time-only': {
    hour: 'numeric',
    minute: '2-digit',
  },
}

export interface LocalDateTimeProps {
  /** ISO 8601 string from the server. Null/undefined renders nothing. */
  iso: string | null | undefined
  /** Display shape. Defaults to 'long'. */
  variant?: Variant
  /** Optional prefix word like "sent" / "scheduled" / "received" so the
   *  resulting copy reads "sent May 25, 7:30 PM" without the caller
   *  having to space-concat. */
  prefix?: string
  className?: string
}

export function LocalDateTime({
  iso,
  variant = 'long',
  prefix,
  className,
}: LocalDateTimeProps) {
  // SSR: render a stable placeholder string so the markup is correct
  // before hydration. Once mounted on the client, swap to the locale-
  // formatted version.
  const [formatted, setFormatted] = useState<string | null>(null)

  useEffect(() => {
    if (!iso) return
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return
    try {
      const formatter = new Intl.DateTimeFormat(undefined, FORMATS[variant])
      setFormatted(formatter.format(d))
    } catch {
      setFormatted(d.toLocaleString())
    }
  }, [iso, variant])

  if (!iso) return null

  // SSR fallback. Renders the ISO date in a compact form so it's never
  // jarringly different from the post-hydration value. The browser
  // value WILL be more local-correct.
  const ssrFallback = (() => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  })()

  const display = formatted ?? ssrFallback
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {prefix ? `${prefix} ${display}` : display}
    </time>
  )
}
