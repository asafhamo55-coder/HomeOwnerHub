/**
 * Round 31: a resident's upcoming scheduled hearings, read for the home
 * page and for the calendar route. Not a server action.
 *
 * Scope, in order:
 *   1. the resident's own units -> their home properties in this org
 *      (homePropertiesForUnits, the one bridge rule), read with the
 *      resident's own client;
 *   2. violations on those properties, in this org, not deleted, not
 *      closed (same RLS-bound client);
 *   3. only then the hearing rows for exactly those violations, read with
 *      the service role (violation_hearings is board-only under RLS),
 *      org-scoped, limited columns, passed through residentHearingView so
 *      a hearing the board has not noticed yet shows no day or place.
 *
 * Logs carry codes only. Flag off (M4_APPLIED): nothing is read.
 */
import { M4_APPLIED } from '@homeowner-portal/db/m4'
import { CLOSED_VIOLATION_STATUSES, homePropertiesForUnits, type Db } from '@/lib/violation-response'
import { residentTimeZone } from '@/lib/resident-dues'
import { HEARING_TABLE, RESIDENT_HEARING_COLUMNS, residentHearingView } from './rules'
import { hearingSummary, hearingToUpcoming, nextHearingsFirst, noticeIsOut, type UpcomingHearing } from './upcoming'

export interface HearingUnit {
  unit_id: string
  association_name: string | null
  association_state?: string | null
  association_time_zone?: string | null
}

export type UpcomingHearingsLoad =
  | { kind: 'off' }
  | { kind: 'failed' }
  | { kind: 'ok'; hearings: UpcomingHearing[] }

export async function loadUpcomingHearings(
  deps: { residentDb: Db; admin: Db },
  input: {
    orgId: string
    units: readonly HearingUnit[]
    now?: Date
    /** Narrow to one violation (the calendar route). */
    violationId?: string
    live?: boolean
  },
): Promise<UpcomingHearingsLoad> {
  if (!(input.live ?? M4_APPLIED)) return { kind: 'off' }
  const now = input.now ?? new Date()
  const unitIds = input.units.map((u) => u.unit_id)
  if (unitIds.length === 0) return { kind: 'ok', hearings: [] }

  const homes = await homePropertiesForUnits(deps.residentDb, unitIds, input.orgId)
  if (homes === null) return { kind: 'failed' }
  if (homes.length === 0) return { kind: 'ok', hearings: [] }
  const unitByProperty = new Map(homes.map((h) => [h.propertyId, h.unitId]))

  let vq = deps.residentDb
    .from('hoa_violations')
    .select('id, property_id, violation_type, status')
    .in('property_id', [...unitByProperty.keys()])
    .eq('org_id', input.orgId)
    .is('deleted_at', null)
  if (input.violationId) vq = vq.eq('id', input.violationId)
  const vres = (await vq) as {
    data: Array<{ id: string; property_id: string | null; violation_type: string | null; status: string }> | null
    error: { code?: string } | null
  }
  if (vres.error) {
    console.error('[resident-hearings] violations read failed', { code: vres.error.code ?? null })
    return { kind: 'failed' }
  }
  const violations = new Map(
    (vres.data ?? [])
      // Belt and braces: the filter above already did this.
      .filter((v) => v.property_id && unitByProperty.has(v.property_id) && !CLOSED_VIOLATION_STATUSES.has(v.status))
      .map((v) => [v.id, v] as const),
  )
  if (violations.size === 0) return { kind: 'ok', hearings: [] }

  const hres = (await deps.admin
    .from(HEARING_TABLE)
    .select(`${RESIDENT_HEARING_COLUMNS}, violation_id`)
    .eq('organization_id', input.orgId)
    .in('violation_id', [...violations.keys()])
    .eq('status', 'scheduled')) as {
    data: Array<Record<string, unknown>> | null
    error: { code?: string } | null
  }
  if (hres.error) {
    console.error('[resident-hearings] hearings read failed', { code: hres.error.code ?? null })
    return { kind: 'failed' }
  }

  const out: UpcomingHearing[] = []
  for (const row of hres.data ?? []) {
    const violation = typeof row.violation_id === 'string' ? violations.get(row.violation_id) : undefined
    if (!violation || !violation.property_id) continue
    const unit = input.units.find((u) => u.unit_id === unitByProperty.get(violation.property_id!))
    if (!unit) continue
    const timeZone = residentTimeZone([unit])
    // The notice date must have arrived in the association's zone.
    if (!noticeIsOut(row.notice_sent_on, timeZone, now)) continue
    const item = hearingToUpcoming(residentHearingView(row), {
      violationId: violation.id,
      summary: hearingSummary(violation.violation_type),
      associationName: unit.association_name,
      state: unit.association_state ?? null,
      timeZone,
    })
    if (item) out.push(item)
  }
  return { kind: 'ok', hearings: nextHearingsFirst(out, now) }
}
