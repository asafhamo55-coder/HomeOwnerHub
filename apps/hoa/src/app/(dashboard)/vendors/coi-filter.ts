import { complianceKey } from '@/lib/status/vendors'

/**
 * Insurance (COI) buckets for the /vendors attention strip and chips.
 * Pure: no server imports, so a client file may use it too.
 *
 * `complianceKey` grades the stored review status and has no date window of
 * its own; the 30-day window is the one the row's CoiExpiry pill already
 * uses. A vendor whose review says "missing", or with no expiry date on
 * file, counts as missing.
 */
export const COI_EXPIRING_DAYS = 30

export type CoiBucket = 'expired' | 'expiring' | 'missing' | 'ok'
export const COI_BUCKETS: readonly CoiBucket[] = ['expired', 'expiring', 'missing', 'ok']

export interface CoiVendor {
  legal_name: string
  compliance: { status: string | null; coi_expiration_date: string | null } | null
}

/** Whole days from `today` to a DATE column; negative = past. */
function daysFrom(d: string, today: Date): number {
  const target = Date.parse(`${d.slice(0, 10)}T00:00:00Z`)
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((target - base) / 86_400_000)
}

export function coiDays(v: CoiVendor, today: Date = new Date()): number | null {
  const d = v.compliance?.coi_expiration_date
  return d ? daysFrom(d, today) : null
}

export function coiBucket(v: CoiVendor, today: Date = new Date()): CoiBucket {
  const days = coiDays(v, today)
  if (days === null || complianceKey(v.compliance?.status) === 'missing') return 'missing'
  if (days < 0) return 'expired'
  if (days <= COI_EXPIRING_DAYS) return 'expiring'
  return 'ok'
}

export function parseCoi(raw: string | undefined): CoiBucket | null {
  return COI_BUCKETS.find((b) => b === raw) ?? null
}

export function coiCounts(
  vendors: readonly CoiVendor[],
  today: Date = new Date(),
): Record<CoiBucket, number> {
  const counts: Record<CoiBucket, number> = { expired: 0, expiring: 0, missing: 0, ok: 0 }
  for (const v of vendors) counts[coiBucket(v, today)] += 1
  return counts
}

export function matchesSearch(
  v: CoiVendor & { dba?: string | null; primary_email?: string | null; trades?: string[] | null },
  search: string,
): boolean {
  if (!search) return true
  const hay = [v.legal_name, v.dba ?? '', v.primary_email ?? '', (v.trades ?? []).join(' ')]
    .join(' ')
    .toLowerCase()
  return hay.includes(search.toLowerCase())
}

/** Soonest expiry first (expired lead), missing last. Stable for ties. */
export function sortByCoi<T extends CoiVendor>(vendors: readonly T[], today: Date = new Date()): T[] {
  return [...vendors].sort((a, b) => {
    const da = coiDays(a, today)
    const db = coiDays(b, today)
    if (da === null && db === null) return 0
    if (da === null) return 1
    if (db === null) return -1
    return da - db
  })
}

export function coiHref(params: { q?: string; coi?: CoiBucket | null; sort?: string | null }): string {
  const sp = new URLSearchParams()
  if (params.q) sp.set('q', params.q)
  if (params.coi) sp.set('coi', params.coi)
  if (params.sort) sp.set('sort', params.sort)
  const qs = sp.toString()
  return qs ? `/vendors?${qs}` : '/vendors'
}
