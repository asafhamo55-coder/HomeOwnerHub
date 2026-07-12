'use server'

// Resident-side reads. Always scoped to the current user's owned units.
// Uses the user-bound supabase client so RLS enforces the unit boundary;
// callers do NOT need to thread a user id through.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor, type ResidentActor } from '@/lib/impersonation'

export interface ResidentUnit {
  unit_id: string
  unit_number: string | null
  address: string | null
  association_id: string | null
  association_name: string | null
  ownership_pct: number | null
  valid_from: string
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
export async function getResidentUnits(): Promise<ResidentUnit[]> {
  const actor = await getResidentActor()
  const units = await getOwnedUnits(actor)
  return attachAssociationNames(actor.client, units)
}

// Resolves the association (community) name for each unit's association_id
// in one batched query. Units without an association_id keep a null name.
async function attachAssociationNames(
  supabase: SupabaseClient<Database>,
  units: ResidentUnit[],
): Promise<ResidentUnit[]> {
  const associationIds = [
    ...new Set(units.map((u) => u.association_id).filter((id): id is string => id != null)),
  ]
  if (associationIds.length === 0) return units

  const { data } = await supabase
    .from('associations' as never)
    .select('id, name')
    .in('id', associationIds)

  const nameById = new Map(
    ((data ?? []) as unknown as Array<{ id: string; name: string | null }>).map((a) => [
      a.id,
      a.name,
    ]),
  )

  return units.map((u) => ({
    ...u,
    association_name: u.association_id ? nameById.get(u.association_id) ?? null : null,
  }))
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

  const rows: Array<{
    unit_id: string
    ownership_pct: number | null
    valid_from: string
    unit: {
      unit_number: string | null
      address_line1: string | null
      association_id: string | null
    } | null
  }> = []

  if (actor.id) {
    const { data } = await supabase
      .from('ownerships')
      .select(
        'unit_id, ownership_pct, valid_from, unit:units(unit_number, address_line1, association_id)',
      )
      .eq('owner_user_id', actor.id)
      .is('valid_to', null)
      .order('valid_from', { ascending: false })
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
    }))
  }

  // Fallback: look up by email in property_residents → hoa_properties,
  // then resolve the matching units row via legacy_hoa_property_id so
  // the returned unit_id is valid for FK references (e.g. tickets).
  if (!actor.email) return []
  const { data: prData } = await supabase
    .from('property_residents' as never)
    .select(
      'property_id, role, moved_in_at, property:hoa_properties(id, address, unit_number, org_id)',
    )
    .ilike('email' as never, actor.email)
    .is('moved_out_at' as never, null)
    .order('moved_in_at' as never, { ascending: false })

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

  const validRows = prRows.filter((r) => r.property != null)
  if (validRows.length === 0) return []

  const propertyIds = validRows.map((r) => r.property_id)
  const { data: unitLinks } = await supabase
    .from('units' as never)
    .select('id, legacy_hoa_property_id, association_id')
    .in('legacy_hoa_property_id' as never, propertyIds)

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

  let recentAnnouncements = 0
  if (org) {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const { count } = await supabase
      .from('communications' as never)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('status', 'sent')
      .gte('sent_at', thirtyDaysAgo.toISOString())
    recentAnnouncements = count ?? 0
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
