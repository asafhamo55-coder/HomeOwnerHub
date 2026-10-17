import { ASSOCIATION_ZONE_COLUMNS, DEFAULT_ASSOCIATION_TIME_ZONE, associationTimeZone } from '@/lib/association-time'

/**
 * Server-side: which zone an org's or association's "today" is in (BL-043).
 * The zone is derived from `associations.state` (no timezone column yet);
 * see ASSOCIATION_ZONE_COLUMNS for where a future column plugs in.
 *
 * Takes the caller's client (cookie-bound, admin, or a test fake) rather
 * than resolving one, so the cached dashboard fetchers can use it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (table: string) => any }

type ZoneRow = { name?: string | null; state?: string | null; timezone?: string | null }

/** The zone of an org's primary association: the first by name, as /dues picks it. */
export function primaryAssociationZone(rows: ZoneRow[] | null | undefined): string {
  const primary = [...(rows ?? [])].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))[0]
  return associationTimeZone(primary ?? null)
}

/**
 * Reads an org's primary association's zone. A failed read or an org with
 * no association answers America/New_York — what every screen used before
 * BL-043 — and is logged (code only).
 */
export async function orgTimeZone(client: AnyClient, orgId: string): Promise<string> {
  const { data, error } = await client
    .from('associations')
    .select(`name, ${ASSOCIATION_ZONE_COLUMNS}`)
    .eq('organization_id', orgId)
  if (error) {
    console.error('[association-time] org zone read failed', { code: error.code })
    return DEFAULT_ASSOCIATION_TIME_ZONE
  }
  return primaryAssociationZone(data as ZoneRow[] | null)
}

/** Reads one association's zone, by id. Same fallback and logging as `orgTimeZone`. */
export async function associationTimeZoneById(client: AnyClient, associationId: string): Promise<string> {
  const { data, error } = await client.from('associations').select(ASSOCIATION_ZONE_COLUMNS).eq('id', associationId)
  if (error) {
    console.error('[association-time] association zone read failed', { code: error.code })
    return DEFAULT_ASSOCIATION_TIME_ZONE
  }
  return associationTimeZone(((data ?? []) as ZoneRow[])[0] ?? null)
}
