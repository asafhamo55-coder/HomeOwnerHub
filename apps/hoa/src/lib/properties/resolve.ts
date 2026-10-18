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
 * The ONLY module permitted to know that a property is modelled by two
 * tables.
 *
 *   units          — has association_id; keyed by assessments.unit_id,
 *                    tickets.unit_id, arc_requests.unit_id,
 *                    communication_threads.unit_id
 *   hoa_properties — has owner_email and the property_residents children
 *                    that carry resident email addresses
 *
 * They are bridged by units.legacy_hoa_property_id (see migration 0028).
 *
 * Everything in lib/inbox/ resolves through here and stores unit_id.
 * Consolidating the two tables is tracked as future work; this module is
 * the seam that makes it possible without touching the inbox.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { normalizeAddress } from './normalize-address'

type Db = SupabaseClient<Database>

// ─── Typed ids ──────────────────────────────────────────────────────
//
// A lot has two primary keys (hoa_properties.id and units.id), both bare
// uuids, so passing one where the other belongs type-checks and 404s at
// runtime (07160ec). The brands make that a compile error. Mint them only
// at a boundary that KNOWS which table the id came from.

declare const propertyIdBrand: unique symbol
declare const unitIdBrand: unique symbol

/** An `hoa_properties.id`. What `/properties/[id]` is canonically keyed by. */
export type PropertyId = string & { readonly [propertyIdBrand]: 'PropertyId' }
/** A `units.id`. What dues, mail, tickets, ARC and collections are keyed by. */
export type UnitId = string & { readonly [unitIdBrand]: 'UnitId' }

export function asPropertyId(id: string): PropertyId {
  return id as PropertyId
}

export function asUnitId(id: string): UnitId {
  return id as UnitId
}

export interface PropertyRef {
  unitId: UnitId
  legacyPropertyId: PropertyId | null
  associationId: string | null
  address: string
  unitNumber: string | null
}

export type PropertyMatchSource = 'property_resident' | 'owner_email'

export interface PropertyMatch {
  ref: PropertyRef
  residentId: string | null
  residentName: string | null
  source: PropertyMatchSource
}

const UNIT_COLUMNS =
  'id, legacy_hoa_property_id, association_id, address_line1, unit_number'

interface UnitRow {
  id: string
  legacy_hoa_property_id: string | null
  association_id: string | null
  address_line1: string
  unit_number: string | null
}

/**
 * Escape a value for safe use inside a Postgres LIKE/ILIKE pattern.
 *
 * `_` matches any single character and `%` matches any sequence in
 * LIKE/ILIKE patterns — without escaping them, `.ilike()` is not an exact
 * match, it is a wildcard match. Email addresses commonly contain
 * underscores, so an unescaped needle like `john_doe@example.com` would
 * also match `johnXdoe@example.com`.
 *
 * Backslash must be escaped FIRST — escaping it after `%`/`_` would
 * double-escape the backslashes those substitutions just inserted.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function toRef(row: UnitRow): PropertyRef {
  return {
    unitId: asUnitId(row.id),
    legacyPropertyId: row.legacy_hoa_property_id ? asPropertyId(row.legacy_hoa_property_id) : null,
    associationId: row.association_id,
    address: row.address_line1,
    unitNumber: row.unit_number,
  }
}

export async function getPropertyRef(
  db: Db,
  orgId: string,
  unitId: string,
): Promise<PropertyRef | null> {
  const { data, error } = await db
    .from('units')
    .select(UNIT_COLUMNS)
    .eq('organization_id', orgId)
    .eq('id', unitId)
    .maybeSingle()

  // Throw rather than swallow: a transient DB error here must not be
  // indistinguishable from "unit not found" — see resolvePropertyByEmail
  // for why the caller needs this to surface instead of silently
  // reclassifying as "no match".
  if (error) {
    console.error(
      `getPropertyRef: query on "units" failed (org ${orgId}): ${error.message}`,
    )
    throw error
  }

  return data ? toRef(data as UnitRow) : null
}

/**
 * Find every property associated with an email address.
 *
 * Returns MULTIPLE matches when one person owns several units — the
 * caller decides what that means. lib/inbox/match.ts treats exactly one
 * as high confidence and more than one as medium (needs disambiguation).
 *
 * Emails are compared case-insensitively; addresses in the wild are
 * mixed-case and Postgres text comparison is not.
 */
