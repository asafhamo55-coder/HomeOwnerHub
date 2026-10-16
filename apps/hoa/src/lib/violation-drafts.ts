// BL-048 — the board's decision on a W3 (Violation Inspector) draft.
//
// W3 stages every draft in ai_runs as 'pending_human_approval' and, until
// now, nothing decided one: the queue at /violations/approval-queue was
// review-only. This is the one place that decision is made; the server
// actions in lib/violations.ts (approveViolationDraft / rejectViolationDraft)
// gate and call it, and /approvals dispatches to those actions.
//
// Approve  → claim the run (conditional on it still pending, so two board
//            members cannot both approve it), then file the letter as an
//            OPEN hoa_violations row with the approval recorded. Approving
//            DELIVERS NOTHING: there is no email/SMS here, so the row is
//            not marked notice_sent — the board records the notice on the
//            violation once it actually goes out. If filing fails, the
//            claim is undone so the draft returns to the queue.
// Reject   → claim the run as not approved, keeping the board's reason in
//            ai_runs.human_feedback (the W3 acceptance metrics read
//            human_approved / human_feedback).
//
// ai_runs.status only allows completed|failed|pending_human_approval
// (0004), so a decided run is 'completed' with human_approved true/false.
//
// Pure: takes the caller's RLS client (ai_runs is board/admin-only by
// 0036), no Next, no `@/` imports — unit-testable with a fake client.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'

export type DraftDb = SupabaseClient<Database>

export type DraftDecisionResult = { ok: true } | { ok: false; error: string }
export type DraftApprovalResult = { ok: true; violationId: string } | { ok: false; error: string }

const PENDING = 'pending_human_approval'
const ALREADY_DECIDED = 'Someone already decided this draft.'
const SEVERITIES = new Set(['low', 'medium', 'high'])

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null
}

function logFailure(stage: string, runId: string, code: string | undefined): void {
  // Ids and codes only — never the letter, the description or an address.
  console.error('violation draft decision failed', { stage, runId, code: code ?? 'unknown' })
}

export async function approveViolationDraftWith(
  db: DraftDb,
  args: { orgId: string; runId: string; userId: string },
): Promise<DraftApprovalResult> {
  const { orgId, runId, userId } = args

  const { data: run, error: readError } = await db
    .from('ai_runs')
    .select('id, status, input, output')
    .eq('id', runId)
    .eq('organization_id', orgId)
    .eq('workflow_id', 'W3')
    .maybeSingle()
  if (readError) {
    logFailure('read', runId, readError.code)
    return { ok: false, error: 'Couldn’t load that draft. Try again.' }
  }
  if (!run) return { ok: false, error: 'That draft no longer exists.' }
  if (run.status !== PENDING) return { ok: false, error: ALREADY_DECIDED }

  const input = obj(run.input)
  const output = obj(run.output)
  const letter = text(output.notice)
  if (!letter) return { ok: false, error: 'This draft has no letter text. Open it in the violation queue instead.' }

  const now = new Date().toISOString()
  const { data: claimed, error: claimError } = await db
    .from('ai_runs')
    .update({ status: 'completed', human_approved: true, human_approver: userId, approved_at: now })
    .eq('id', runId)
    .eq('organization_id', orgId)
    .eq('workflow_id', 'W3')
    .eq('status', PENDING)
    .select('id')
  if (claimError) {
    logFailure('claim', runId, claimError.code)
    return { ok: false, error: 'Couldn’t approve the draft. Try again.' }
  }
  if (!claimed || claimed.length === 0) return { ok: false, error: ALREADY_DECIDED }

  // hoa_violations.property_id points at legacy hoa_properties; W3 takes a
  // unit. A unit with no legacy link (or a draft with no unit) files with
  // no property rather than failing the approval.
  let propertyId: string | null = null
  const unitId = text(input.unitId)
  if (unitId) {
    const { data: unit } = await db
      .from('units')
      .select('legacy_hoa_property_id')
      .eq('id', unitId)
      .eq('organization_id', orgId)
      .maybeSingle()
    propertyId = unit?.legacy_hoa_property_id ?? null
  }

  const severity = text(output.recommendedSeverity)
  const fineCents = int(output.recommendedFineAmountCents)
  const cureDays = int(output.recommendedCurePeriodDays)
  const { data: violation, error: insertError } = await db
    .from('hoa_violations')
    .insert({
      org_id: orgId,
      property_id: propertyId,
      description: text(input.description) ?? letter.slice(0, 280),
      violation_type: text(input.violationType) ?? 'general',
      ccr_section: text(output.citedSection),
      severity: severity && SEVERITIES.has(severity) ? severity : null,
      cure_period_days: cureDays !== null && cureDays >= 1 && cureDays <= 180 ? cureDays : null,
      fine_amount: fineCents !== null && fineCents >= 0 ? fineCents / 100 : null,
      ai_draft_letter: letter,
      approved_letter: letter,
      approved_at: now,
      approved_by: userId,
      status: 'open',
      created_by: userId,
    })
    .select('id')
    .single()

  if (insertError || !violation) {
    logFailure('file', runId, insertError?.code)
    // Undo only the claim this approval made, so the draft is decidable again.
    const { error: revertError } = await db
      .from('ai_runs')
      .update({ status: PENDING, human_approved: null, human_approver: null, approved_at: null })
      .eq('id', runId)
      .eq('organization_id', orgId)
      .eq('status', 'completed')
      .eq('human_approver', userId)
    if (revertError) logFailure('revert', runId, revertError.code)
    return { ok: false, error: 'Couldn’t file the violation, so the draft was not approved. Try again.' }
  }

  return { ok: true, violationId: violation.id }
}

export async function rejectViolationDraftWith(
  db: DraftDb,
  args: { orgId: string; runId: string; userId: string; reason: string },
): Promise<DraftDecisionResult> {
  const { orgId, runId, userId, reason } = args
  const { data, error } = await db
    .from('ai_runs')
    .update({ status: 'completed', human_approved: false, human_approver: userId, human_feedback: reason })
    .eq('id', runId)
    .eq('organization_id', orgId)
    .eq('workflow_id', 'W3')
    .eq('status', PENDING)
    .select('id')
  if (error) {
    logFailure('reject', runId, error.code)
    return { ok: false, error: 'Couldn’t reject the draft. Try again.' }
  }
  if (!data || data.length === 0) return { ok: false, error: ALREADY_DECIDED }
  return { ok: true }
}
