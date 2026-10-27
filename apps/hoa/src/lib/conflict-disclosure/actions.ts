'use server'

// BL-165: a board member records their conflict-of-interest disclosure for
// one decision (a bid award or a contract approval). Model: ./model.ts.
// Storage and signing: ./store.ts. Gate: ./load.ts.
//
// Board/admin only, checked before any client exists (a server action is a
// public endpoint). A board member records their own answer; an admin may
// record any board member's. The decision id must be a row of the caller's
// org. The audit row carries ids and codes only: never the note.

import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { fetchBoardMembers } from '@/lib/communications/audience'
import { checkOrgOwned } from '@/lib/org-owned'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  CONFLICT_DISCLOSURE_AUDIT_ACTION,
  DECISION_KINDS,
  DISCLOSURE_STATUSES,
  UUID,
  mayRecordFor,
  parseNote,
  withDisclosure,
  type DecisionKind,
  type DisclosureStatus,
} from './model'
import { readConflictDisclosures, signConflictDisclosures, withConflictDisclosures } from './store'

export interface ConflictDisclosureInput {
  decisionKind: DecisionKind
  decisionId: string
  /** Defaults to the signed-in user. */
  memberId?: string
  status: DisclosureStatus
  note?: string
}

export type ConflictDisclosureResult = { ok: true } | { ok: false; error: string; field?: string }

export async function recordConflictDisclosure(input: ConflictDisclosureInput): Promise<ConflictDisclosureResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (
    typeof input !== 'object' ||
    input === null ||
    !DECISION_KINDS.includes(input.decisionKind) ||
    typeof input.decisionId !== 'string' ||
    !UUID.test(input.decisionId) ||
    !DISCLOSURE_STATUSES.includes(input.status) ||
    (input.memberId !== undefined && (typeof input.memberId !== 'string' || !UUID.test(input.memberId)))
  ) {
    return { ok: false, error: 'Invalid input.' }
  }
  const note = parseNote(input.note)
  if (note === false) return { ok: false, error: 'Keep the note to 280 characters.', field: 'note' }
  if (input.status === 'conflict_recused' && note === '') {
    return { ok: false, error: 'Say briefly what the conflict is.', field: 'note' }
  }

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'Disclosures can’t be saved on this server yet. Contact support.' }

  const owned = await checkOrgOwned(input.decisionKind === 'bid_award' ? 'bids' : 'vendors', input.decisionId, gate.orgId)
  if (owned === 'error') return { ok: false, error: 'Couldn’t check that. Try again.' }
  if (owned !== 'owned') return { ok: false, error: 'We couldn’t find that decision.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }
  const memberId = input.memberId ?? user.id

  let boardIds: string[]
  try {
    boardIds = (await fetchBoardMembers(gate.orgId, ['board'])).map((m) => m.userId)
  } catch {
    return { ok: false, error: 'Couldn’t load the board. Try again.' }
  }
  if (!mayRecordFor(gate.role, user.id, memberId, boardIds)) {
    return { ok: false, error: 'You can record your own disclosure; an admin can record a board member’s.' }
  }

  const res = await supabase
    .from('associations')
    .select('id, compliance_settings')
    .eq('organization_id', gate.orgId)
    .order('name', { ascending: true })
    .range(0, 0)
  if (res.error) {
    console.error('[conflict-disclosure] association read failed', { code: res.error.code ?? null })
    return { ok: false, error: 'Couldn’t load your association. Try again.' }
  }
  const row = (res.data ?? [])[0] as { id: string; compliance_settings: unknown } | undefined
  if (!row) return { ok: false, error: 'No association is set up yet.' }

  // An unverified record is not trusted: this save starts from empty.
  const current = readConflictDisclosures(row.id, row.compliance_settings, secret)
  const now = new Date().toISOString()
  const next = withDisclosure(current.record, {
    decisionKind: input.decisionKind,
    decisionId: input.decisionId,
    memberId,
    status: input.status,
    note,
    recordedAt: now,
    recordedBy: user.id,
  })
  const stored = signConflictDisclosures(row.id, next, { updatedAt: now, updatedBy: user.id }, secret)
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withConflictDisclosures(row.compliance_settings, stored) as never })
    .eq('id', row.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values.
    console.error('[conflict-disclosure] save failed', { code: error?.code ?? 'no_rows', associationId: row.id })
    return { ok: false, error: 'Couldn’t save. Try again.' }
  }

  const { error: auditErr } = await supabase.from('audit_log').insert({
    org_id: gate.orgId,
    user_id: user.id,
    action: CONFLICT_DISCLOSURE_AUDIT_ACTION,
    entity_type: input.decisionKind === 'bid_award' ? 'bid' : 'vendor',
    entity_id: input.decisionId,
    // Ids and codes only. The note is never audited.
    metadata: { decision_kind: input.decisionKind, member_id: memberId, status: input.status },
  })
  if (auditErr) console.error('[conflict-disclosure] audit failed', { decisionId: input.decisionId, code: auditErr.code ?? null })

  revalidatePath('/rfps')
  revalidatePath('/approvals')
  return { ok: true }
}
