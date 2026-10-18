import type { RosterKind } from './model'

/**
 * One audit_log row per roster export (CSV download or the printable
 * page). Counts and choices only: never an address, a name or contact
 * details. A failed insert is returned so the caller refuses the export:
 * owner contact details do not leave without a record (as data-export).
 */

export type RosterFormat = 'csv' | 'print'

export interface RosterAuditCounts {
  homes: number
  owners?: number
  noOwner: number
  mayBeSuspended?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Insertable = { from: (t: string) => any }

export function rosterAuditRow(args: { orgId: string; userId: string; kind: RosterKind; asOf: string; format: RosterFormat; counts: RosterAuditCounts }) {
  return {
    action: 'statutory_roster_export',
    org_id: args.orgId,
    user_id: args.userId,
    entity_type: 'org',
    entity_id: args.orgId,
    metadata: { kind: args.kind, as_of: args.asOf, format: args.format, counts: args.counts },
  }
}

export async function recordRosterExport(
  db: Insertable,
  args: Parameters<typeof rosterAuditRow>[0],
): Promise<{ ok: true } | { ok: false; code: string | null }> {
  const { error } = (await db.from('audit_log').insert(rosterAuditRow(args))) as { error: { code?: string } | null }
  if (error) {
    console.error('[properties.statutory-roster] audit insert failed', { orgId: args.orgId, code: error.code ?? null })
    return { ok: false, code: error.code ?? null }
  }
  return { ok: true }
}
