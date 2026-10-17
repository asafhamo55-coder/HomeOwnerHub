import { DEFAULT_ASSOCIATION_TIME_ZONE, associationTimeZone, todayIn } from '@/lib/association-time'

/**
 * Zones for rows that are scoped to an association OR to a whole org
 * (BL-065) — recurring events carry a nullable association_id. Pure and
 * browser-safe; association-time-server.ts loads the rows.
 *
 *  - An association-scoped row reads its association's zone.
 *  - An org-wide row (association_id null) reads the org's primary
 *    association: the first by name, as /dues and primaryAssociationZone
 *    pick it.
 *  - Unknown association → its org's zone → America/New_York.
 *
 * The events pages and the recurring-events cron both resolve through
 * here, so the page's "Sending today" and the cron's send agree on a day.
 */

export interface ZoneIndexRow {
  id: string
  organization_id: string
  name?: string | null
  state?: string | null
  timezone?: string | null
}

export interface ZoneIndex {
  byAssociation: ReadonlyMap<string, string>
  byOrg: ReadonlyMap<string, string>
}

export function buildZoneIndex(rows: readonly ZoneIndexRow[] | null | undefined): ZoneIndex {
  const byAssociation = new Map<string, string>()
  const primary = new Map<string, ZoneIndexRow>()
  for (const row of rows ?? []) {
    byAssociation.set(row.id, associationTimeZone(row))
    const current = primary.get(row.organization_id)
    if (!current || (row.name ?? '').localeCompare(current.name ?? '') < 0) primary.set(row.organization_id, row)
  }
  const byOrg = new Map<string, string>()
  for (const [orgId, row] of primary) byOrg.set(orgId, associationTimeZone(row))
  return { byAssociation, byOrg }
}

export function scopeTimeZone(index: ZoneIndex, organizationId: string, associationId: string | null | undefined): string {
  return (
    (associationId ? index.byAssociation.get(associationId) : undefined) ??
    index.byOrg.get(organizationId) ??
    DEFAULT_ASSOCIATION_TIME_ZONE
  )
}

/** The scoped row's calendar day at `now`. */
export function scopeToday(
  index: ZoneIndex,
  organizationId: string,
  associationId: string | null | undefined,
  now: Date = new Date(),
): string {
  return todayIn(scopeTimeZone(index, organizationId, associationId), now)
}
