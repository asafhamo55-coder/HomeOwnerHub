// `?property=<hoa_properties.id>` — the scope the property page puts on its
// outbound links (/violations, /dues, /leases, /violations/new), so they
// open on that home instead of an unfiltered list. Parsing is pure; the
// lookup reads the address for the "Showing … only" banner.

import type { SupabaseClient } from '@supabase/supabase-js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function parsePropertyParam(raw: string | string[] | undefined | null): string | null {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase()
  return v && UUID.test(v) ? v : null
}

/** `href` with `property=<id>` appended (or unchanged when id is null). */
export function withPropertyParam(href: string, propertyId: string | null): string {
  if (!propertyId) return href
  return `${href}${href.includes('?') ? '&' : '?'}property=${propertyId}`
}

export interface PropertyScope {
  id: string
  /** Null when the home could not be read (failed read, or not in this org). */
  address: string | null
  unitNumber: string | null
  /** The home's org, for resolver lookups. Null when it could not be read. */
  orgId: string | null
}

/**
 * The scoped home's address. The filter applies either way — a failed
 * lookup must not silently widen the list to every home — and the banner
 * says it couldn't name the home.
 */
export async function loadPropertyScope(
  supabase: SupabaseClient,
  raw: string | string[] | undefined,
): Promise<PropertyScope | null> {
  const id = parsePropertyParam(raw)
  if (!id) return null
  const { data } = await supabase
    .from('hoa_properties')
    .select('address, unit_number, org_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  const row = data as { address: string; unit_number: string | null; org_id: string } | null
  return { id, address: row?.address ?? null, unitNumber: row?.unit_number ?? null, orgId: row?.org_id ?? null }
}
