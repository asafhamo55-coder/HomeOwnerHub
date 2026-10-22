'use server'

// BL-149: the Georgia registration kit's one write. The board records its
// register-or-opt-out decision, each filing (registration, renewal,
// amended registration) with its day and confirmation number, that an
// election changed no officers, and the address and registered agent
// lines for the printed sheet. Model: ./model.ts. Storage and signing:
// ./store.ts.
//
// Board/admin only: the role is checked (requireBoardOrAdminForAction)
// before any client exists, because a server action is a public endpoint.
// The association must be one of the current org's and in Georgia. Every
// change writes one audit row with ids and codes only (never a date the
// board typed, a confirmation number, an address or a name). Nothing is
// sent to anyone, and nothing is filed with the Secretary of State.

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { loadOrFail } from '@/lib/load-or-fail'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { complianceState } from '@/lib/compliance/deadlines'
import {
  GA_AMENDMENT_REASONS,
  GA_FIRST_REGISTRATION_YEAR,
  GA_REGISTRATION_AUDIT_ACTION,
  GA_REGISTRATION_KIT_HREF,
  UUID,
  applyGaRegistrationEdit,
  defaultCoversYear,
  isCalendarDay,
  parseConfirmation,
  parseDetail,
  type GaAmendmentReason,
  type GaFiling,
  type GaRegistrationEdit,
} from './model'
import { readGaRegistration, signGaRegistration, withGaRegistration } from './store'

export type GaRegistrationInput =
  | { op: 'decide'; associationId: string; decision: 'register' | 'opt_out' }
  | {
      op: 'add_filing'
      associationId: string
      kind: 'registration' | 'renewal' | 'amendment'
      filedOn: string
      confirmation?: string
      /** registration / renewal: the year it covers; defaults from the filing day. */
      coversYear?: number | null
      /** amendment only. */
      reason?: GaAmendmentReason
      /** amendment only: the election's meeting. */
      meetingId?: string | null
    }
  | { op: 'remove_filing'; associationId: string; filingId: string }
  | { op: 'no_change'; associationId: string; meetingId: string }
  | { op: 'undo_no_change'; associationId: string; meetingId: string }
  | { op: 'details'; associationId: string; mailingAddress?: string; registeredAgent?: string }

export type GaRegistrationResult = { ok: true } | { ok: false; error: string; field?: string }

type AssocRow = {
  id: string
  state: string | null
  governing_law_state: string | null
  compliance_settings: unknown
}

