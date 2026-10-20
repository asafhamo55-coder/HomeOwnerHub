'use server'

// Resident-side reads. Always scoped to the current user's owned units.
// Uses the user-bound supabase client so RLS enforces the unit boundary;
// callers do NOT need to thread a user id through. Exception: while an
// admin impersonates, the actor's client is service-role (no RLS), so
// every query here also filters on `actor.orgId`.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor, type ResidentActor } from '@/lib/impersonation'
import { exactIlike } from '@/lib/impersonation-target'
import { chargesFromForOwnership } from '@/lib/resident-sale-window'
import { ASSOCIATION_ZONE_COLUMNS, associationTimeZone } from '@/lib/association-time'
import {
  countNewAnnouncements,
  fetchMyAnnouncementRows,
  getAnnouncementsLastViewedAt,
} from '@/lib/resident-announcements'

export interface ResidentUnit {
  unit_id: string
  unit_number: string | null
  address: string | null
  association_id: string | null
  association_name: string | null
  /** The association's IANA zone (BL-043); set by getResidentUnits. */
  association_time_zone?: string | null
  ownership_pct: number | null
  valid_from: string
  /**
   * The first day of this unit's money the resident may see: their
   * ownership's valid_from when it began with a recorded sale, so a buyer
   * never sees the seller's charges (lib/resident-sale-window.ts). Null =
   * the whole unit history (every other way an owner got here).
   */
  charges_from?: string | null
}

export interface ResidentSummary {
  units: ResidentUnit[]
  /** First community name — kept for single-community callers. */
  associationName: string | null
  /** Distinct community names across all owned units (multi-property owners). */
  associationNames: string[]
  orgName: string | null
  openViolations: number
  recentAnnouncements: number
}

// Returns every unit currently owned by the signed-in user, each tagged
// with its association (community) name so a multi-property owner can tell
// which community a unit belongs to. Wraps the raw lookup below and fills
// in association names in a single batched query.
// Memoized per server render (BL-099): a resident page asks for the units
// from more than one loader (the home page's dashboard read and its next
// meeting). Outside a render (server actions) cache() does not memoize.
export const getResidentUnits = cache(async (): Promise<ResidentUnit[]> => {
  const actor = await getResidentActor()
  const units = await getOwnedUnits(actor)
  return attachAssociationNames(actor.client, units, actor.orgId)
})

// Resolves the association (community) name for each unit's association_id
// in one batched query. Units without an association_id keep a null name.
async function attachAssociationNames(
  supabase: SupabaseClient<Database>,
  units: ResidentUnit[],
  /** Impersonation org — service-role reads must not cross it. */
  orgId: string | null,
): Promise<ResidentUnit[]> {
  const associationIds = [
    ...new Set(units.map((u) => u.association_id).filter((id): id is string => id != null)),
  ]
  if (associationIds.length === 0) return units

  let q = supabase
    .from('associations' as never)
    .select(`id, name, ${ASSOCIATION_ZONE_COLUMNS}`)
    .in('id', associationIds)
  if (orgId) q = q.eq('organization_id' as never, orgId)
  const { data } = await q

  const rows = (data ?? []) as unknown as Array<{ id: string; name: string | null; state?: string | null }>
  const byId = new Map(rows.map((a) => [a.id, a]))

  return units.map((u) => {
    const a = u.association_id ? byId.get(u.association_id) : undefined
    return {
      ...u,
      association_name: a?.name ?? null,
      // Unknown association → the default zone (Eastern), never the UTC day.
      association_time_zone: a ? associationTimeZone(a) : null,
    }
  })
}

