'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { VIOLATION_STATUSES, type ViolationStatus } from '@/lib/violation-statuses'
import { approveViolationDraftWith, rejectViolationDraftWith } from '@/lib/violation-drafts'
import {
  CURE_COMMITMENT_AUDIT,
  CURE_COMMITMENT_ENTITY,
  cureCommitmentApplies,
  cureCommitmentInputSchema,
  cureCommitmentPenaltyBlock,
  loadCureCommitment,
  loadOrgStateRules,
} from '@/lib/violation-cure-commitment'

const STORAGE_BUCKET = 'hoa-photos'

const CreateSchema = z.object({
  property_id: z.string().uuid(),
  description: z.string().trim().min(3, 'Describe what was observed.'),
  violation_type: z.string().trim().min(2),
  ccr_section: z.string().trim().nullable(),
  severity: z.enum(['low', 'medium', 'high']).nullable(),
  cure_period_days: z.number().int().min(1).max(180).default(14),
  fine_amount: z.number().min(0).max(1000).default(25),
  ai_draft_letter: z.string().nullable(),
  approved_letter: z.string().min(10, 'Approved letter is empty.'),
  photo_storage_paths: z.array(z.string()).default([]),
})

export interface CreateViolationInput {
  propertyId: string
  description: string
  violationType: string
  ccrSection: string | null
  severity: 'low' | 'medium' | 'high' | null
  curePeriodDays: number
  fineAmount: number
  aiDraftLetter: string | null
  approvedLetter: string
  photoStoragePaths: string[]
}

export interface CreateViolationResult {
  ok: true
  violationId: string
}
export interface CreateViolationError {
  ok: false
  error: string
}

// Called from the wizard after the user approves the letter via BarBGate.
// Inserts the row, marks notice_sent_at = now, records who approved.
export async function createApprovedViolation(
  input: CreateViolationInput,
): Promise<CreateViolationResult | CreateViolationError> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = CreateSchema.safeParse({
    property_id: input.propertyId,
    description: input.description,
    violation_type: input.violationType,
    ccr_section: input.ccrSection,
    severity: input.severity,
    cure_period_days: input.curePeriodDays,
    fine_amount: input.fineAmount,
    ai_draft_letter: input.aiDraftLetter,
    approved_letter: input.approvedLetter,
    photo_storage_paths: input.photoStoragePaths,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  // Sign each photo into a long-lived URL we can store on the row. RLS still
  // protects the bucket; the URL is just a convenience for rendering later.
  const photoUrls: string[] = []
  for (const path of parsed.data.photo_storage_paths) {
    const { data: signed } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 365) // 1 year
    if (signed?.signedUrl) photoUrls.push(signed.signedUrl)
  }

  const now = new Date().toISOString()
  const { data: row, error } = await supabase
    .from('hoa_violations')
    .insert({
      org_id: org.id,
      property_id: parsed.data.property_id,
      description: parsed.data.description,
      violation_type: parsed.data.violation_type,
      ccr_section: parsed.data.ccr_section,
      severity: parsed.data.severity,
      cure_period_days: parsed.data.cure_period_days,
      fine_amount: parsed.data.fine_amount,
      photo_urls: photoUrls.length > 0 ? photoUrls : null,
      ai_draft_letter: parsed.data.ai_draft_letter,
      approved_letter: parsed.data.approved_letter,
      approved_at: now,
      approved_by: user.id,
      notice_sent_at: now,
      status: 'notice_sent',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Could not save violation.' }
  }

  revalidatePath('/violations')
  revalidatePath('/')
  return { ok: true, violationId: row.id }
}

// ─── W3 draft decisions (BL-048) ────────────────────────────────────
// The board's approve/reject on an AI-drafted letter (ai_runs W3,
// pending_human_approval). Logic lives in lib/violation-drafts.ts; these
// gate (residents refused before any client exists) and revalidate.
// Approving files the letter as an open violation and sends nothing.

const DraftIdSchema = z.string().uuid()

export async function approveViolationDraft(
  runId: string,
): Promise<{ ok: true; violationId: string } | { ok: false; error: string }> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!DraftIdSchema.safeParse(runId).success) return { ok: false, error: 'That draft isn’t valid.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  // BL-028: inspection drafts carry photo keys; sign them the way
  // createApprovedViolation does (1-year URLs on photo_urls).
  const signPhotos = async (paths: string[]): Promise<string[]> => {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(paths, 60 * 60 * 24 * 365)
    if (error) throw error
    return (data ?? []).flatMap((s) => (s.signedUrl ? [s.signedUrl] : []))
  }
  const result = await approveViolationDraftWith(supabase, { orgId: gate.orgId, runId, userId: user.id, signPhotos })
  if (result.ok) {
    revalidatePath('/violations')
    revalidatePath('/violations/approval-queue')
    revalidatePath('/')
  }
  return result
}

