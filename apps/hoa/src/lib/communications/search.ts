// Pure helpers for the board communications list: the subject search term,
// the filters carried on every link, and the strip's window. No server code,
// so a client file may import it.

export const SEARCH_MAX = 80
/** Days the "Sent" tile looks back. */
export const RECENT_DAYS = 30
export const FAILED_STATUSES = ['failed', 'bounced'] as const

/** The trimmed, length-capped term from `?q=`, or '' when there is none. */
export function normalizeSearchTerm(raw: string | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX)
}

/**
 * An ILIKE pattern for a typed term, or null for an empty one. Backslash,
 * % and _ are escaped so they match literally; commas, parentheses and
 * quotes become spaces so the term cannot break a PostgREST filter.
 */
export function subjectSearchPattern(raw: string | undefined): string | null {
  const term = normalizeSearchTerm((raw ?? '').replace(/[,()"]/g, ' '))
  if (!term) return null
  return `%${term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
}

/** ISO cut-off for "sent in the last 30 days". */
export function recentCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export interface CommunicationsLinkState {
  category?: string
  status?: string
  q?: string
  /** '30d' narrows to messages sent in the last 30 days. */
  window?: string
  /** 'failed' narrows to messages with a failed or bounced recipient. */
  delivery?: string
  page?: number
}

/** The list URL for a filter state. Empty values and page 1 are left out. */
export function communicationsHref(s: CommunicationsLinkState): string {
  const p = new URLSearchParams()
  if (s.category) p.set('category', s.category)
  if (s.status) p.set('status', s.status)
  if (s.q) p.set('q', s.q)
  if (s.window) p.set('window', s.window)
  if (s.delivery) p.set('delivery', s.delivery)
  if (s.page && s.page > 1) p.set('page', String(s.page))
  const qs = p.toString()
  return qs ? `/communications?${qs}` : '/communications'
}
