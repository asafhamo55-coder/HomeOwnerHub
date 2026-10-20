/**
 * BL-131 FULL (migration 0067, M3_APPLIED): the dashboard's read of
 * compliance_deadlines_done, plus the lazy copy of the signed
 * acknowledgments (compliance_settings.compliance_deadline_acks) into rows.
 *
 * Flag off: returns null without touching the database — callers then use
 * the signed acknowledgments alone, exactly as before 0067.
 *
 * Flag on: reads the org's rows with the caller's own client (board RLS),
 * then inserts a row for every verified acknowledgment that has none.
 * The insert is ON CONFLICT DO NOTHING on (association_id, code), so two
 * dashboards loading at once never fail each other, and a failure only
 * logs (the acknowledgment keeps counting until the next load copies it).
 * The acknowledgments themselves are left in place: harmless, and the
 * fallback if the flag is ever turned back off.
 *
 * Not a server action (no 'use server'); called from server components.
 * Ids and error codes only in logs.
 */

import { M3_APPLIED } from '@homeowner-portal/db/m3'
import {
  COMPLIANCE_DONE_TABLE,
  acksToMigrate,
  loadComplianceDone,
  type ComplianceAssociationInput,
  type ComplianceDoneByAssociation,
} from './deadlines'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = { from: (table: string) => any }

export async function loadComplianceDoneAndMigrate(
  db: LooseDb,
  orgId: string,
  associations: readonly ComplianceAssociationInput[],
  secret: string | null,
  live: boolean = M3_APPLIED,
): Promise<ComplianceDoneByAssociation | null> {
  if (!live) return null
  const done = await loadComplianceDone(db, orgId)
  if (!done) return null

  const pending = acksToMigrate(orgId, associations, secret, done)
  if (pending.length === 0) return done

  const { error } = (await db
    .from(COMPLIANCE_DONE_TABLE)
    .upsert(pending, { onConflict: 'association_id,code', ignoreDuplicates: true })) as {
    error: { code?: string } | null
  }
  if (error) {
    console.error('[compliance-deadlines] ack migration failed', { orgId, rows: pending.length, code: error.code ?? null })
    return done
  }
  for (const row of pending) {
    const byCode = done.get(row.association_id) ?? new Map()
    byCode.set(row.code, { doneAt: row.done_at, doneBy: row.done_by })
    done.set(row.association_id, byCode)
  }
  return done
}
