/**
 * Which existing home an imported row is (P4 / PR-02).
 *
 * Addresses compare by normalizeAddress (the TS twin of the SQL
 * normalize_address in 0028), then units tell a multi-unit address apart:
 *
 *   one home at the address, no unit in the file  → that home
 *   one home at the address with no unit on file  → that home (the file
 *                                                   fills its unit)
 *   a home whose unit equals the file's unit      → that home
 *   several homes and no unit to choose by        → ambiguous (never guessed)
 *   otherwise                                     → a new home
 *
 * Pure; shared by the import core (lib/properties/import.ts) and the
 * board import's dry run, so the preview and the write agree.
 */
import { normalizeAddress } from './normalize-address'

export type HomeMatch = { kind: 'none' } | { kind: 'match'; propertyId: string } | { kind: 'ambiguous' }

/** "Unit 7", "#7", "apt 7" and "7" are one unit. */
export function normalizeUnit(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .toLowerCase()
    .replace(/^\s*(unit|apt|apartment|suite|ste|lot|no|number|#)\.?\s*/, '')
    .replace(/[^a-z0-9]/g, '')
}

interface Candidate {
  id: string
  unit: string
}

export interface HomeIndex {
  readonly byAddress: Map<string, Candidate[]>
  remember(id: string, address: string, unit: string | null): void
  forget(id: string): void
}

export function buildHomeIndex(
  rows: ReadonlyArray<{ id: string; address: string; unit_number: string | null }>,
): HomeIndex {
  const byAddress = new Map<string, Candidate[]>()
  const index: HomeIndex = {
    byAddress,
    remember(id, address, unit) {
      const key = normalizeAddress(address)
      if (!key) return
      byAddress.set(key, [...(byAddress.get(key) ?? []), { id, unit: normalizeUnit(unit) }])
    },
    forget(id) {
      for (const [key, list] of byAddress) {
        const kept = list.filter((c) => c.id !== id)
        if (kept.length) byAddress.set(key, kept)
        else byAddress.delete(key)
      }
    },
  }
  for (const r of rows) index.remember(r.id, r.address, r.unit_number)
  return index
}

export function matchHome(index: HomeIndex, address: string, unit: string | null | undefined): HomeMatch {
  const hits = index.byAddress.get(normalizeAddress(address)) ?? []
  if (hits.length === 0) return { kind: 'none' }
  const u = normalizeUnit(unit)
  if (u) {
    const same = hits.filter((h) => h.unit === u)
    if (same.length === 1) return { kind: 'match', propertyId: same[0].id }
    if (same.length > 1) return { kind: 'ambiguous' }
    if (hits.length === 1 && hits[0].unit === '') return { kind: 'match', propertyId: hits[0].id }
    return { kind: 'none' }
  }
  return hits.length === 1 ? { kind: 'match', propertyId: hits[0].id } : { kind: 'ambiguous' }
}

/** Among units at one address (oldest first), the one this row means. */
export function pickUnitAtAddress<T extends { unit_number: string | null }>(
  units: readonly T[],
  unit: string | null,
): T | null {
  if (units.length === 0) return null
  const u = normalizeUnit(unit)
  if (!u) return units[0]
  const same = units.find((x) => normalizeUnit(x.unit_number) === u)
  if (same) return same
  return units.length === 1 && !normalizeUnit(units[0].unit_number) ? units[0] : null
}
