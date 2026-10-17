import { ASSOCIATION_ZONE_COLUMNS, DEFAULT_ASSOCIATION_TIME_ZONE, associationTimeZone } from '@/lib/association-time'
import { buildZoneIndex, type ZoneIndex, type ZoneIndexRow } from '@/lib/association-zone-index'
import { readAllResult } from '@/lib/supabase/read-all'

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

/** Org ids per `.in()` read, so a sweep across every org keeps its URL short. */
const ZONE_INDEX_CHUNK = 100

/**
 * Reads the zones of every association in `orgIds` (BL-065), for rows
 * scoped to an association or to a whole org (association-zone-index.ts).
 * Paged past the 1000-row cap. A failed read is returned, never papered
 * over with Eastern: the cron must not alert or roll on a guessed day.
 */
export async function loadZoneIndex(
  client: AnyClient,
  orgIds: readonly string[],
): Promise<{ ok: true; index: ZoneIndex } | { ok: false; error: { code?: string; message?: string } }> {
  const unique = [...new Set(orgIds)]
  const rows: ZoneIndexRow[] = []
  for (let i = 0; i < unique.length; i += ZONE_INDEX_CHUNK) {
    const chunk = unique.slice(i, i + ZONE_INDEX_CHUNK)
    const { data, error } = await readAllResult<ZoneIndexRow>((from, to) =>
      client
        .from('associations')
        .select(`id, organization_id, name, ${ASSOCIATION_ZONE_COLUMNS}`)
        .in('organization_id', chunk)
        .order('id', { ascending: true })
        .range(from, to),
    )
    if (error) return { ok: false, error }
    rows.push(...(data ?? []))
  }
  return { ok: true, index: buildZoneIndex(rows) }
}
