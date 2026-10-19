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
import { loadOrFail } from '@/lib/load-or-fail'
import { closeReviewsWithoutDecision, recordBoardDecisionOnReview } from '@/lib/arc-review/record'
import { notifyResidentAfterResponse } from '@/lib/resident-notify/notify'

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

/**
 * A board list read. `ok: false` means the query FAILED (already reported
 * by loadOrFail) — the page renders LoadFailed, never "nothing here".
 * `total` is the exact count for the filter, for the Pager.
 */
export type BoardList<T> = { ok: true; rows: T[]; total: number } | { ok: false }

export interface BoardListOptions<S extends string> {
  /** One status or a set (a filter chip can group several). */
  status?: S | readonly S[]
  /** Inclusive PostgREST range, from `pageRange()`. Default 0–99. */
  from?: number
  to?: number
}

/** Count per status, for filter-chip badges. `null` when the read failed. */
export type StatusCounts = Record<string, number> | null

function tally(rows: Array<{ status: string }> | null): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows ?? []) out[r.status] = (out[r.status] ?? 0) + 1
  return out
}

/** One message in a submission thread, as the board sees it — includes
 *  internal board-only notes (residents never receive these). */
export interface BoardMessageRow {
  id: string
  author_role: 'resident' | 'board' | 'admin'
  body: string
  internal: boolean
  created_at: string
}

const BoardReplySchema = z.object({
  id: z.string().uuid(),
  body: z.string().trim().min(1, 'Message cannot be empty.').max(4000),
  internal: z.boolean(),
})

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

export async function listArcRequestsForBoard(
  opts?: BoardListOptions<ArcStatus>,
): Promise<BoardList<ArcRequestBoardRow>> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  // Was a silent `.limit(200)`; now paged with an exact count.
  let query = supabase
    .from('arc_requests' as never)
    .select(
      'id, unit_id, submitted_by, category, summary, status, submitted_at, board_response_at, unit:units(unit_number), submitter:profiles!arc_requests_submitted_by_fkey(full_name, email)',
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .order('submitted_at', { ascending: false })
    .range(opts?.from ?? 0, opts?.to ?? 99)
  if (typeof opts?.status === 'string') query = query.eq('status', opts.status)
  else if (opts?.status) query = query.in('status', [...opts.status])
  const res = await loadOrFail('ARC applications', query)
  if (!res.ok) return { ok: false }

  const rows = (res.data ?? []) as unknown as Array<{
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

  return {
    ok: true,
    total: res.count ?? rows.length,
    rows: rows.map((r) => ({
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
    })),
  }
}

export async function countArcRequestsByStatus(): Promise<StatusCounts> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const res = await loadOrFail(
    'ARC status counts',
    supabase.from('arc_requests' as never).select('status').is('deleted_at', null),
  )
  return res.ok ? tally(res.data as unknown as Array<{ status: string }>) : null
}

export async function getArcRequestForBoard(
  id: string,
): Promise<ArcRequestBoardDetail | null> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('arc_requests' as never)
    .select(
      'id, unit_id, submitted_by, category, summary, scope_description, proposed_start, proposed_completion, contractor_name, contractor_license, status, board_response, board_response_at, board_response_by, submitted_at, unit:units(unit_number), submitter:profiles!arc_requests_submitted_by_fkey(full_name, email)',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  // A failed read used to come back as null → "not found". Throw instead so
  // the route error boundary says it could not load.
  if (error) throw new Error(`Failed to load ARC application (${error.code ?? 'no code'})`)
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

  const { org } = await requireBoardOrAdmin()
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

  // BL-027: close the W37 draft with the board's decision (human_approved =
  // whether the board did what the AI suggested). The decision above already
  // stands; a failure here is logged by ids and costs only the metric.
  if (parsed.data.decision !== 'in_review') {
    await recordBoardDecisionOnReview(supabase, {
      orgId: org.id,
      arcId: parsed.data.arc_id,
      userId: user.id,
      decision: parsed.data.decision,
    })
    revalidatePath('/approvals')
    revalidatePath('/', 'layout')

    // BL-082: tell the resident, after the response, if the association
    // turned resident notices on (off by default). Never blocks or undoes
    // the decision above.
    notifyResidentAfterResponse(supabase, {
      kind: 'arc_decision',
      arcId: parsed.data.arc_id,
      decision: parsed.data.decision,
      letter: parsed.data.board_response ?? null,
    })
  }

  revalidatePath('/')  // dashboard rollup
  revalidatePath('/arc')
  revalidatePath(`/arc/${parsed.data.arc_id}`)
  return { ok: true }
}

// ─── Request more information (BL-027) ──────────────────────────────

const RequestInfoSchema = z.object({
  arcId: z.string().uuid(),
  message: z.string().trim().min(1, 'Write what the resident should send.').max(4000),
})

/**
 * "Request info": the existing reply action (postArcMessage, not internal —
 * the resident sees it in their portal) plus, for a fresh application, the
 * existing Mark in review. No logic of its own beyond composing the two and
 * recording the decision on the AI draft.
 */
