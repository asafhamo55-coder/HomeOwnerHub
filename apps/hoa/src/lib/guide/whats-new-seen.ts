/**
 * The browser-remembered "seen" marker for What's new (spec §6.5): the
 * newest entry id this browser has seen, in localStorage. No migration and
 * nothing server-side. Storage can be missing or throw (private mode,
 * blocked site data), so every access is wrapped and a failure simply
 * means "no dot".
 */
export const WHATS_NEW_SEEN_KEY = 'hoa.whatsNew.seen'
export const WHATS_NEW_SEEN_EVENT = 'hoa:whats-new-seen'

export function readWhatsNewSeen(): string | null {
  try {
    return window.localStorage.getItem(WHATS_NEW_SEEN_KEY)
  } catch {
    return null
  }
}

/** True only when storage worked and holds something other than the latest id. A failed read shows no dot. */
export function isWhatsNewUnread(latestId: string | null, seen: string | null, storageOk: boolean): boolean {
  return !!latestId && storageOk && seen !== latestId
}

export function storageAvailable(): boolean {
  try {
    const k = `${WHATS_NEW_SEEN_KEY}.probe`
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

export function markWhatsNewSeen(latestId: string): void {
  try {
    window.localStorage.setItem(WHATS_NEW_SEEN_KEY, latestId)
    window.dispatchEvent(new CustomEvent(WHATS_NEW_SEEN_EVENT, { detail: latestId }))
  } catch {
    // storage blocked: the dot just stays until it works
  }
}
