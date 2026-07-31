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

export interface PropertyRef {
  unitId: string
  legacyPropertyId: string | null
  associationId: string | null
  address: string
  unitNumber: string | null
}

export type PropertyMatchSource = 'property_resident' | 'owner_email' | 'profile'

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

function toRef(row: UnitRow): PropertyRef {
  return {
    unitId: row.id,
    legacyPropertyId: row.legacy_hoa_property_id,
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
  const { data } = await db
    .from('units')
    .select(UNIT_COLUMNS)
    .eq('organization_id', orgId)
    .eq('id', unitId)
    .maybeSingle()

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
  const { data: residents } = await db
    .from('property_residents')
    .select('id, full_name, property_id')
    .eq('organization_id', orgId)
    .is('moved_out_at', null)
    .ilike('email', needle)

  const residentPropertyIds = (residents ?? []).map((r) => r.property_id)
  if (residentPropertyIds.length > 0) {
    const { data: units } = await db
      .from('units')
      .select(UNIT_COLUMNS)
      .eq('organization_id', orgId)
      .in('legacy_hoa_property_id', residentPropertyIds)

    for (const unit of (units ?? []) as UnitRow[]) {
      const resident = (residents ?? []).find(
        (r) => r.property_id === unit.legacy_hoa_property_id,
      )
      push(unit, resident?.id ?? null, resident?.full_name ?? null, 'property_resident')
    }
  }

  // ── 2. hoa_properties.owner_email (via the bridge) ────────────────
  const { data: owned } = await db
    .from('hoa_properties')
    .select('id, owner_name')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .ilike('owner_email', needle)

  const ownedIds = (owned ?? []).map((p) => p.id)
  if (ownedIds.length > 0) {
    const { data: units } = await db
      .from('units')
      .select(UNIT_COLUMNS)
      .eq('organization_id', orgId)
      .in('legacy_hoa_property_id', ownedIds)

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

  const { data } = await db
    .from('units')
    .select(UNIT_COLUMNS)
    .eq('organization_id', orgId)

  return ((data ?? []) as UnitRow[])
    .filter((row) => normalizeAddress(row.address_line1) === needle)
    .map(toRef)
}