export async function rejectViolationDraft(
  runId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!DraftIdSchema.safeParse(runId).success) return { ok: false, error: 'That draft isn’t valid.' }
  const why = reason.trim().slice(0, 1000)
  if (!why) return { ok: false, error: 'A reason is required to reject.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const result = await rejectViolationDraftWith(supabase, { orgId: gate.orgId, runId, userId: user.id, reason: why })
  if (result.ok) revalidatePath('/violations/approval-queue')
  return result
}

// ─── Status update ──────────────────────────────────────────────────
// Board members move a violation through its lifecycle from the detail
// page: open → notice_sent → (fined →) resolved | dismissed. Each
// transition records who/when via the per-status timestamp columns the
// schema already carries, so the timeline shows the actual history not
// just the current state.
//
// The status enum + type live in ./violation-statuses (plain module)
// so they can be imported by client components — re-exporting them from
// here would violate the "use server" file's async-functions-only rule.

const UpdateStatusSchema = z.object({
  violationId: z.string().uuid(),
  status: z.enum(VIOLATION_STATUSES),
  resolutionNote: z.string().trim().max(2000, "Keep the note under 2,000 characters.").nullable().optional(),
})

export interface UpdateViolationStatusInput {
  violationId: string
  status: ViolationStatus
  resolutionNote?: string | null
}

export type UpdateViolationStatusResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

// ─── Edit violation details ─────────────────────────────────────────

const UpdateViolationSchema = z.object({
  violationId: z.string().uuid(),
  description: z.string().trim().min(3, 'Describe the violation (at least 3 characters).').max(2000, 'Keep the description under 2,000 characters.').optional(),
  violation_type: z.string().trim().min(2, 'Enter a violation type, e.g. Landscaping.').max(200).optional(),
  ccr_section: z.string().trim().nullable().optional(),
  severity: z.enum(['low', 'medium', 'high']).nullable().optional(),
  cure_period_days: z.number({ invalid_type_error: 'Enter a number of days.' }).int('Use whole days.').min(1, 'At least 1 day.').max(180, 'At most 180 days.').optional(),
  fine_amount: z.number({ invalid_type_error: 'Enter an amount.' }).min(0, 'Can’t be negative.').max(1000, 'At most $1,000 per day.').optional(),
})

export interface UpdateViolationInput {
  violationId: string
  description?: string
  violationType?: string
  ccrSection?: string | null
  severity?: 'low' | 'medium' | 'high' | null
  curePeriodDays?: number
  fineAmount?: number
}

export type UpdateViolationResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

// Schema keys → the edit form's field names, so errors land under the right input.
const UPDATE_FIELD_NAMES: Record<string, string> = {
  description: 'description',
  violation_type: 'violationType',
  ccr_section: 'ccrSection',
  severity: 'severity',
  cure_period_days: 'curePeriodDays',
  fine_amount: 'fineAmount',
}