export async function resolvePropertyByEmail(
  db: Db,
  orgId: string,
  email: string,
): Promise<PropertyMatch[]> {
  const needle = email.trim().toLowerCase()
  if (!needle) return []

  const pattern = escapeLikePattern(needle)

  const matches: PropertyMatch[] = []
  const seenUnitIds = new Set<string>()

  const push = (
    row: UnitRow,
    residentId: string | null,
    residentName: string | null,
    source: PropertyMatchSource,
  ): void => {
    // First source to claim a unit wins. Ordering below is deliberate:
    // property_residents is the most specific (a named person at a
    // property) and profiles the least.
    if (seenUnitIds.has(row.id)) return
    seenUnitIds.add(row.id)
    matches.push({ ref: toRef(row), residentId, residentName, source })
  }

  // ── 1. property_residents (via the bridge) ────────────────────────
  const { data: residents, error: residentsError } = await db
    .from('property_residents')
    .select('id, full_name, property_id')
    .eq('organization_id', orgId)
    .is('moved_out_at', null)
    .ilike('email', pattern)

  // Throw rather than return []: a query failure here must not be
  // indistinguishable from "no match", or a real DB hiccup would silently
  // reclassify a known resident as an unknown sender. The sync job that
  // calls through here wraps each mailbox in a try/catch that records
  // sync_error and leaves the cursor unadvanced, so throwing lets a real
  // failure surface and be retried instead of being permanently
  // mis-filed. Do not soften this back to a silent empty return.
  if (residentsError) {
    console.error(
      `resolvePropertyByEmail: query on "property_residents" failed (org ${orgId}): ${residentsError.message}`,
    )
    throw residentsError
  }

  const residentPropertyIds = (residents ?? []).map((r) => r.property_id)
  if (residentPropertyIds.length > 0) {
    // Filter out residents whose parent hoa_properties row is
    // soft-deleted, matching the owner_email branch below — a resident
    // row orphaned on a deleted property must not surface a match here.
    const { data: liveProperties, error: livePropertiesError } = await db
      .from('hoa_properties')
      .select('id')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .in('id', residentPropertyIds)

    if (livePropertiesError) {
      console.error(
        `resolvePropertyByEmail: query on "hoa_properties" failed (org ${orgId}): ${livePropertiesError.message}`,
      )
      throw livePropertiesError
    }

    const livePropertyIds = (liveProperties ?? []).map((p) => p.id)

    if (livePropertyIds.length > 0) {
      const { data: units, error: unitsError } = await db
        .from('units')
        .select(UNIT_COLUMNS)
        .eq('organization_id', orgId)
        .in('legacy_hoa_property_id', livePropertyIds)

      if (unitsError) {
        console.error(
          `resolvePropertyByEmail: query on "units" failed (org ${orgId}): ${unitsError.message}`,
        )
        throw unitsError
      }

      for (const unit of (units ?? []) as UnitRow[]) {
        const resident = (residents ?? []).find(
          (r) => r.property_id === unit.legacy_hoa_property_id,
        )
        push(unit, resident?.id ?? null, resident?.full_name ?? null, 'property_resident')
      }
    }
  }

  // ── 2. hoa_properties.owner_email (via the bridge) ────────────────
  const { data: owned, error: ownedError } = await db
    .from('hoa_properties')
    .select('id, owner_name')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .ilike('owner_email', pattern)

  if (ownedError) {
    console.error(
      `resolvePropertyByEmail: query on "hoa_properties" failed (org ${orgId}): ${ownedError.message}`,
    )
    throw ownedError
  }

  const ownedIds = (owned ?? []).map((p) => p.id)
  if (ownedIds.length > 0) {
    const { data: units, error: ownedUnitsError } = await db
      .from('units')
      .select(UNIT_COLUMNS)
      .eq('organization_id', orgId)
      .in('legacy_hoa_property_id', ownedIds)

    if (ownedUnitsError) {
      console.error(
        `resolvePropertyByEmail: query on "units" failed (org ${orgId}): ${ownedUnitsError.message}`,
      )
      throw ownedUnitsError
    }

    for (const unit of (units ?? []) as UnitRow[]) {
      const owner = (owned ?? []).find(
        (p) => p.id === unit.legacy_hoa_property_id,
      )
      push(unit, null, owner?.owner_name ?? null, 'owner_email')
    }
  }

  return matches
}