// Raw lookup of every unit currently owned by the signed-in user. Primary
// lookup is `ownerships.owner_user_id`. Fallback: if no ownerships
// rows exist, check `property_residents` by email — residents linked
// by email (e.g. via CSV import) still see their property.
async function getOwnedUnits(actor: ResidentActor): Promise<ResidentUnit[]> {
  const supabase = actor.client
  // Impersonation note: `actor.client` may be a service-role client with no
  // auth session, so we scope on actor.id / actor.email directly rather than
  // re-deriving the user from the client.
  if (!actor.id && !actor.email) return []
  // While impersonating the client is SERVICE-ROLE: RLS is off, so every
  // query below must carry the impersonation org or it would return this
  // owner's units in every tenant. (Not impersonating: orgId is null and
  // RLS bounds the read, exactly as before.)
  if (actor.impersonating && !actor.orgId) return []
  const orgId = actor.orgId

  const rows: Array<{
    unit_id: string
    ownership_pct: number | null
    valid_from: string
    source: string | null
    unit: {
      unit_number: string | null
      address_line1: string | null
      association_id: string | null
    } | null
  }> = []

  if (actor.id) {
    let q = supabase
      .from('ownerships')
      .select(
        'unit_id, ownership_pct, valid_from, source, unit:units(unit_number, address_line1, association_id)',
      )
      .eq('owner_user_id', actor.id)
      .is('valid_to', null)
    if (orgId) q = q.eq('organization_id', orgId)
    const { data } = await q.order('valid_from', { ascending: false })
    rows.push(
      ...((data ?? []) as unknown as typeof rows),
    )
  }

  if (rows.length > 0) {
    return rows.map((r) => ({
      unit_id: r.unit_id,
      unit_number: r.unit?.unit_number ?? null,
      address: r.unit?.address_line1 ?? null,
      association_id: r.unit?.association_id ?? null,
      association_name: null,
      ownership_pct: r.ownership_pct,
      valid_from: r.valid_from,
      charges_from: chargesFromForOwnership(r),
    }))
  }

  // Fallback: look up by email in property_residents → hoa_properties,
  // then resolve the matching units row via legacy_hoa_property_id so
  // the returned unit_id is valid for FK references (e.g. tickets).
  if (!actor.email) return []
  // Exact, case-insensitive: `%` / `_` in the address are escaped, so an
  // address can never act as a pattern matching other residents.
  let prQuery = supabase
    .from('property_residents' as never)
    .select(
      'property_id, role, moved_in_at, property:hoa_properties(id, address, unit_number, org_id)',
    )
    .ilike('email' as never, exactIlike(actor.email))
    .is('moved_out_at' as never, null)
  if (orgId) prQuery = prQuery.eq('organization_id' as never, orgId)
  const { data: prData } = await prQuery.order('moved_in_at' as never, { ascending: false })

  const prRows = (prData ?? []) as unknown as Array<{
    property_id: string
    role: string
    moved_in_at: string | null
    property: {
      id: string
      address: string | null
      unit_number: string | null
      org_id: string | null
    } | null
  }>

  const validRows = prRows.filter(
    (r) => r.property != null && (!orgId || r.property.org_id === orgId),
  )
  if (validRows.length === 0) return []

  const propertyIds = validRows.map((r) => r.property_id)
  let unitQuery = supabase
    .from('units' as never)
    .select('id, legacy_hoa_property_id, association_id')
    .in('legacy_hoa_property_id' as never, propertyIds)
  if (orgId) unitQuery = unitQuery.eq('organization_id' as never, orgId)
  const { data: unitLinks } = await unitQuery

  const unitByPropId = new Map(
    ((unitLinks ?? []) as unknown as Array<{
      id: string
      legacy_hoa_property_id: string
      association_id: string | null
    }>).map((u) => [u.legacy_hoa_property_id, u]),
  )

  return validRows.map((r) => {
    const linked = unitByPropId.get(r.property_id)
    return {
      unit_id: linked?.id ?? r.property_id,
      unit_number: r.property!.unit_number ?? null,
      address: r.property!.address ?? null,
      association_id: linked?.association_id ?? null,
      association_name: null,
      ownership_pct: null,
      valid_from: r.moved_in_at ?? new Date().toISOString(),
    }
  })
}

// Aggregate counts for the resident dashboard cards.
export async function getResidentSummary(): Promise<ResidentSummary> {
  const actor = await getResidentActor()
  const supabase = actor.client
  const org = await getCurrentOrg()

  const units = await getResidentUnits()

  // Distinct community names across every owned unit, preserving order.
  const associationNames = [
    ...new Set(units.map((u) => u.association_name).filter((n): n is string => n != null && n !== '')),
  ]
  const associationName = associationNames[0] ?? null

  // Same reach-through the announcements page uses — this was the second
  // copy of the org-wide count that told a reader "15 new" over a list of 3.
  let recentAnnouncements = 0
  if (org) {
    const identity = {
      unitIds: units.map((u) => u.unit_id).filter(Boolean),
      userId: actor.id,
      email: actor.email,
    }
    const [rows, lastViewedAt] = await Promise.all([
      fetchMyAnnouncementRows(supabase as never, org.id, identity),
      getAnnouncementsLastViewedAt(supabase as never, identity.userId),
    ])
    recentAnnouncements = countNewAnnouncements(rows, lastViewedAt)
  }

  return {
    units,
    associationName,
    associationNames,
    orgName: org?.name ?? null,
    openViolations: 0, // wired in Phase 16d once violation queries land
    recentAnnouncements,
  }
}