function fieldErrorsOf(issues: z.ZodIssue[], names: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const key = names[String(issue.path[0] ?? '')]
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

export async function updateViolation(
  input: UpdateViolationInput,
): Promise<UpdateViolationResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = UpdateViolationSchema.safeParse({
    violationId: input.violationId,
    description: input.description,
    violation_type: input.violationType,
    ccr_section: input.ccrSection,
    severity: input.severity,
    cure_period_days: input.curePeriodDays,
    fine_amount: input.fineAmount,
  })
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Some fields need attention.',
      fieldErrors: fieldErrorsOf(parsed.error.issues, UPDATE_FIELD_NAMES),
    }
  }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const supabase = await getSupabaseServerClient()
  const patch: Record<string, unknown> = {}
  if (parsed.data.description !== undefined) patch.description = parsed.data.description
  if (parsed.data.violation_type !== undefined) patch.violation_type = parsed.data.violation_type
  if (parsed.data.ccr_section !== undefined) patch.ccr_section = parsed.data.ccr_section
  if (parsed.data.severity !== undefined) patch.severity = parsed.data.severity
  if (parsed.data.cure_period_days !== undefined) patch.cure_period_days = parsed.data.cure_period_days
  if (parsed.data.fine_amount !== undefined) patch.fine_amount = parsed.data.fine_amount

  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await supabase
    .from('hoa_violations')
    .update(patch as never)
    .eq('id', parsed.data.violationId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/violations/${parsed.data.violationId}`)
  revalidatePath('/violations')
  return { ok: true }
}

// ─── Delete violation ───────────────────────────────────────────────

export async function deleteViolation(
  violationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from('hoa_violations')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', violationId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/violations')
  return { ok: true }
}

export async function updateViolationStatus(
  input: UpdateViolationStatusInput,
): Promise<UpdateViolationStatusResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = UpdateStatusSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input.',
      fieldErrors: fieldErrorsOf(parsed.error.issues, { status: 'status', resolutionNote: 'resolutionNote' }),
    }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  // CA § 5855(c)(2): a recorded financial commitment to cure blocks a fine.
  // Only checked on the move into Fined, so a board can still correct a row
  // that was already fined before the commitment was recorded.
  if (parsed.data.status === 'fined') {
    let block: string | null
    try {
      const { data: current, error: curErr } = await supabase
        .from('hoa_violations')
        .select('status')
        .eq('id', parsed.data.violationId)
        .eq('org_id', gate.orgId)
        .maybeSingle()
      if (curErr) throw curErr
      if (!current) return { ok: false, error: 'We could not find that violation.' }
      block =
        current.status === 'fined'
          ? null
          : cureCommitmentPenaltyBlock(
              await loadOrgStateRules(supabase, gate.orgId),
              await loadCureCommitment(supabase, gate.orgId, parsed.data.violationId),
            )
    } catch {
      return { ok: false, error: 'We could not check state law for this violation. Try again.' }
    }
    if (block) {
      return {
        ok: false,
        error: block,
        fieldErrors: { status: `${block} Withdraw the recorded commitment first if the owner did not keep it.` },
      }
    }
  }

  const now = new Date().toISOString()
  const isClosing =
    parsed.data.status === 'resolved' || parsed.data.status === 'dismissed'

  const updates = {
    status: parsed.data.status,
    // Resolution / dismissal: write the timestamp + note. Note is cleared
    // when transitioning back out of a terminal state by an admin
    // correcting a mistake.
    resolved_at: isClosing ? now : null,
    resolution_note: isClosing ? (parsed.data.resolutionNote ?? null) : null,
    // Fines accruing: mark today as the start so reporting can compute
    // days-elapsed × daily fine without needing the original cure deadline.
    fine_start_date:
      parsed.data.status === 'fined' ? now.slice(0, 10) : null,
  }

  const { error } = await supabase
    .from('hoa_violations')
    .update(updates)
    .eq('id', parsed.data.violationId)

  if (error) {
    return { ok: false, error: error.message }
  }

  revalidatePath(`/violations/${parsed.data.violationId}`)
  revalidatePath('/violations')
  revalidatePath('/')
  return { ok: true }
}

// ─── Financial commitment to cure (CA Civ. Code § 5855(c)(2)) ───────
// The board records that the owner gave a financial commitment to cure.
// Stored as an audit_log row on the violation (no migration; see
// lib/violation-cure-commitment.ts). California associations only: the
// rule does not exist in the other rule sets, so it is refused for them.

export type CureCommitmentResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

async function cureCommitmentContext(violationId: string) {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false as const, error: gate.error }
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in.' }
  const { data: row, error } = await supabase
    .from('hoa_violations')
    .select('id')
    .eq('id', violationId)
    .eq('org_id', gate.orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return { ok: false as const, error: 'We could not load this violation. Try again.' }
  if (!row) return { ok: false as const, error: 'We could not find that violation.' }
  try {
    const rules = await loadOrgStateRules(supabase, gate.orgId)
    if (!cureCommitmentApplies(rules)) {
      return {
        ok: false as const,
        error: 'A financial commitment to cure is a California rule (Civ. Code § 5855(c)(2)). It does not apply to your association’s state.',
      }
    }
  } catch {
    return { ok: false as const, error: 'We could not check state law for this violation. Try again.' }
  }
  return { ok: true as const, supabase, orgId: gate.orgId, userId: user.id }
}

export async function recordCureCommitment(input: {
  violationId: string
  committedOn: string
  note?: string | null
}): Promise<CureCommitmentResult> {
  const parsed = cureCommitmentInputSchema().safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Some fields need attention.',
      fieldErrors: fieldErrorsOf(parsed.error.issues, { committedOn: 'committedOn', note: 'note' }),
    }
  }
  const ctx = await cureCommitmentContext(parsed.data.violationId)
  if (!ctx.ok) return ctx
  const { error } = await ctx.supabase.from('audit_log').insert({
    org_id: ctx.orgId,
    user_id: ctx.userId,
    action: CURE_COMMITMENT_AUDIT.recorded,
    entity_type: CURE_COMMITMENT_ENTITY,
    entity_id: parsed.data.violationId,
    metadata: { committedOn: parsed.data.committedOn, note: parsed.data.note } as never,
  })
  if (error) {
    // Ids and codes only — never the note.
    console.error('[violations] cure commitment insert failed', { violationId: parsed.data.violationId, code: error.code ?? null })
    return { ok: false, error: 'We could not save the commitment. Try again.' }
  }
  revalidatePath(`/violations/${parsed.data.violationId}`)
  return { ok: true }
}

export async function withdrawCureCommitment(violationId: string): Promise<CureCommitmentResult> {
  if (!z.string().uuid().safeParse(violationId).success) return { ok: false, error: 'That violation isn’t valid.' }
  const ctx = await cureCommitmentContext(violationId)
  if (!ctx.ok) return ctx
  const { error } = await ctx.supabase.from('audit_log').insert({
    org_id: ctx.orgId,
    user_id: ctx.userId,
    action: CURE_COMMITMENT_AUDIT.withdrawn,
    entity_type: CURE_COMMITMENT_ENTITY,
    entity_id: violationId,
    metadata: {} as never,
  })
  if (error) {
    console.error('[violations] cure commitment withdraw failed', { violationId, code: error.code ?? null })
    return { ok: false, error: 'We could not withdraw the commitment. Try again.' }
  }
  revalidatePath(`/violations/${violationId}`)
  return { ok: true }
}
