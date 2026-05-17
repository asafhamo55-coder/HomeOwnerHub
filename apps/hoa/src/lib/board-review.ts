'use server'

// Board-side review helpers for the two resident-submitted queues:
//   - arc_requests (Phase 16e)
//   - resident_violation_reports (Phase 16e)
//
// Resident-side server actions live in lib/resident-submissions.ts.
// This file is strictly for the manager-side review surface. All actions
// guard via requireBoardOrAdmin and rely on RLS in migration 0013 as a
// second-layer backstop.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireBoardOrAdmin } from '@/lib/auth'

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

// ─── ARC review ─────────────────────────────────────────────────────

export type ArcStatus =
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'denied'
  | 'withdrawn'

export type ArcCategory =
  | 'paint'
  | 'fence'
  | 'deck_patio'
  | 'roof'
  | 'landscaping'
  | 'addition'
  | 'pool'
  | 'solar'
  | 'other'

export interface ArcRequestBoardRow {
  id: string
  unit_id: string | null
  unit_number: string | null
  submitted_by: string
  submitter_name: string | null
  submitter_email: string | null
  category: ArcCategory
  summary: string
  status: ArcStatus
  submitted_at: string
  board_response_at: string | null
}

export interface ArcRequestBoardDetail extends ArcRequestBoardRow {
  scope_description: string
  proposed_start: string | null
  proposed_completion: string | null
  contractor_name: string | null
  contractor_license: string | null
  board_response: string | null
  board_response_by: string | null
}

export async function listArcRequestsForBoard(opts?: {
  status?: ArcStatus
}): Promise<ArcRequestBoardRow[]> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  let query = supabase
    .from('arc_requests' as never)
    .select(
      'id, unit_id, submitted_by, category, summary, status, submitted_at, board_response_at, unit:units(unit_number), submitter:profiles!arc_requests_submitted_by_fkey(full_name, email)',
    )
    .order('submitted_at', { ascending: false })
    .limit(200)
  if (opts?.status) query = query.eq('status', opts.status)
  const { data } = await query

  const rows = (data ?? []) as unknown as Array<{
    id: string
    unit_id: string | null
    submitted_by: string
    category: ArcCategory
    summary: string
    status: ArcStatus
    submitted_at: string
    board_response_at: string | null
    unit: { unit_number: string | null } | null
    submitter: { full_name: string | null; email: string | null } | null
  }>

  return rows.map((r) => ({
    id: r.id,
    unit_id: r.unit_id,
    unit_number: r.unit?.unit_number ?? null,
    submitted_by: r.submitted_by,
    submitter_name: r.submitter?.full_name ?? null,
    submitter_email: r.submitter?.email ?? null,
    category: r.category,
    summary: r.summary,
    status: r.status,
    submitted_at: r.submitted_at,
    board_response_at: r.board_response_at,
  }))
}

export async function getArcRequestForBoard(
  id: string,
): Promise<ArcRequestBoardDetail | null> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('arc_requests' as never)
    .select(
      'id, unit_id, submitted_by, category, summary, scope_description, proposed_start, proposed_completion, contractor_name, contractor_license, status, board_response, board_response_at, board_response_by, submitted_at, unit:units(unit_number), submitter:profiles!arc_requests_submitted_by_fkey(full_name, email)',
    )
    .eq('id', id)
    .maybeSingle()
  if (!data) return null

  const r = data as unknown as ArcRequestBoardDetail & {
    unit: { unit_number: string | null } | null
    submitter: { full_name: string | null; email: string | null } | null
  }

  return {
    id: r.id,
    unit_id: r.unit_id,
    unit_number: r.unit?.unit_number ?? null,
    submitted_by: r.submitted_by,
    submitter_name: r.submitter?.full_name ?? null,
    submitter_email: r.submitter?.email ?? null,
    category: r.category,
    summary: r.summary,
    scope_description: r.scope_description,
    proposed_start: r.proposed_start,
    proposed_completion: r.proposed_completion,
    contractor_name: r.contractor_name,
    contractor_license: r.contractor_license,
    status: r.status,
    submitted_at: r.submitted_at,
    board_response: r.board_response,
    board_response_at: r.board_response_at,
    board_response_by: r.board_response_by,
  }
}

const ArcDecisionSchema = z.object({
  arc_id: z.string().uuid(),
  decision: z.enum(['in_review', 'approved', 'denied']),
  board_response: z.string().trim().max(4000).nullable().optional(),
})

export interface ArcDecisionInput {
  arcId: string
  decision: 'in_review' | 'approved' | 'denied'
  boardResponse?: string | null
}

