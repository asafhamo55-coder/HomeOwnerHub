import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { propertyHref } from './href'
import { asPropertyId, asUnitId, resolvePropertyForUnit, type PropertyId } from './resolve'

type Db = SupabaseClient<Database>

export type PropertyUrlTarget =
  | { kind: 'property'; propertyId: PropertyId }
  | { kind: 'redirect'; href: string }
  | { kind: 'not_found' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * What `/properties/[id]` means. The segment may be either id of a lot:
 *
 *   - a live hoa_properties id in the org → render it;
 *   - a units id in the org whose property is live → redirect to the
 *     canonical property URL, keeping the query string;
 *   - anything else (another org's id, a deleted lot, garbage) → 404.
 *
 * A failed read is thrown, not turned into a 404: "couldn't load" and
 * "doesn't exist" are different answers.
 */
export async function resolvePropertyUrl(
  db: Db,
  orgId: string,
  rawId: string,
  query: URLSearchParams | string = '',
): Promise<PropertyUrlTarget> {
  if (!UUID.test(rawId)) return { kind: 'not_found' }

  const live = async (id: string) => {
    const { data, error } = await db
      .from('hoa_properties')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string }>()
    if (error) throw error
    return Boolean(data)
  }

  if (await live(rawId)) return { kind: 'property', propertyId: asPropertyId(rawId) }

  const propertyId = await resolvePropertyForUnit(db, orgId, asUnitId(rawId))
  if (propertyId && (await live(propertyId))) {
    return { kind: 'redirect', href: propertyHref(propertyId, { query }) }
  }
  return { kind: 'not_found' }
}
