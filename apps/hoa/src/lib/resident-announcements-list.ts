/**
 * Pure helpers for the resident announcements list: the "New" marker,
 * category filtering and the read-more decision. No I/O, safe to import
 * from a client component.
 */

/** Longer than this (characters) or this many lines gets a Read more toggle. */
export const CLAMP_MIN_CHARS = 320
export const CLAMP_MIN_LINES = 7

/**
 * True when an announcement was sent after the reader's last visit. A null
 * last visit means they have never opened the page, so everything is new.
 * Strictly greater-than, matching countNewAnnouncements.
 */
export function isNewAnnouncement(sentAt: string, lastViewedAt: string | null): boolean {
  if (!lastViewedAt) return true
  return sentAt > lastViewedAt
}

/** Whether a body is long enough to be worth clamping. */
export function isLongBody(body: string): boolean {
  return body.length > CLAMP_MIN_CHARS || body.split('\n').length >= CLAMP_MIN_LINES
}

/** Categories that have items, in first-seen order, with counts. */
export function categoriesWithItems(
  items: { category: string }[],
): { category: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const i of items) counts.set(i.category, (counts.get(i.category) ?? 0) + 1)
  return [...counts].map(([category, count]) => ({ category, count }))
}

/** Only accept a category that actually has items; anything else means all. */
export function parseCategoryParam(
  raw: string | undefined,
  available: { category: string }[],
): string | null {
  if (!raw) return null
  return available.some((a) => a.category === raw) ? raw : null
}

/** List URL for a category and page, dropping defaults. */
export function announcementsHref(category: string | null, page: number): string {
  const q = new URLSearchParams()
  if (category) q.set('category', category)
  if (page > 1) q.set('page', String(page))
  const s = q.toString()
  return s ? `/resident/announcements?${s}` : '/resident/announcements'
}
