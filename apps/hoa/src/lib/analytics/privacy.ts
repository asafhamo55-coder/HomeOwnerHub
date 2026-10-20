/**
 * Product analytics (BL-009): the switch, Do Not Track, and URL scrubbing.
 *
 * Vercel Web Analytics is cookieless and stores no IP, but the URL it sends
 * would still carry record ids (`/inbox/3f2c…`) and query strings
 * (`?q=smith`, `?undo=…`). `scrubUrl` keeps only the origin and a path in
 * which every segment that is not a plain lowercase word is replaced by
 * `[id]`, so what leaves the browser is a route shape, never a record.
 * The rule is allowlist-shaped on purpose: a segment survives only if it
 * looks like a route word or an article slug; anything else is redacted.
 */

/**
 * On only when NEXT_PUBLIC_ANALYTICS_ENABLED is "1" or "true". The env var
 * must be read by its literal name so Next inlines it into the client bundle.
 */
export function analyticsEnabled(value: string | undefined = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED): boolean {
  const v = value?.trim().toLowerCase()
  return v === '1' || v === 'true'
}

interface PrivacySignals {
  doNotTrack?: string | null
  globalPrivacyControl?: boolean
}

/** True when the browser asks not to be tracked (DNT or Global Privacy Control). */
export function doNotTrack(nav: PrivacySignals | undefined, win?: { doNotTrack?: string | null }): boolean {
  if (nav?.globalPrivacyControl === true) return true
  const dnt = nav?.doNotTrack ?? win?.doNotTrack
  return dnt === '1' || dnt === 'yes'
}

export const ID_PLACEHOLDER = '[id]'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROUTE_WORD = /^[a-z][a-z0-9-]{0,39}$/
const HEXISH = /^[0-9a-f-]{12,}$/

function scrubSegment(segment: string): string {
  if (segment === '') return segment
  if (UUID.test(segment)) return ID_PLACEHOLDER
  if (!ROUTE_WORD.test(segment)) return ID_PLACEHOLDER
  if (/\d{4,}/.test(segment)) return ID_PLACEHOLDER
  if (HEXISH.test(segment)) return ID_PLACEHOLDER
  return segment
}

/** `/inbox/3f2c…/x?q=a#b` → `/inbox/[id]/x`. Query and hash always go. */
export function scrubPath(path: string): string {
  const bare = path.split(/[?#]/, 1)[0] ?? ''
  return bare.split('/').map(scrubSegment).join('/')
}

/** An absolute URL with the path scrubbed and no query or hash; null if unparsable. */
export function scrubUrl(url: string): string | null {
  try {
    const u = new URL(url)
    return `${u.origin}${scrubPath(u.pathname)}`
  } catch {
    return null
  }
}

interface OutgoingEvent {
  type: 'pageview' | 'event'
  url: string
}

/**
 * The `beforeSend` for <Analytics />: drop everything under Do Not Track,
 * otherwise send the event with its URL scrubbed. Applies to page views and
 * custom events alike (both carry the page URL).
 */
export function scrubBeforeSend<E extends OutgoingEvent>(
  event: E,
  env: { nav?: PrivacySignals; win?: { doNotTrack?: string | null } } = browserSignals(),
): E | null {
  if (doNotTrack(env.nav, env.win)) return null
  const url = scrubUrl(event.url)
  if (url === null) return null
  return { ...event, url }
}

function browserSignals(): { nav?: PrivacySignals; win?: { doNotTrack?: string | null } } {
  if (typeof window === 'undefined') return {}
  return {
    nav: navigator as unknown as PrivacySignals,
    win: window as unknown as { doNotTrack?: string | null },
  }
}
