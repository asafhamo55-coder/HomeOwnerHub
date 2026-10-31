/** Pure helpers for the "Common deadlines" chips (round 20). No server imports. */

/** Matches the title field (EventFieldsSchema max 200). */
export const EVENT_TITLE_MAX = 200

export const COMMON_DEADLINES = [
  'Annual meeting',
  'Insurance renewal',
  'Budget adoption',
  'Reserve study review',
  'Audit or financial review',
] as const

export const GEORGIA_DEADLINE = 'Georgia annual registration'

/** The chips to show: Georgia's only for a GA association. */
export function deadlineTitles(state: string | null | undefined): string[] {
  const isGa = (state ?? '').trim().toUpperCase() === 'GA'
  return isGa ? [...COMMON_DEADLINES, GEORGIA_DEADLINE] : [...COMMON_DEADLINES]
}

export function newEventHref(title: string): string {
  return `/events/new?title=${encodeURIComponent(title)}`
}

/**
 * A `?title=` value as a default for the title input, nothing more. Returns
 * undefined for anything that is not a single short plain-text string:
 * arrays, empty, over-long, control characters or angle brackets.
 */
export function titleFromParam(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined
  const value = raw.trim()
  if (!value || value.length > EVENT_TITLE_MAX) return undefined
  if (/[\u0000-\u001f\u007f<>]/.test(value)) return undefined
  return value
}
