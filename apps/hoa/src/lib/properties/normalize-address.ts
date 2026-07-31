/**
 * Canonical address normalization.
 *
 * This function has a TWIN in SQL: public.normalize_address(text), created
 * in migrations/0028_property_bridge_backfill.sql. The two MUST agree —
 * the bridge backfill matches units→hoa_properties in SQL, while the
 * runtime matcher (lib/inbox/match.ts signal 5) matches in TypeScript.
 * If they drift, addresses that bridged at migration time stop matching
 * at runtime, which surfaces as emails mysteriously landing in triage.
 *
 * Any change here requires the same change in 0028 and a new migration.
 *
 * Rules, in order:
 *   1. lowercase
 *   2. strip everything that isn't alphanumeric or whitespace
 *   3. collapse whitespace
 *   4. rewrite a trailing street type to its short form
 */

// Long form → short form. Short forms map to themselves so that an
// already-short input is idempotent.
const STREET_TYPES: Record<string, string> = {
  street: 'st',
  st: 'st',
  lane: 'ln',
  ln: 'ln',
  court: 'ct',
  ct: 'ct',
  drive: 'dr',
  dr: 'dr',
  road: 'rd',
  rd: 'rd',
  avenue: 'ave',
  ave: 'ave',
  av: 'ave',
  boulevard: 'blvd',
  blvd: 'blvd',
  circle: 'cir',
  cir: 'cir',
  place: 'pl',
  pl: 'pl',
  terrace: 'ter',
  ter: 'ter',
  trail: 'trl',
  trl: 'trl',
  way: 'way',
}

export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return ''

  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned === '') return ''

  const parts = cleaned.split(' ')

  // Only the FINAL token is treated as a street type. "12 Court Street"
  // must normalize to "12 court st", not "12 ct st" — the first "Court"
  // is part of the street name.
  const last = parts[parts.length - 1]
  const short = STREET_TYPES[last]
  if (short) parts[parts.length - 1] = short

  return parts.join(' ')
}
