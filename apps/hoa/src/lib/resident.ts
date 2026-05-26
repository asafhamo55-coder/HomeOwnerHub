'use server'

// Resident-side reads. Always scoped to the current user's owned units.
// Uses the user-bound supabase client so RLS enforces the unit boundary;
// callers do NOT need to thread a user id through.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/orgs'

export interface ResidentUnit {
  unit_id: string
  unit_number: string | null
  address: string | null
  association_id: string | null
  ownership_pct: number | null
  valid_from: string
}

export interface ResidentSummary {
  units: ResidentUnit[]
  associationName: string | null
  orgName: string | null
  openViolations: number
  recentAnnouncements: number
}

// Returns every unit currently owned by the signed-in user. Primary
// lookup is `ownerships.owner_user_id`. Fallback: if no ownerships
// rows exist, check `property_residents` by email — residents linked
// by email (e.g. via CSV import) still see their property.
export async function getResidentUnits(): Promise<ResidentUnit[]> {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('ownerships')
    .select(
      'unit_id, ownership_pct, valid_from, unit:units(unit_number, address_line1, association_id)',
    )
    .eq('owner_user_id', user.id)
    .is('valid_to', null)
    .order('valid_from', { ascending: false })

  const rows = (data ?? []) as unknown as Array<{
    unit_id: string
    ownership_pct: number | null
    valid_from: string
    unit: {
      unit_number: string | null
      address_line1: string | null
      association_id: string | null
    } | null
  }>

  if (rows.length > 0) {
    return rows.map((r) => ({
      unit_id: r.unit_id,
      unit_number: r.unit?.unit_number ?? null,
      address: r.unit?.address_line1 ?? null,
      association_id: r.unit?.association_id ?? null,
      ownership_pct: r.ownership_pct,
      valid_from: r.valid_from,
    }))
  }

  // Fallback: look up by email in property_residents → hoa_properties → units.
  if (!user.email) return []
  const { data: prData } = await supabase
    .from('property_residents' as never)
    .select(
      'property_id, role, moved_in_at, property:hoa_properties(id, address, unit_number, org_id)',
    )
    .ilike('email' as never, user.email)
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

  return prRows
    .filter((r) => r.property != null)
    .map((r) => ({
      unit_id: r.property_id,
      unit_number: r.property!.unit_number ?? null,
      address: r.property!.address ?? null,
      association_id: null,
      ownership_pct: null,
      valid_from: r.moved_in_at ?? new Date().toISOString(),
    }))
}

// Aggregate counts for the resident dashboard cards.
export async function getResidentSummary(): Promise<ResidentSummary> {
  const supabase = await getSupabaseServerClient()
  const org = await getCurrentOrg()

  const units = await getResidentUnits()

  let associationName: string | null = null
  if (units.length > 0 && units[0].association_id) {
    const { data: assoc } = await supabase
      .from('associations' as never)
      .select('name')
      .eq('id', units[0].association_id)
      .maybeSingle<{ name: string }>()
    associationName = assoc?.name ?? null
  }

  // Count published state-law updates as a rough "what's new" signal.
  // RLS lets residents read non-archived rows of state_law_updates.
  let recentAnnouncements = 0
  const { count: updateCount } = await supabase
    .from('state_law_updates' as never)
    .select('id', { count: 'exact', head: true })
    .is('archived_at', null)
  recentAnnouncements = updateCount ?? 0

  return {
    units,
    associationName,
    orgName: org?.name ?? null,
    openViolations: 0, // wired in Phase 16d once violation queries land
    recentAnnouncements,
  }
}
