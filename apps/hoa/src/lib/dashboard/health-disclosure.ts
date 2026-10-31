/**
 * "Show more numbers": whether the Community health block starts open, and
 * the board member's own choice, remembered in this browser. Storage can be
 * missing or throw (private mode, blocked site data), so every access is
 * wrapped and falls back to the default.
 */
export const YOUNG_ORG_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Open by default only for an org at least 60 days old. That also covers
 * "fewer than a month of data": 60 days is longer than the 30-day window the
 * charts and "vs 30 days ago" deltas use. An unknown or future date is
 * treated as young, because a quiet dashboard is the safer default.
 */
export function healthDefaultOpen(orgCreatedAt: string | null, nowMs: number): boolean {
  if (!orgCreatedAt) return false
  const t = Date.parse(orgCreatedAt)
  if (!Number.isFinite(t) || t > nowMs) return false
  return nowMs - t >= YOUNG_ORG_DAYS * DAY_MS
}

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function healthStorageKey(orgId: string): string {
  return `hoa:dashboard-health-open:${orgId}`
}

/** The saved choice, or the default when nothing valid is saved. */
export function readHealthOpen(storage: KeyValueStorage | null, orgId: string, fallback: boolean): boolean {
  try {
    const v = storage?.getItem(healthStorageKey(orgId))
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    // fall through to the default
  }
  return fallback
}

export function writeHealthOpen(storage: KeyValueStorage | null, orgId: string, open: boolean): void {
  try {
    storage?.setItem(healthStorageKey(orgId), open ? '1' : '0')
  } catch {
    // Can't remember it; the default applies next time.
  }
}
