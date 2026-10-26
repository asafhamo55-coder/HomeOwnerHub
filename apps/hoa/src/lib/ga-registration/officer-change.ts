/**
 * BL-159: when changeMemberRole (lib/members.ts) moves someone onto or off
 * the board, every Georgia association in the org gets a board role change
 * in its signed registration record (./model.ts `officerChanges`). That
 * starts BL-151's 30-day amended-registration row on /compliance and in the
 * kit, answered the way an election's is: an amended filing, or "officers
 * didn't change". § 43-17A-2(d): "within 30 days" after a change in officers.
 *
 * Server-only (the signing secret). The caller has already made the role
 * change; this never undoes it and never fails it. A failed read or write
 * is logged with ids and codes and reported back, nothing more. A record
 * that doesn't verify is left alone (the board re-records it in the kit;
 * overwriting it from here would discard what it holds).
 *
 * Audit rows: ids and codes only (the change's id, the member's user id,
 * the two role codes). Never a name or an email.
 */

import { randomUUID } from 'node:crypto'
import { complianceState } from '@/lib/compliance/deadlines'
import { GA_REGISTRATION_AUDIT_ACTION, applyGaRegistrationEdit, boardSeatChanged } from './model'
import { readGaRegistration, signGaRegistration, withGaRegistration } from './store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = { from: (table: string) => any }

interface AssocRow {
  id: string
  state: string | null
  governing_law_state: string | null
  compliance_settings: unknown
}

export interface OfficerChangeInput {
  db: LooseDb
  orgId: string
  /** The admin who made the change (audit row, signature stamp). */
  actorId: string | null
  /** The member whose role changed. */
  memberId: string
  from: string | null
  to: string
  /** YYYY-MM-DD, the association's today. */
  today: string
  secret: string | null
}

export type OfficerChangeResult =
  /** Not a board seat change, or no Georgia association: nothing to do. */
  | { kind: 'not_needed' }
  /** Associations whose record now holds an open change for today. */
  | { kind: 'started'; associationIds: string[] }
  | { kind: 'failed'; associationIds: string[] }

export async function startGaOfficerChangeClock(input: OfficerChangeInput): Promise<OfficerChangeResult> {
  if (!boardSeatChanged(input.from, input.to)) return { kind: 'not_needed' }
  const res = (await input.db
    .from('associations')
    .select('id, state, governing_law_state, compliance_settings')
    .eq('organization_id', input.orgId)) as { data: AssocRow[] | null; error: { code?: string } | null }
  if (res.error) {
    console.error('[ga-registration] officer change: associations read failed', { orgId: input.orgId, code: res.error.code ?? null })
    return { kind: 'failed', associationIds: [] }
  }
  const georgia = (res.data ?? []).filter((a) => complianceState(a.governing_law_state, a.state) === 'GA')
  if (georgia.length === 0) return { kind: 'not_needed' }
  if (!input.secret) {
    console.error('[ga-registration] officer change: no signing secret', { orgId: input.orgId })
    return { kind: 'failed', associationIds: georgia.map((a) => a.id) }
  }

  const started: string[] = []
  const failed: string[] = []
  for (const row of georgia) {
    const read = readGaRegistration(row.id, row.compliance_settings, input.secret)
    if (read.state === 'unverified') {
      console.error('[ga-registration] officer change: record unverified, left alone', { associationId: row.id })
      failed.push(row.id)
      continue
    }
    const change = { id: randomUUID(), on: input.today }
    const next = applyGaRegistrationEdit(read.record, { op: 'officer_change', change })
    if (!next.ok) {
      failed.push(row.id)
      continue
    }
    // An open change for today already covers this one: nothing to write.
    if (!(next.record.officerChanges ?? []).some((c) => c.id === change.id)) {
      started.push(row.id)
      continue
    }
    const stored = signGaRegistration(row.id, next.record, { updatedAt: new Date().toISOString(), updatedBy: input.actorId }, input.secret)
    const { data, error } = (await input.db
      .from('associations')
      .update({ compliance_settings: withGaRegistration(row.compliance_settings, stored) as never })
      .eq('id', row.id)
      .eq('organization_id', input.orgId)
      .select('id')) as { data: Array<{ id: string }> | null; error: { code?: string } | null }
    if (error || !data || data.length === 0) {
      console.error('[ga-registration] officer change: save failed', { associationId: row.id, code: error?.code ?? 'no_rows' })
      failed.push(row.id)
      continue
    }
    started.push(row.id)
    const { error: auditErr } = (await input.db.from('audit_log').insert({
      org_id: input.orgId,
      user_id: input.actorId,
      action: GA_REGISTRATION_AUDIT_ACTION,
      entity_type: 'association',
      entity_id: row.id,
      metadata: { op: 'officer_change', change_id: change.id, member_id: input.memberId, from_role: input.from, to_role: input.to },
    })) as { error: { code?: string } | null }
    if (auditErr) console.error('[ga-registration] officer change: audit failed', { associationId: row.id, code: auditErr.code ?? null })
  }
  return failed.length > 0 ? { kind: 'failed', associationIds: failed } : { kind: 'started', associationIds: started }
}