export async function requestArcInfo(input: { arcId: string; message: string }): Promise<ActionResult> {
  const parsed = RequestInfoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }
  const { org } = await requireBoardOrAdmin()
  const arc = await getArcRequestForBoard(parsed.data.arcId)
  if (!arc) return { ok: false, error: 'That application no longer exists.' }
  if (arc.status !== 'submitted' && arc.status !== 'in_review') {
    return { ok: false, error: 'This application is already decided or withdrawn.' }
  }

  const posted = await insertBoardArcMessage({ arcId: arc.id, body: parsed.data.message, internal: false })
  if (!posted.ok) return posted
  revalidatePath(`/resident/arc/${arc.id}`)
  if (arc.status === 'submitted') {
    const moved = await respondToArcRequest({ arcId: arc.id, decision: 'in_review', boardResponse: arc.board_response })
    if (!moved.ok) return moved
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    await recordBoardDecisionOnReview(supabase, { orgId: org.id, arcId: arc.id, userId: user.id, decision: 'more_info' })
  }
  // BL-082: the resident hears the board needs more (off by default).
  notifyResidentAfterResponse(supabase, {
    kind: 'arc_info_request',
    arcId: arc.id,
    messageId: posted.id,
    message: parsed.data.message,
  })
  revalidatePath('/approvals')
  revalidatePath('/', 'layout')
  revalidatePath('/arc')
  revalidatePath(`/arc/${arc.id}`)
  return { ok: true }
}

// ─── Delete ARC request ─────────────────────────────────────────────

export async function deleteArcRequest(arcId: string): Promise<ActionResult> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from('arc_requests' as never)
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', arcId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }

  // BL-027: a deleted application leaves nothing for the AI draft to decide.
  await closeReviewsWithoutDecision(supabase, { orgId: org.id, arcId, reason: 'deleted' })
  revalidatePath('/approvals')
  revalidatePath('/', 'layout')
  revalidatePath('/arc')
  return { ok: true }
}

// ─── ARC thread ─────────────────────────────────────────────────────

export async function getArcMessagesForBoard(
  arcId: string,
): Promise<BoardMessageRow[]> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('arc_request_messages' as never)
    .select('id, author_role, body, internal, created_at')
    .eq('arc_request_id', arcId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Failed to load ARC conversation (${error.code ?? 'no code'})`)
  return (data ?? []) as unknown as BoardMessageRow[]
}

export async function postArcMessage(input: {
  arcId: string
  body: string
  internal: boolean
}): Promise<ActionResult> {
  const posted = await insertBoardArcMessage(input)
  if (!posted.ok) return posted
  revalidatePath(`/resident/arc/${input.arcId}`)
  return { ok: true }
}

/** The board's message insert, returning the new row's id. Not exported. */
async function insertBoardArcMessage(input: {
  arcId: string
  body: string
  internal: boolean
}): Promise<{ ok: true; id: string } | ActionErr> {
  const parsed = BoardReplySchema.safeParse({
    id: input.arcId,
    body: input.body,
    internal: input.internal,
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

  const { data, error } = await supabase
    .from('arc_request_messages' as never)
    .insert({
      arc_request_id: parsed.data.id,
      author_id: user.id,
      author_role: 'board',
      body: parsed.data.body,
      internal: parsed.data.internal,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error || !data) return { ok: false, error: error?.message ?? 'Could not post the message.' }

  revalidatePath(`/arc/${parsed.data.id}`)
  return { ok: true, id: data.id }
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

export async function listResidentViolationReportsForBoard(
  opts?: BoardListOptions<ViolationReportStatus>,
): Promise<BoardList<ViolationReportBoardRow>> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  // Was a silent `.limit(200)`; now paged with an exact count.
  let query = supabase
    .from('resident_violation_reports' as never)
    .select('id, category, about_address, occurred_at, status, submitted_at', { count: 'exact' })
    .order('submitted_at', { ascending: false })
    .range(opts?.from ?? 0, opts?.to ?? 99)
  if (typeof opts?.status === 'string') query = query.eq('status', opts.status)
  else if (opts?.status) query = query.in('status', [...opts.status])
  const res = await loadOrFail('resident reports', query)
  if (!res.ok) return { ok: false }
  const rows = (res.data ?? []) as unknown as ViolationReportBoardRow[]
  return { ok: true, rows, total: res.count ?? rows.length }
}

export async function countViolationReportsByStatus(): Promise<StatusCounts> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const res = await loadOrFail(
    'report status counts',
    supabase.from('resident_violation_reports' as never).select('status'),
  )
  return res.ok ? tally(res.data as unknown as Array<{ status: string }>) : null
}

export async function getResidentViolationReportForBoard(
  id: string,
): Promise<ViolationReportBoardDetail | null> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('resident_violation_reports' as never)
    .select(
      'id, category, description, about_address, about_unit_id, occurred_at, evidence_photo_path, status, board_note, reviewed_at, reviewed_by, hoa_violation_id, submitted_at, reported_by, about_unit:units!resident_violation_reports_about_unit_id_fkey(unit_number), reporter:profiles!resident_violation_reports_reported_by_fkey(full_name, email)',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Failed to load resident report (${error.code ?? 'no code'})`)
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

// ─── Violation report thread ────────────────────────────────────────

export async function getViolationReportMessagesForBoard(
  reportId: string,
): Promise<BoardMessageRow[]> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('resident_violation_report_messages' as never)
    .select('id, author_role, body, internal, created_at')
    .eq('report_id', reportId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Failed to load report conversation (${error.code ?? 'no code'})`)
  return (data ?? []) as unknown as BoardMessageRow[]
}

export async function postViolationReportMessage(input: {
  reportId: string
  body: string
  internal: boolean
}): Promise<ActionResult> {
  const parsed = BoardReplySchema.safeParse({
    id: input.reportId,
    body: input.body,
    internal: input.internal,
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
    .from('resident_violation_report_messages' as never)
    .insert({
      report_id: parsed.data.id,
      author_id: user.id,
      author_role: 'board',
      body: parsed.data.body,
      internal: parsed.data.internal,
    } as never)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/violations/reports/${parsed.data.id}`)
  revalidatePath(`/resident/violations/${parsed.data.id}`)
  return { ok: true }
}
