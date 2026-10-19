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
//            A follow-up letter for an existing violation (run input
//            `followUp`, from the violation page) is approved on the run
//            only: no new violation, the existing one untouched.
// Edit     → saveViolationDraftEditsWith rewrites a still-pending draft's
//            letter (the violation page's review step).
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
import { asUnitId, resolvePropertyForUnit } from '@/lib/properties/resolve'
import { orgPhotoPaths } from '@/lib/violation-photo-paths'
import { FOLLOW_UP_NOTICE_MAX, FOLLOW_UP_NOTICE_MIN, followUpOfRunInput } from '@/lib/violation-follow-up'

export type DraftDb = SupabaseClient<Database>

export type DraftDecisionResult = { ok: true } | { ok: false; error: string }
export type DraftApprovalResult =
  | { ok: true; violationId: string; followUp?: boolean }
  | { ok: false; error: string }

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
  args: {
    orgId: string
    runId: string
    userId: string
    /** BL-028: turns the draft's photo keys into URLs for photo_urls (the
     *  wizard stores signed URLs there too). Absent → photos not filed. */
    signPhotos?: (paths: string[]) => Promise<string[]>
  },
): Promise<DraftApprovalResult> {
  const { orgId, runId, userId, signPhotos } = args

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

  // A follow-up letter (second notice, hearing, fine, decision) belongs to
  // an existing violation: approving it records the decision on the run —
  // the letter of record for that step — and opens no new violation. The
  // violation must still exist, or the letter would be filed on nothing.
  const followUp = followUpOfRunInput(input)
  if (followUp) {
    const { data: target, error: targetError } = await db
      .from('hoa_violations')
      .select('id')
      .eq('id', followUp.violationId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle()
    if (targetError) {
      logFailure('follow_up_read', runId, targetError.code)
      return { ok: false, error: 'Couldn’t load the violation for this letter. Try again.' }
    }
    if (!target) return { ok: false, error: 'The violation for this letter no longer exists. Reject the draft instead.' }
  }

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
  if (followUp) return { ok: true, violationId: followUp.violationId, followUp: true }

  // hoa_violations.property_id points at legacy hoa_properties; W3 takes a
  // unit. A unit with no legacy link (or a draft with no unit) files with
  // no property rather than failing the approval.
  let propertyId: string | null = null
  const unitId = text(input.unitId)
  if (unitId) {
    // A failed bridge read files with no property, as an unlinked unit does
    // (the approval itself must not fail over it).
    propertyId = await resolvePropertyForUnit(db, orgId, asUnitId(unitId)).catch(() => null)
  }

  // BL-028: an inspection draft carries the photos it was taken with. Only
  // this org's keys are signed (the route checked them; re-checked here as
  // the run's input is just JSON). A signing failure files the violation
  // without photos rather than failing the approval.
  const photoPaths = orgPhotoPaths(orgId, input.photoPaths)
  let photoUrls: string[] = []
  if (photoPaths.length > 0 && signPhotos) {
    photoUrls = await signPhotos(photoPaths).catch(() => {
      logFailure('sign_photos', runId, undefined)
      return []
    })
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
      photo_urls: photoUrls.length > 0 ? photoUrls : null,
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

/**
 * The board's edits to a pending W3 draft, before anyone approves it. The
 * letter the board approves is the edited one (approval reads
 * output.notice); the model's original is kept once as `draftNotice` so the
 * W3 acceptance metric (approved without edits) can still be measured.
 * Conditional on the run still pending: a decided draft is not rewritten.
 */
export async function saveViolationDraftEditsWith(
  db: DraftDb,
  args: { orgId: string; runId: string; notice: string },
): Promise<DraftDecisionResult> {
  const { orgId, runId } = args
  const notice = args.notice.trim()
  if (notice.length < FOLLOW_UP_NOTICE_MIN) return { ok: false, error: 'The letter is empty.' }
  if (notice.length > FOLLOW_UP_NOTICE_MAX) {
    return { ok: false, error: `Keep the letter under ${FOLLOW_UP_NOTICE_MAX.toLocaleString('en-US')} characters.` }
  }

  const { data: run, error: readError } = await db
    .from('ai_runs')
    .select('id, status, output')
    .eq('id', runId)
    .eq('organization_id', orgId)
    .eq('workflow_id', 'W3')
    .maybeSingle()
  if (readError) {
    logFailure('edit_read', runId, readError.code)
    return { ok: false, error: 'Couldn’t load that draft. Try again.' }
  }
  if (!run) return { ok: false, error: 'That draft no longer exists.' }
  if (run.status !== PENDING) return { ok: false, error: ALREADY_DECIDED }

  const output = obj(run.output)
  const original = text(output.draftNotice) ?? text(output.notice)
  if (original === notice && !text(output.draftNotice)) return { ok: true }
  const next = { ...output, notice, draftNotice: original ?? notice }

  const { data, error } = await db
    .from('ai_runs')
    .update({ output: next as never })
    .eq('id', runId)
    .eq('organization_id', orgId)
    .eq('workflow_id', 'W3')
    .eq('status', PENDING)
    .select('id')
  if (error) {
    logFailure('edit', runId, error.code)
    return { ok: false, error: 'Couldn’t save your changes. Try again.' }
  }
  if (!data || data.length === 0) return { ok: false, error: ALREADY_DECIDED }
  return { ok: true }
}
