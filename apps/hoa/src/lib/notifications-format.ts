/**
 * Pure presentation helpers for the in-app notification bell.
 *
 * Split out of `lib/notifications.ts` for two reasons. The first is
 * mechanical: that file is `'use server'`, and Next only permits async
 * function exports from a server-action module — a synchronous helper
 * exported from there fails the `pnpm --filter hoa build` export check.
 *
 * The second is that these are the only parts of the feature the root
 * vitest harness can reach at all. That harness is PURE MODULES ONLY (see
 * vitest.config.ts) — no Supabase, no server components — so anything
 * worth pinning with a test has to live somewhere a test can import
 * without a database. Age formatting and link validation both have real
 * edge cases; keeping them here means those edges are asserted rather
 * than assumed.
 */

import { formatShortDate } from './format-datetime'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

/**
 * Compact "how long ago" label for a notification row.
 *
 * Deliberately coarse. The bell is a glanceable list, and the exact
 * minute of a ticket's arrival is on the ticket itself — what a board
 * member needs here is "is this from this morning or from last month".
 *
 * Anything older than a week falls back to an absolute date via
 * formatShortDate, so it carries that module's explicit Eastern timezone
 * rather than the Vercel runtime's UTC. Relative labels under a week need
 * no timezone: an elapsed duration is the same number in every zone.
 *
 * `now` is injectable purely so the tests are deterministic; every caller
 * omits it.
 */
export function formatNotificationAge(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const date = toDate(value)
  if (!date) return ''

  const elapsed = now.getTime() - date.getTime()

  // A negative elapsed time means the row is stamped in the future. That
  // is clock skew between Postgres and the renderer, not a real event, and
  // "in 3 minutes" on a notification reads as a bug. Clamp to the present.
  if (elapsed < MINUTE_MS) return 'just now'
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`
  if (elapsed < WEEK_MS) return `${Math.floor(elapsed / DAY_MS)}d ago`

  return formatShortDate(date)
}

/**
 * The unread badge's text, or null when there is nothing to show.
 *
 * Capped because the badge is a ~18px circle sitting on the bell icon; a
 * literal "247" either overflows it or shrinks the type past legible. The
 * exact number stops being actionable long before then anyway — past a
 * couple of dozen the only useful message is "a lot".
 */
export function formatUnreadBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null
  return count > 99 ? '99+' : String(Math.floor(count))
}

/**
 * Validates a notification's stored `link` before it is used as an href.
 *
 * `notifications.link` is free text written by a background job (migration
 * 0053 stores it rather than deriving it, so a future notification kind can
 * point anywhere without a migration). That flexibility means the column is
 * an untrusted string by the time it reaches the browser, and rendering it
 * straight into an <a href> would turn any future write path into an open
 * redirect — or, with a `javascript:` value, into script execution.
 *
 * So: same-origin absolute paths only. Everything else returns null and the
 * caller renders the notification as unclickable text, which still delivers
 * the title and body.
 *
 * Rejections that are not obvious:
 *   - `//evil.example` is protocol-relative; it starts with '/' but browsers
 *     navigate cross-origin.
 *   - `/\evil.example` is normalised by browsers to '//evil.example', so a
 *     leading backslash is the same attack with a different spelling.
 *   - embedded whitespace or control characters, because they are how a
 *     scheme gets smuggled past a naive prefix check.
 */
export function safeNotificationHref(link: string | null | undefined): string | null {
  if (typeof link !== 'string') return null

  const trimmed = link.trim()
  if (trimmed.length === 0) return null
  if (!trimmed.startsWith('/')) return null
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(trimmed)) return null

  return trimmed
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
