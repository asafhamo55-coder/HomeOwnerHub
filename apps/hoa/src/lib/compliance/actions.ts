'use server'

// BL-131 stopgap: the board's "Mark as done" on a statutory deadline.
// The list, the signing and the day math: ./deadlines.ts.
//
// Board/admin only: every action re-checks the role
// (requireBoardOrAdminForAction) because a server action is a public
// endpoint. The association must be one of the current org's, and the
// deadline must apply to its state.
//
// M3_APPLIED (migration 0067): "done" is a compliance_deadlines_done row
// (board RLS, ON CONFLICT DO NOTHING so a second click is a no-op) instead
// of a signed acknowledgment in compliance_settings. Flag off: unchanged.
//
// BL-145, M5_APPLIED (0069 part 4): "Mark as done" may carry an evidence
// document, and attachComplianceEvidence sets or clears it on a row that is
// already done. The document must be one of the org's (checked here before
// the write; the database trigger refuses another org's with 23503 too).
// Flag off: a documentId is refused and the evidence action does nothing.

import { revalidatePath } from 'next/cache'
import { M3_APPLIED } from '@homeowner-portal/db/m3'
import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getCurrentOrg } from '@/lib/orgs'
import { loadOrFail } from '@/lib/load-or-fail'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  COMPLIANCE_DONE_TABLE,
  complianceState,
  deadlinesForState,
  isKnownDeadlineCode,
  signComplianceAck,
  withComplianceAck,
} from './deadlines'

export type MarkComplianceDoneResult = { ok: true } | { ok: false; error: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = { from: (table: string) => any }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type AssocRow = {
  id: string
  state: string | null
  governing_law_state: string | null
  compliance_settings: unknown
}

function revalidate() {
  revalidatePath('/')
  revalidatePath('/compliance')
}

/** null: none given. false: malformed, or given while evidence is off. */
function documentIdOf(v: unknown): string | null | false {
  if (v === undefined || v === null || v === '') return null
  if (!M5_APPLIED || typeof v !== 'string' || !UUID.test(v)) return false
  return v
}

/** The document is the org's own (hoa_documents.org_id). Ids and codes only in the log. */
async function isOrgDocument(db: LooseDb, orgId: string, documentId: string): Promise<boolean | null> {
  const { data, error } = (await db.from('hoa_documents').select('id').eq('org_id', orgId).eq('id', documentId)) as {
    data: Array<{ id: string }> | null
    error: { code?: string } | null
  }
  if (error) {
    console.error('[compliance-deadlines] evidence document check failed', { code: error.code ?? 'unknown', documentId })
    return null
  }
  return (data ?? []).some((d) => d.id === documentId)
}

export async function markComplianceDeadlineDone(input: {
  associationId: string
  code: string
  /** BL-145 (M5_APPLIED): the evidence document, one of the org's. */
  documentId?: string | null
}): Promise<MarkComplianceDoneResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof input?.associationId !== 'string' || !UUID.test(input.associationId) || !isKnownDeadlineCode(input.code)) {
    return { ok: false, error: 'Invalid input.' }
  }
  const documentId = documentIdOf(input.documentId)
  if (documentId === false) return { ok: false, error: 'Invalid input.' }

  const secret = M3_APPLIED ? null : paySettingsSecret()
  if (!M3_APPLIED && !secret) return { ok: false, error: 'This can’t be saved on this server yet. Contact support.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'You are not signed in to an organization.' }
  const supabase = await getSupabaseServerClient()
  // An id from another org loads nothing here and is refused before any write.
  const res = await loadOrFail(
    'compliance deadline association',
    supabase
      .from('associations')
      .select('id, state, governing_law_state, compliance_settings')
      .eq('organization_id', org.id)
      .eq('id', input.associationId),
  )
  if (!res.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  const row = ((res.data ?? []) as AssocRow[]).find((r) => r.id === input.associationId)
  if (!row) return { ok: false, error: 'That association isn’t part of your organization.' }
  const applies = deadlinesForState(complianceState(row.governing_law_state, row.state)).some(
    (d) => d.code === input.code,
  )
  if (!applies) return { ok: false, error: 'That deadline doesn’t apply to this association’s state.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (M3_APPLIED) {
    const db = supabase as unknown as LooseDb
    if (documentId) {
      const mine = await isOrgDocument(db, org.id, documentId)
      if (mine === null) return { ok: false, error: 'Couldn’t check that document. Try again.' }
      if (!mine) return { ok: false, error: 'That document isn’t in your association’s documents.' }
    }
    // compliance_deadlines_done is not in the generated types until
    // gen:types runs after prod has 0067 (CLAUDE.md footgun 3).
    const { error } = await db.from(COMPLIANCE_DONE_TABLE).upsert(
      {
        organization_id: org.id,
        association_id: row.id,
        code: input.code,
        done_at: new Date().toISOString(),
        done_by: user?.id ?? null,
        // Only with M5_APPLIED (documentIdOf refuses one otherwise): the
        // column doesn't exist before 0069.
        ...(documentId ? { document_id: documentId } : {}),
      },
      { onConflict: 'association_id,code', ignoreDuplicates: true },
    )
    if (error) {
      // Code only: a Postgres message can embed row values (RC-2).
      console.error('[compliance-deadlines] mark done failed', { code: error.code ?? 'unknown', associationId: row.id })
      return { ok: false, error: 'Couldn’t save. Try again.' }
    }
    if (documentId) {
      // Someone else marked it done a moment earlier (the upsert above was a
      // no-op): still attach this evidence, unless that row already has some.
      const { error: attachError } = await db
        .from(COMPLIANCE_DONE_TABLE)
        .update({ document_id: documentId })
        .eq('organization_id', org.id)
        .eq('association_id', row.id)
        .eq('code', input.code)
        .is('document_id', null)
      if (attachError) {
        console.error('[compliance-deadlines] attach evidence failed', { code: attachError.code ?? 'unknown', associationId: row.id })
        return { ok: false, error: 'Marked as done, but the evidence wasn’t saved. Attach it again.' }
      }
    }
    revalidate()
    return { ok: true }
  }
  // Signed acknowledgments have nowhere to keep evidence.
  if (documentId) return { ok: false, error: 'Evidence can’t be saved on this server yet.' }

  const stored = signComplianceAck(
    row.id,
    input.code,
    { doneAt: new Date().toISOString(), doneBy: user?.id ?? null },
    secret as string,
  )
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withComplianceAck(row.compliance_settings, input.code, stored) as never })
    .eq('id', row.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values (RC-2).
    console.error('[compliance-deadlines] mark done failed', { code: error?.code ?? 'no_rows', associationId: row.id })
    return { ok: false, error: 'Couldn’t save. Try again.' }
  }

  revalidate()
  return { ok: true }
}