export async function respondToArcRequest(
  input: ArcDecisionInput,
): Promise<ActionResult> {
  const parsed = ArcDecisionSchema.safeParse({
    arc_id: input.arcId,
    decision: input.decision,
    board_response: input.boardResponse ?? null,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { error } = await supabase
    .from('arc_requests' as never)
    .update({
      status: parsed.data.decision,
      board_response: parsed.data.board_response,
      board_response_at:
        parsed.data.decision === 'in_review' ? null : new Date().toISOString(),
      board_response_by:
        parsed.data.decision === 'in_review' ? null : user.id,
    } as never)
    .eq('id', parsed.data.arc_id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/arc')
  revalidatePath(`/arc/${parsed.data.arc_id}`)
  return { ok: true }
}

// ─── Resident violation reports ─────────────────────────────────────

export type ViolationReportStatus =
  | 'submitted'
  | 'under_review'
  | 'opened_as_violation'
  | 'closed_no_action'
  | 'dismissed'

export type ViolationCategory =
  | 'parking'
  | 'pet'
  | 'noise'
  | 'lawn_landscape'
  | 'trash'
  | 'architectural'
  | 'rental'
  | 'nuisance'
  | 'other'

export interface ViolationReportBoardRow {
  id: string
  category: ViolationCategory
  about_address: string | null
  occurred_at: string | null
  status: ViolationReportStatus
  submitted_at: string
}

export interface ViolationReportBoardDetail extends ViolationReportBoardRow {
  description: string
  reported_by: string
  reporter_name: string | null
  reporter_email: string | null
  about_unit_id: string | null
  about_unit_number: string | null
  evidence_photo_path: string | null
  board_note: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  hoa_violation_id: string | null
}

export async function listResidentViolationReportsForBoard(opts?: {
  status?: ViolationReportStatus
}): Promise<ViolationReportBoardRow[]> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  let query = supabase
    .from('resident_violation_reports' as never)
    .select(
      'id, category, about_address, occurred_at, status, submitted_at',
    )
    .order('submitted_at', { ascending: false })
    .limit(200)
  if (opts?.status) query = query.eq('status', opts.status)
  const { data } = await query
  return (data ?? []) as unknown as ViolationReportBoardRow[]
}

export async function getResidentViolationReportForBoard(
  id: string,
): Promise<ViolationReportBoardDetail | null> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('resident_violation_reports' as never)
    .select(
      'id, category, description, about_address, about_unit_id, occurred_at, evidence_photo_path, status, board_note, reviewed_at, reviewed_by, hoa_violation_id, submitted_at, reported_by, about_unit:units!resident_violation_reports_about_unit_id_fkey(unit_number), reporter:profiles!resident_violation_reports_reported_by_fkey(full_name, email)',
    )
    .eq('id', id)
    .maybeSingle()
  if (!data) return null

  const r = data as unknown as ViolationReportBoardDetail & {
    about_unit: { unit_number: string | null } | null
    reporter: { full_name: string | null; email: string | null } | null
  }

  return {
    id: r.id,
    category: r.category,
    description: r.description,
    about_address: r.about_address,
    about_unit_id: r.about_unit_id,
    about_unit_number: r.about_unit?.unit_number ?? null,
    reported_by: r.reported_by,
    reporter_name: r.reporter?.full_name ?? null,
    reporter_email: r.reporter?.email ?? null,
    occurred_at: r.occurred_at,
    evidence_photo_path: r.evidence_photo_path,
    status: r.status,
    submitted_at: r.submitted_at,
    board_note: r.board_note,
    reviewed_at: r.reviewed_at,
    reviewed_by: r.reviewed_by,
    hoa_violation_id: r.hoa_violation_id,
  }
}

const ReportDecisionSchema = z.object({
  report_id: z.string().uuid(),
  decision: z.enum(['under_review', 'opened_as_violation', 'closed_no_action', 'dismissed']),
  board_note: z.string().trim().max(4000).nullable().optional(),
})

export interface ReportDecisionInput {
  reportId: string
  decision: 'under_review' | 'opened_as_violation' | 'closed_no_action' | 'dismissed'
  boardNote?: string | null
}

export async function respondToViolationReport(
  input: ReportDecisionInput,
): Promise<ActionResult> {
  const parsed = ReportDecisionSchema.safeParse({
    report_id: input.reportId,
    decision: input.decision,
    board_note: input.boardNote ?? null,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { error } = await supabase
    .from('resident_violation_reports' as never)
    .update({
      status: parsed.data.decision,
      board_note: parsed.data.board_note,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    } as never)
    .eq('id', parsed.data.report_id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/violations/reports')
  revalidatePath(`/violations/reports/${parsed.data.report_id}`)
  return { ok: true }
}
