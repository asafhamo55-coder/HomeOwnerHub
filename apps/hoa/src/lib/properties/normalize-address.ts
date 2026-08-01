/**
 * ⚠ CROSS-PACKAGE CONSTRAINT — read this before adding an import here.
 *
 * `packages/jobs` imports this module DIRECTLY over a relative path
 * (`../../../apps/hoa/src/lib/...`), compiling it under its OWN tsconfig
 * rather than the `hoa` app's. Four files are shared this way:
 *
 *   apps/hoa/src/lib/inbox/ingest.ts
 *   apps/hoa/src/lib/inbox/match.ts
 *   apps/hoa/src/lib/properties/resolve.ts
 *   apps/hoa/src/lib/properties/normalize-address.ts
 *
 * That only works because every import in them that leaves this set of
 * four is `import type` — fully erased by TypeScript, so there is no
 * runtime dependency for the jobs package to resolve. Therefore, in this
 * file:
 *
 *   - NO `@/…` path aliases — jobs' tsconfig does not define them.
 *   - NO `import 'server-only'` — not a dependency of this repo, and the
 *     jobs package is not a Next runtime. (This is the tempting one: the
 *     file is full of service-role queries.)
 *   - NO Next-specific imports (`next/*`, `next/headers`, `next/cache`).
 *   - Value imports only from the other three files above; everything
 *     else stays `import type`.
 *   - Need a runtime helper? Copy it in (see the local `logDbError` in
 *     ingest.ts / match.ts) or add it to `@homeowner-portal/db` /
 *     `@homeowner-portal/mailbox`, both of which jobs already depends on.
 *
 * Breaking any of these leaves `pnpm --filter hoa typecheck` GREEN and
 * fails `pnpm --filter @homeowner-portal/jobs typecheck` instead — the
 * error surfaces in a package that does not contain the edit, which is
 * why it is written here and not only on the consumer side
 * (packages/jobs/src/mailbox-sync.ts).
 */

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