/** The association's today is not known here; a filing day may be at most a day ahead of UTC's. */
function notFuture(day: string): boolean {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return day <= tomorrow
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/** The input as one edit, or the reason it can't be. */
function toEdit(input: GaRegistrationInput): { ok: true; edit: GaRegistrationEdit } | { ok: false; error: string; field?: string } {
  switch (input.op) {
    case 'decide':
      if (input.decision !== 'register' && input.decision !== 'opt_out') return { ok: false, error: 'Invalid input.' }
      return { ok: true, edit: { op: 'decide', decision: input.decision, today: todayUtc() } }
    case 'add_filing': {
      if (input.kind !== 'registration' && input.kind !== 'renewal' && input.kind !== 'amendment') return { ok: false, error: 'Invalid input.' }
      if (!isCalendarDay(input.filedOn)) return { ok: false, error: 'Enter the day it was filed.', field: 'filedOn' }
      if (!notFuture(input.filedOn)) return { ok: false, error: 'The filing day can’t be in the future.', field: 'filedOn' }
      const confirmation = parseConfirmation(input.confirmation)
      if (confirmation === false) {
        return { ok: false, error: 'Use letters, numbers, spaces and - / . # only (up to 64).', field: 'confirmation' }
      }
      if (input.kind === 'amendment') {
        const reason = input.reason ?? (input.meetingId ? 'officers' : undefined)
        if (!reason || !GA_AMENDMENT_REASONS.includes(reason)) return { ok: false, error: 'Pick what changed.', field: 'reason' }
        const meetingId = input.meetingId ?? null
        if (meetingId !== null && !UUID.test(meetingId)) return { ok: false, error: 'Invalid input.' }
        const filing: GaFiling = { id: randomUUID(), kind: 'amendment', filedOn: input.filedOn, confirmation, coversYear: null, reason, meetingId }
        return { ok: true, edit: { op: 'add_filing', filing } }
      }
      const year = input.coversYear ?? defaultCoversYear(input.kind, input.filedOn)
      if (!Number.isInteger(year) || year < GA_FIRST_REGISTRATION_YEAR || year > Number(input.filedOn.slice(0, 4)) + 1) {
        return { ok: false, error: 'Pick the year this filing covers: the year it was filed, or the next one.', field: 'coversYear' }
      }
      const filing: GaFiling = { id: randomUUID(), kind: input.kind, filedOn: input.filedOn, confirmation, coversYear: year, reason: null, meetingId: null }
      return { ok: true, edit: { op: 'add_filing', filing } }
    }
    case 'remove_filing':
      if (typeof input.filingId !== 'string' || !UUID.test(input.filingId)) return { ok: false, error: 'Invalid input.' }
      return { ok: true, edit: { op: 'remove_filing', filingId: input.filingId } }
    case 'no_change':
    case 'undo_no_change':
      if (typeof input.meetingId !== 'string' || !UUID.test(input.meetingId)) return { ok: false, error: 'Invalid input.' }
      return { ok: true, edit: { op: input.op, meetingId: input.meetingId } }
    case 'details': {
      const mailingAddress = parseDetail(input.mailingAddress)
      if (mailingAddress === false) return { ok: false, error: 'Keep the address to one line of up to 200 characters.', field: 'mailingAddress' }
      const registeredAgent = parseDetail(input.registeredAgent)
      if (registeredAgent === false) return { ok: false, error: 'Keep the registered agent to one line of up to 200 characters.', field: 'registeredAgent' }
      return { ok: true, edit: { op: 'details', mailingAddress, registeredAgent } }
    }
    default:
      return { ok: false, error: 'Invalid input.' }
  }
}

/** Ids and codes only: what audit_log keeps about one change. */
function auditMetadata(edit: GaRegistrationEdit): Record<string, string | number | null> {
  switch (edit.op) {
    case 'decide':
      return { op: 'decide', decision: edit.decision }
    case 'add_filing':
      return { op: 'add_filing', kind: edit.filing.kind, filing_id: edit.filing.id, meeting_id: edit.filing.meetingId, reason: edit.filing.reason }
    case 'remove_filing':
      return { op: 'remove_filing', filing_id: edit.filingId }
    case 'no_change':
    case 'undo_no_change':
      return { op: edit.op, meeting_id: edit.meetingId }
    case 'details':
      return { op: 'details' }
  }
}

export async function updateGaRegistration(input: GaRegistrationInput): Promise<GaRegistrationResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof input !== 'object' || input === null || typeof input.associationId !== 'string' || !UUID.test(input.associationId)) {
    return { ok: false, error: 'Invalid input.' }
  }
  const parsed = toEdit(input)
  if (!parsed.ok) return parsed

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'The registration record can’t be saved on this server yet. Contact support.' }

  const supabase = await getSupabaseServerClient()
  // An id from another org loads nothing here and is refused before any write.
  const res = await loadOrFail(
    'ga registration association',
    supabase
      .from('associations')
      .select('id, state, governing_law_state, compliance_settings')
      .eq('organization_id', gate.orgId)
      .eq('id', input.associationId),
  )
  if (!res.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  const row = ((res.data ?? []) as AssocRow[]).find((r) => r.id === input.associationId)
  if (!row) return { ok: false, error: 'That association isn’t part of your organization.' }
  if (complianceState(row.governing_law_state, row.state) !== 'GA') {
    return { ok: false, error: 'The registration kit is for Georgia associations.' }
  }

  // An unverified record is not trusted: the board's edit starts from empty.
  const current = readGaRegistration(row.id, row.compliance_settings, secret)
  const next = applyGaRegistrationEdit(current.record, parsed.edit)
  if (!next.ok) return { ok: false, error: next.error }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const stored = signGaRegistration(row.id, next.record, { updatedAt: new Date().toISOString(), updatedBy: user?.id ?? null }, secret)
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withGaRegistration(row.compliance_settings, stored) as never })
    .eq('id', row.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values (RC-2).
    console.error('[ga-registration] save failed', { code: error?.code ?? 'no_rows', associationId: row.id })
    return { ok: false, error: 'Couldn’t save. Try again.' }
  }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    org_id: gate.orgId,
    user_id: user?.id ?? null,
    action: GA_REGISTRATION_AUDIT_ACTION,
    entity_type: 'association',
    entity_id: row.id,
    metadata: auditMetadata(parsed.edit),
  })
  if (auditErr) console.error('[ga-registration] audit failed', { associationId: row.id, code: auditErr.code ?? null })

  revalidatePath(GA_REGISTRATION_KIT_HREF)
  revalidatePath('/compliance')
  return { ok: true }
}