/**
 * BL-145 (M5_APPLIED): set, replace or clear (`documentId: null`) the
 * evidence on a deadline already marked done. Board/admin only; the row
 * must be the current org's; the document must be the org's.
 */
export async function attachComplianceEvidence(input: {
  associationId: string
  code: string
  documentId: string | null
}): Promise<MarkComplianceDoneResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!M5_APPLIED || !M3_APPLIED) return { ok: false, error: 'Evidence can’t be saved on this server yet.' }
  if (typeof input?.associationId !== 'string' || !UUID.test(input.associationId) || !isKnownDeadlineCode(input.code)) {
    return { ok: false, error: 'Invalid input.' }
  }
  const documentId = documentIdOf(input.documentId)
  if (documentId === false) return { ok: false, error: 'Invalid input.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'You are not signed in to an organization.' }
  const db = (await getSupabaseServerClient()) as unknown as LooseDb
  if (documentId) {
    const mine = await isOrgDocument(db, org.id, documentId)
    if (mine === null) return { ok: false, error: 'Couldn’t check that document. Try again.' }
    if (!mine) return { ok: false, error: 'That document isn’t in your association’s documents.' }
  }
  const { data, error } = (await db
    .from(COMPLIANCE_DONE_TABLE)
    .update({ document_id: documentId })
    .eq('organization_id', org.id)
    .eq('association_id', input.associationId)
    .eq('code', input.code)
    .select('id')) as { data: Array<{ id: string }> | null; error: { code?: string } | null }
  if (error) {
    console.error('[compliance-deadlines] attach evidence failed', { code: error.code ?? 'unknown', associationId: input.associationId })
    return { ok: false, error: 'Couldn’t save. Try again.' }
  }
  if (!data || data.length === 0) return { ok: false, error: 'Mark it as done first, then attach the evidence.' }
  revalidate()
  return { ok: true }
}