/**
 * Find properties by a raw address string pulled out of an email body.
 * Normalization is applied on BOTH sides so "214 Oak Lane" matches a
 * stored "214 Oak Ln." — see migration 0028 for the SQL twin.
 */
export async function resolvePropertyByAddress(
  db: Db,
  orgId: string,
  rawAddress: string,
): Promise<PropertyRef[]> {
  const needle = normalizeAddress(rawAddress)
  if (needle === '') return []

  const { data, error } = await db
    .from('units')
    .select(UNIT_COLUMNS)
    .eq('organization_id', orgId)

  // Throw rather than swallow: see resolvePropertyByEmail above for why
  // — a DB error must surface and be retried, not be mistaken for "no
  // address match".
  if (error) {
    console.error(
      `resolvePropertyByAddress: query on "units" failed (org ${orgId}): ${error.message}`,
    )
    throw error
  }

  return ((data ?? []) as UnitRow[])
    .filter((row) => normalizeAddress(row.address_line1) === needle)
    .map(toRef)
}

// ─── The bridge: property ↔ unit ───────────────────────────────────
//
// ONE rule for which unit a property means, shared with the list view
// (hoa_property_list_v, 0051: `ORDER BY created_at NULLS LAST, id LIMIT 1`).
//
// The bridge (units.legacy_hoa_property_id) is nullable and NOT unique:
// 0005 created one unit per association for multi-association orgs, so a
// property can have several. That is not an error to crash on (the detail
// page's old `.maybeSingle()` turned it into "couldn't load" for dues,
// mail and collections), and not something to hide either: the resolution
// carries `unitCount` so the page can say "N units linked".
//
// Every function here THROWS on a query failure. A failed read must not be
// indistinguishable from "not linked".

export interface BridgedUnitRow {
  id: string
  legacy_hoa_property_id: string | null
  created_at: string | null
}

/**
 * The canonical unit among several bridged to one property: earliest
 * `created_at` (nulls last), ties broken by id. Pure; exported for tests.
 */
export function pickCanonicalUnit<T extends { id: string; created_at: string | null }>(
  rows: readonly T[],
): T | null {
  if (rows.length === 0) return null
  return [...rows].sort((a, b) => {
    if (a.created_at !== b.created_at) {
      if (a.created_at === null) return 1
      if (b.created_at === null) return -1
      const ta = Date.parse(a.created_at)
      const tb = Date.parse(b.created_at)
      if (ta !== tb) return ta < tb ? -1 : 1
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })[0]
}

export interface UnitResolution {
  /** The canonical unit, or null when the property has none. */
  unitId: UnitId | null
  /** Every bridged unit (the lot, for writes that must reach all of them). */
  unitIds: UnitId[]
  /** How many units are bridged to the property. */
  unitCount: number
  /** More than one unit is bridged; the page should say so. */
  duplicate: boolean
}

/** Which unit a property means. 0 → null, 1 → it, many → the canonical one plus a flag. */
export async function resolveUnitForProperty(
  db: Db,
  orgId: string,
  propertyId: PropertyId,
): Promise<UnitResolution> {
  const { data, error } = await db
    .from('units')
    .select('id, legacy_hoa_property_id, created_at')
    .eq('organization_id', orgId)
    .eq('legacy_hoa_property_id', propertyId)

  if (error) {
    console.error(`resolveUnitForProperty: query on "units" failed (org ${orgId}): ${error.message}`)
    throw error
  }

  const rows = (data ?? []) as BridgedUnitRow[]
  const unit = pickCanonicalUnit(rows)
  return {
    unitId: unit ? asUnitId(unit.id) : null,
    unitIds: rows.map((r) => asUnitId(r.id)),
    unitCount: rows.length,
    duplicate: rows.length > 1,
  }
}

/** Which property a unit belongs to, or null when it is not bridged or not in the org. */
export async function resolvePropertyForUnit(
  db: Db,
  orgId: string,
  unitId: UnitId,
): Promise<PropertyId | null> {
  const { data, error } = await db
    .from('units')
    .select('legacy_hoa_property_id')
    .eq('organization_id', orgId)
    .eq('id', unitId)
    .maybeSingle<{ legacy_hoa_property_id: string | null }>()

  if (error) {
    console.error(`resolvePropertyForUnit: query on "units" failed (org ${orgId}): ${error.message}`)
    throw error
  }

  return data?.legacy_hoa_property_id ? asPropertyId(data.legacy_hoa_property_id) : null
}

/** Chunk size for `.in()` lists, which travel in the GET query string. */
const IN_CHUNK = 150

/** Bulk unit → property. Units that are not bridged (or not in the org) are absent. */
export async function propertyIdsForUnits(
  db: Db,
  orgId: string,
  unitIds: readonly string[],
): Promise<Map<UnitId, PropertyId>> {
  const out = new Map<UnitId, PropertyId>()
  const ids = [...new Set(unitIds)]
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await db
      .from('units')
      .select('id, legacy_hoa_property_id')
      .eq('organization_id', orgId)
      .in('id', ids.slice(i, i + IN_CHUNK))

    if (error) {
      console.error(`propertyIdsForUnits: query on "units" failed (org ${orgId}): ${error.message}`)
      throw error
    }
    for (const row of (data ?? []) as Array<{ id: string; legacy_hoa_property_id: string | null }>) {
      if (row.legacy_hoa_property_id) out.set(asUnitId(row.id), asPropertyId(row.legacy_hoa_property_id))
    }
  }
  return out
}

