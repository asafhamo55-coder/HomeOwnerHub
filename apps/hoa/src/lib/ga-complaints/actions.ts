'use server'

// BL-161: the one write for the Secretary of State complaint record. The
// board records that a resident filed a complaint (the day, and whether it
// is about fines, fees or both), the day the hearing officer rendered
// conclusions and whether the stay was extended 15 days, or removes an
// entry recorded by mistake. Model: ./model.ts. Storage and signing:
// ./store.ts.
//
// Board/admin only: the role is checked (requireBoardOrAdminForAction)
// before any client exists, because a server action is a public endpoint.
// The unit must be the current org's and its association in Georgia.
// Every change writes one audit row with ids and codes only (never a date
// the board typed, a name or an address). Nothing is sent to anyone, and
// nothing is filed with the Secretary of State.

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { loadOrFail } from '@/lib/load-or-fail'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { complianceState } from '@/lib/compliance/deadlines'
import {
  GA_COMPLAINT_AUDIT_ACTION,
  GA_COMPLAINT_SUBJECTS,
  UUID,
  applyGaComplaintEdit,
  isCalendarDay,
  type GaComplaintEdit,
  type GaComplaintSubject,
} from './model'
import { readGaComplaints, signGaComplaints, withGaComplaints } from './store'

export type GaComplaintInput =
  | { op: 'add'; unitId: string; filedOn: string; subject: GaComplaintSubject }
  | { op: 'conclude'; unitId: string; complaintId: string; conclusionsOn: string | null; extended?: boolean }
  | { op: 'remove'; unitId: string; complaintId: string }

export type GaComplaintResult = { ok: true } | { ok: false; error: string; field?: string }

/** The association's today is not known here; a day may be at most a day ahead of UTC's. */
function notFuture(day: string): boolean {
  return day <= new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function toEdit(input: GaComplaintInput): { ok: true; edit: GaComplaintEdit } | { ok: false; error: string; field?: string } {
  switch (input.op) {
    case 'add':
      if (!isCalendarDay(input.filedOn)) return { ok: false, error: 'Enter the day the complaint was filed.', field: 'filedOn' }
      if (!notFuture(input.filedOn)) return { ok: false, error: 'The filing day can’t be in the future.', field: 'filedOn' }
      if (!GA_COMPLAINT_SUBJECTS.includes(input.subject)) return { ok: false, error: 'Pick what the complaint is about.', field: 'subject' }
      return {
        ok: true,
        edit: { op: 'add', unitId: input.unitId, complaint: { id: randomUUID(), filedOn: input.filedOn, subject: input.subject, conclusionsOn: null, extended: false } },
      }
    case 'conclude': {
      if (typeof input.complaintId !== 'string' || !UUID.test(input.complaintId)) return { ok: false, error: 'Invalid input.' }
      const day = input.conclusionsOn
      if (day !== null && !isCalendarDay(day)) return { ok: false, error: 'Enter the day of the conclusions.', field: 'conclusionsOn' }
      if (day !== null && !notFuture(day)) return { ok: false, error: 'The conclusions day can’t be in the future.', field: 'conclusionsOn' }
      if (input.extended !== undefined && typeof input.extended !== 'boolean') return { ok: false, error: 'Invalid input.' }
      return { ok: true, edit: { op: 'conclude', unitId: input.unitId, complaintId: input.complaintId, conclusionsOn: day, extended: day !== null && input.extended === true } }
    }
    case 'remove':
      if (typeof input.complaintId !== 'string' || !UUID.test(input.complaintId)) return { ok: false, error: 'Invalid input.' }
      return { ok: true, edit: { op: 'remove', unitId: input.unitId, complaintId: input.complaintId } }
    default:
      return { ok: false, error: 'Invalid input.' }
  }
}

/** Ids and codes only: what audit_log keeps about one change. */
function auditMetadata(edit: GaComplaintEdit): Record<string, string | boolean | null> {
  switch (edit.op) {
    case 'add':
      return { op: 'add', unit_id: edit.unitId, complaint_id: edit.complaint.id, subject: edit.complaint.subject }
    case 'conclude':
      return { op: 'conclude', unit_id: edit.unitId, complaint_id: edit.complaintId, concluded: edit.conclusionsOn !== null, extended: edit.extended }
    case 'remove':
      return { op: 'remove', unit_id: edit.unitId, complaint_id: edit.complaintId }
  }
}

type UnitRow = { id: string; association_id: string | null }
type AssocRow = { id: string; state: string | null; governing_law_state: string | null; compliance_settings: unknown }

export async function updateGaComplaint(input: GaComplaintInput): Promise<GaComplaintResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof input !== 'object' || input === null || typeof input.unitId !== 'string' || !UUID.test(input.unitId)) {
    return { ok: false, error: 'Invalid input.' }
  }
  const parsed = toEdit(input)
  if (!parsed.ok) return parsed

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'The complaint record can’t be saved on this server yet. Contact support.' }

  const supabase = await getSupabaseServerClient()
  // A unit or association from another org loads nothing and is refused before any write.
  const unitRes = await loadOrFail('ga complaint unit', supabase.from('units').select('id, association_id').eq('organization_id', gate.orgId).eq('id', input.unitId))
  if (!unitRes.ok) return { ok: false, error: 'Couldn’t load this home. Try again.' }
  const unit = ((unitRes.data ?? []) as UnitRow[]).find((u) => u.id === input.unitId)
  if (!unit || !unit.association_id) return { ok: false, error: 'That home isn’t part of your organization.' }
  const assocRes = await loadOrFail(
    'ga complaint association',
    supabase.from('associations').select('id, state, governing_law_state, compliance_settings').eq('organization_id', gate.orgId).eq('id', unit.association_id),
  )
  if (!assocRes.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  const row = ((assocRes.data ?? []) as AssocRow[]).find((a) => a.id === unit.association_id)
  if (!row) return { ok: false, error: 'That home isn’t part of your organization.' }
  if (complianceState(row.governing_law_state, row.state) !== 'GA') {
    return { ok: false, error: 'The Secretary of State complaint record is for Georgia associations.' }
  }

  // An unverified record is not trusted: the board's edit starts from empty.
  const current = readGaComplaints(row.id, row.compliance_settings, secret)
  const next = applyGaComplaintEdit(current.record, parsed.edit)
  if (!next.ok) return { ok: false, error: next.error }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const stored = signGaComplaints(row.id, next.record, { updatedAt: new Date().toISOString(), updatedBy: user?.id ?? null }, secret)
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withGaComplaints(row.compliance_settings, stored) as never })
    .eq('id', row.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values (RC-2).
    console.error('[ga-complaints] save failed', { code: error?.code ?? 'no_rows', associationId: row.id })
    return { ok: false, error: 'Couldn’t save. Try again.' }
  }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    org_id: gate.orgId,
    user_id: user?.id ?? null,
    action: GA_COMPLAINT_AUDIT_ACTION,
    entity_type: 'unit',
    entity_id: unit.id,
    metadata: auditMetadata(parsed.edit),
  })
  if (auditErr) console.error('[ga-complaints] audit failed', { unitId: unit.id, code: auditErr.code ?? null })

  revalidatePath('/properties/[id]', 'page')
  return { ok: true }
}