/**
 * Bulk property → canonical unit (the same rule as resolveUnitForProperty).
 * Properties with no unit are absent.
 */
export async function unitIdsForProperties(
  db: Db,
  orgId: string,
  propertyIds: readonly string[],
): Promise<Map<PropertyId, UnitId>> {
  const grouped = new Map<string, BridgedUnitRow[]>()
  const ids = [...new Set(propertyIds)]
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await db
      .from('units')
      .select('id, legacy_hoa_property_id, created_at')
      .eq('organization_id', orgId)
      .in('legacy_hoa_property_id', ids.slice(i, i + IN_CHUNK))

    if (error) {
      console.error(`unitIdsForProperties: query on "units" failed (org ${orgId}): ${error.message}`)
      throw error
    }
    for (const row of (data ?? []) as BridgedUnitRow[]) {
      if (!row.legacy_hoa_property_id) continue
      const list = grouped.get(row.legacy_hoa_property_id) ?? []
      list.push(row)
      grouped.set(row.legacy_hoa_property_id, list)
    }
  }
  const out = new Map<PropertyId, UnitId>()
  for (const [pid, rows] of grouped) {
    const unit = pickCanonicalUnit(rows)
    if (unit) out.set(asPropertyId(pid), asUnitId(unit.id))
  }
  return out
}

/** PostgREST's max_rows; mirrors lib/supabase/read-all.ts (not importable here, see the header). */
const INDEX_PAGE_ROWS = 1000

/**
 * Every bridged unit in the org → its property, for list surfaces that
 * attribute unit-keyed rows (ARC, payments, mail) to homes. One paged
 * read whatever the roster size — never one lookup per home. Every unit
 * counts, not just the canonical one, so a row filed under a duplicate
 * unit still lands on its home. Throws on any failed page: a partial
 * index would silently drop homes' activity.
 */
export async function unitPropertyIndex(db: Db, orgId: string): Promise<Map<UnitId, PropertyId>> {
  const out = new Map<UnitId, PropertyId>()
  for (let from = 0; ; ) {
    const { data, error } = await db
      .from('units')
      .select('id, legacy_hoa_property_id')
      .eq('organization_id', orgId)
      .order('id', { ascending: true })
      .range(from, from + INDEX_PAGE_ROWS - 1)
    if (error) {
      console.error(`unitPropertyIndex: query on "units" failed (org ${orgId}): ${error.message}`)
      throw error
    }
    const rows = (data ?? []) as Array<{ id: string; legacy_hoa_property_id: string | null }>
    if (rows.length === 0) return out
    for (const row of rows) {
      if (row.legacy_hoa_property_id) out.set(asUnitId(row.id), asPropertyId(row.legacy_hoa_property_id))
    }
    from += rows.length
  }
}
