'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getResidentUnits } from '@/lib/resident'
import { getResidentActor, IMPERSONATION_READONLY_MSG } from '@/lib/impersonation'
import { loadOrFail, type LoadResult } from '@/lib/load-or-fail'
import { residentActionFailed } from '@/lib/resident-action-error'
import { closeArcReviewsOnWithdraw, startBoardArcReview } from '@/lib/arc-review/server'
import { bindPrecheckRun } from '@/lib/arc-review/precheck-binding'
import { createAdminClient } from '@homeowner-portal/db'
import { arcCreatedBell, concernCreatedBell, notifyBoardSafely } from '@/lib/board-in-app-notify'

// ─── shared ──────────────────────────────────────────────────────────

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string; fieldErrors?: Record<string, string> }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

/** A validation failure: first message as `error`, plus one message per field. */
function invalid(e: z.ZodError): ActionErr {
  const fieldErrors: Record<string, string> = {}
  for (const issue of e.issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
  }
  return { ok: false, error: e.issues[0]?.message ?? 'Invalid input.', fieldErrors }
}

/** One message in a submission thread (ARC application or violation
 *  report). Residents only ever see non-internal messages. Display uses
 *  author_role ("You" vs "Board"), matching the tickets thread UI. */
export interface SubmissionMessageRow {
  id: string
  author_role: 'resident' | 'board' | 'admin'
  body: string
  created_at: string
}

const AddMessageSchema = z.object({
  id: z.string().uuid(),
  body: z.string().trim().min(1, 'Message cannot be empty.').max(4000),
})

// ─── ARC requests ────────────────────────────────────────────────────

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

export type ArcStatus =
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'denied'
  | 'withdrawn'

export interface ArcRequestRow {
  id: string
  unit_id: string | null
  category: ArcCategory
  summary: string
  scope_description: string
  proposed_start: string | null
  proposed_completion: string | null
  contractor_name: string | null
  status: ArcStatus
  board_response: string | null
  board_response_at: string | null
  submitted_at: string
}

const ArcCategorySchema = z.enum([
  'paint',
  'fence',
  'deck_patio',
  'roof',
  'landscaping',
  'addition',
  'pool',
  'solar',
  'other',
], { errorMap: () => ({ message: 'Choose a category.' }) })

const CreateArcSchema = z.object({
  unit_id: z.string().uuid('Pick a unit.'),
  category: ArcCategorySchema,
  summary: z.string().trim().min(5, 'Summary is too short.').max(200),
  scope_description: z.string().trim().min(20, 'Describe the scope in more detail.').max(4000),
  proposed_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.').nullable().optional(),
  proposed_completion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.').nullable().optional(),
  contractor_name: z.string().trim().max(200).nullable().optional(),
  contractor_license: z.string().trim().max(100).nullable().optional(),
  // BL-024: the resident's pre-check run, so the board can see what they were shown.
  precheck_run_id: z.string().uuid().nullable().optional(),
})

export interface CreateArcInput {
  unitId: string
  category: ArcCategory
  summary: string
  scopeDescription: string
  proposedStart?: string | null
  proposedCompletion?: string | null
  contractorName?: string | null
  contractorLicense?: string | null
  /** BL-024: the W37 pre-check run id, when the resident ran "Check my request against the rules". */
  precheckRunId?: string | null
}

/** The resident's ARC requests, or `{ ok: false }` when the read failed. */
export async function loadMyArcRequests(): Promise<LoadResult<ArcRequestRow[]>> {
  const actor = await getResidentActor()
  if (!actor.id) return { ok: true, data: [], count: 0 }
  // Impersonating = service-role client: confine to the impersonation org.
  let q = actor.client
    .from('arc_requests' as never)
    .select(
      'id, unit_id, category, summary, scope_description, proposed_start, proposed_completion, contractor_name, status, board_response, board_response_at, submitted_at',
    )
    .eq('submitted_by', actor.id)
  if (actor.orgId) q = q.eq('organization_id' as never, actor.orgId)
  const res = await loadOrFail(
    'resident ARC requests',
    q.order('submitted_at', { ascending: false }).limit(50),
  )
  return res.ok ? { ok: true, data: (res.data ?? []) as unknown as ArcRequestRow[], count: null } : res
}

/** Throwing form: a failed read reaches the error boundary, never "none". */
export async function listMyArcRequests(): Promise<ArcRequestRow[]> {
  const res = await loadMyArcRequests()
  if (!res.ok) throw new Error('listMyArcRequests: failed to load ARC requests')
  return res.data
}

export async function createArcRequest(
  input: CreateArcInput,
): Promise<ActionResult<{ requestId: string }>> {
  const parsed = CreateArcSchema.safeParse({
    unit_id: input.unitId,
    category: input.category,
    summary: input.summary,
    scope_description: input.scopeDescription,
    proposed_start: input.proposedStart ?? null,
    proposed_completion: input.proposedCompletion ?? null,
    contractor_name: input.contractorName ?? null,
    contractor_license: input.contractorLicense ?? null,
    precheck_run_id: input.precheckRunId ?? null,
  })
  if (!parsed.success) {
    return invalid(parsed.error)
  }

  if ((await getResidentActor()).impersonating) {
    return { ok: false, error: IMPERSONATION_READONLY_MSG }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  // Confirm the user actually owns the unit being submitted for.
  // RLS would catch this on insert (residents can only INSERT with
  // submitted_by=auth.uid()), but unit ownership is on a separate
  // table; we verify here for a clean error message.
  const myUnits = await getResidentUnits()
  const unit = myUnits.find((u) => u.unit_id === parsed.data.unit_id)
  if (!unit) {
    return { ok: false, error: 'You can only submit applications for units you own.' }
  }

  const { data: row, error } = await supabase
    .from('arc_requests' as never)
    .insert({
      organization_id: org.id,
      association_id: unit.association_id,
      unit_id: parsed.data.unit_id,
      submitted_by: user.id,
      category: parsed.data.category,
      summary: parsed.data.summary,
      scope_description: parsed.data.scope_description,
      proposed_start: parsed.data.proposed_start,
      proposed_completion: parsed.data.proposed_completion,
      contractor_name: parsed.data.contractor_name,
      contractor_license: parsed.data.contractor_license,
      status: 'submitted',
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error || !row) {
    return residentActionFailed('createArcRequest', error)
  }

  // BL-027: draft the board's AI review after the response is sent — the
  // resident never waits on (or sees) it. Service role, ids only in logs.
  // BL-078: the run id comes from the browser — link it only if it is this
  // resident's own W37 pre-check in this org; otherwise drop it silently.
  const { runId: precheckRunId } = await bindPrecheckRun(createAdminClient(), {
    runId: parsed.data.precheck_run_id,
    orgId: org.id,
    userId: user.id,
  })
  after(() => startBoardArcReview({ orgId: org.id, arcId: row.id, precheckRunId }))

  // Bell the board (in-app only). Never fails the submission; see notifyBoardSafely.
  await notifyBoardSafely(
    arcCreatedBell({ organizationId: org.id, actorId: user.id, arcId: row.id, summary: parsed.data.summary }),
  )

  revalidatePath('/')  // dashboard rollup
  revalidatePath('/resident')
  revalidatePath('/resident/arc')
  return { ok: true, data: { requestId: row.id } }
}

export interface ArcRequestDetail extends ArcRequestRow {
  contractor_license: string | null
  messages: SubmissionMessageRow[]
}

export type MyArcRequestLoad =
  | { ok: true; request: ArcRequestDetail; messagesFailed: boolean }
  | { ok: false; reason: 'not_found' | 'error' }

/** not_found = a real miss; error = the request read failed; messagesFailed = replies read failed. */
export async function getMyArcRequest(id: string): Promise<MyArcRequestLoad> {
  const actor = await getResidentActor()
  if (!actor.id) return { ok: false, reason: 'not_found' }

  let rq = actor.client
    .from('arc_requests' as never)
    .select(
      'id, unit_id, category, summary, scope_description, proposed_start, proposed_completion, contractor_name, contractor_license, status, board_response, board_response_at, submitted_at',
    )
    .eq('id', id)
    .eq('submitted_by', actor.id)
    .is('deleted_at', null)
  if (actor.orgId) rq = rq.eq('organization_id' as never, actor.orgId)
  const parent = await loadOrFail('resident ARC request', rq.maybeSingle())
  if (!parent.ok) return { ok: false, reason: 'error' }
  const request = parent.data
  if (!request) return { ok: false, reason: 'not_found' }

  // `internal: false` reproduces the resident's exact visibility — they
  // never see internal board notes. Explicit here because the impersonated
  // path uses a service-role client that would otherwise bypass that RLS.
  const msgRes = await loadOrFail(
    'resident ARC messages',
    actor.client
      .from('arc_request_messages' as never)
      .select('id, author_role, body, created_at')
      .eq('arc_request_id', id)
      .eq('internal' as never, false)
      .order('created_at', { ascending: true }),
  )

  const r = request as unknown as ArcRequestDetail
  r.messages = (msgRes.ok ? msgRes.data ?? [] : []) as unknown as SubmissionMessageRow[]
  return { ok: true, request: r, messagesFailed: !msgRes.ok }
}

export async function addArcMessage(
  arcId: string,
  body: string,
): Promise<ActionResult> {
  const parsed = AddMessageSchema.safeParse({ id: arcId, body })
  if (!parsed.success) {
    return invalid(parsed.error)
  }

  if ((await getResidentActor()).impersonating) {
    return { ok: false, error: IMPERSONATION_READONLY_MSG }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { error } = await supabase
    .from('arc_request_messages' as never)
    .insert({
      arc_request_id: parsed.data.id,
      author_id: user.id,
      author_role: 'resident',
      body: parsed.data.body,
      internal: false,
    } as never)

  if (error) return residentActionFailed('addArcMessage', error)

  revalidatePath(`/resident/arc/${arcId}`)
  revalidatePath(`/arc/${arcId}`)
  return { ok: true }
}

export async function withdrawMyArcRequest(arcId: string): Promise<ActionResult> {
  if ((await getResidentActor()).impersonating) {
    return { ok: false, error: IMPERSONATION_READONLY_MSG }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  // Only a still-pending application can be withdrawn. Guarding on status
  // here keeps a resident from "un-deciding" an approved/denied request.
  const { data: row, error } = await supabase
    .from('arc_requests' as never)
    .update({ status: 'withdrawn' } as never)
    .eq('id', arcId)
    .eq('submitted_by', user.id)
    .in('status', ['submitted', 'in_review'])
    .is('deleted_at', null)
    .select('id, organization_id')
    .maybeSingle<{ id: string; organization_id: string }>()

  if (error) return residentActionFailed('withdrawMyArcRequest', error)
  if (!row) {
    return { ok: false, error: 'This application can no longer be withdrawn.' }
  }

  // BL-027: take the AI draft out of the board's approvals inbox.
  after(() => closeArcReviewsOnWithdraw({ orgId: row.organization_id, arcId: row.id }))

  revalidatePath('/')
  revalidatePath('/resident/arc')
  revalidatePath(`/resident/arc/${arcId}`)
  revalidatePath('/arc')
  revalidatePath(`/arc/${arcId}`)
  return { ok: true }
}

// ─── resident violation reports ──────────────────────────────────────

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

const ViolationCategorySchema = z.enum([
  'parking',
  'pet',
  'noise',
  'lawn_landscape',
  'trash',
  'architectural',
  'rental',
  'nuisance',
  'other',
], { errorMap: () => ({ message: 'Choose a category.' }) })

const CreateViolationReportSchema = z.object({
  category: ViolationCategorySchema,
  description: z.string().trim().min(20, 'Describe what you observed in more detail.').max(4000),
  about_address: z.string().trim().min(3, 'Where did this happen?').max(300),
  occurred_at: z.string().nullable().optional(),
})

export interface CreateViolationReportInput {
  category: ViolationCategory
  description: string
  aboutAddress: string
  occurredAt?: string | null
}

export interface ViolationReportRow {
  id: string
  category: ViolationCategory
  description: string
  about_address: string | null
  occurred_at: string | null
  status: string
  submitted_at: string
}

/** The resident's concern reports, or `{ ok: false }` when the read failed. */
export async function loadMyViolationReports(): Promise<LoadResult<ViolationReportRow[]>> {
  const actor = await getResidentActor()
  if (!actor.id) return { ok: true, data: [], count: 0 }
  // Impersonating = service-role client: confine to the impersonation org.
  let q = actor.client
    .from('resident_violation_reports' as never)
    .select('id, category, description, about_address, occurred_at, status, submitted_at')
    .eq('reported_by', actor.id)
  if (actor.orgId) q = q.eq('organization_id' as never, actor.orgId)
  const res = await loadOrFail(
    'resident violation reports',
    q.order('submitted_at', { ascending: false }).limit(50),
  )
  return res.ok
    ? { ok: true, data: (res.data ?? []) as unknown as ViolationReportRow[], count: null }
    : res
}

/** Throwing form: a failed read reaches the error boundary, never "none". */
export async function listMyViolationReports(): Promise<ViolationReportRow[]> {
  const res = await loadMyViolationReports()
  if (!res.ok) throw new Error('listMyViolationReports: failed to load reports')
  return res.data
}

export async function createViolationReport(
  input: CreateViolationReportInput,
): Promise<ActionResult<{ reportId: string }>> {
  const parsed = CreateViolationReportSchema.safeParse({
    category: input.category,
    description: input.description,
    about_address: input.aboutAddress,
    occurred_at: input.occurredAt ?? null,
  })
  if (!parsed.success) {
    return invalid(parsed.error)
  }

  if ((await getResidentActor()).impersonating) {
    return { ok: false, error: IMPERSONATION_READONLY_MSG }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const myUnits = await getResidentUnits()
  const associationId = myUnits[0]?.association_id ?? null

  const { data: row, error } = await supabase
    .from('resident_violation_reports' as never)
    .insert({
      organization_id: org.id,
      association_id: associationId,
      reported_by: user.id,
      about_address: parsed.data.about_address,
      category: parsed.data.category,
      description: parsed.data.description,
      occurred_at: parsed.data.occurred_at,
      status: 'submitted',
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error || !row) {
    return residentActionFailed('createViolationReport', error)
  }

  // Bell the board (in-app only). Never fails the submission; see notifyBoardSafely.
  await notifyBoardSafely(concernCreatedBell({ organizationId: org.id, actorId: user.id, reportId: row.id }))

  revalidatePath('/resident')
  revalidatePath('/resident/violations')
  revalidatePath('/resident/report-violation')
  return { ok: true, data: { reportId: row.id } }
}

export interface ViolationReportDetail extends ViolationReportRow {
  messages: SubmissionMessageRow[]
}

export type MyViolationReportLoad =
  | { ok: true; report: ViolationReportDetail; messagesFailed: boolean }
  | { ok: false; reason: 'not_found' | 'error' }

/** not_found = a real miss; error = the report read failed; messagesFailed = replies read failed. */
export async function getMyViolationReport(id: string): Promise<MyViolationReportLoad> {
  const actor = await getResidentActor()
  if (!actor.id) return { ok: false, reason: 'not_found' }

  let rq = actor.client
    .from('resident_violation_reports' as never)
    .select('id, category, description, about_address, occurred_at, status, submitted_at')
    .eq('id', id)
    .eq('reported_by', actor.id)
  if (actor.orgId) rq = rq.eq('organization_id' as never, actor.orgId)
  const parent = await loadOrFail('resident violation report', rq.maybeSingle())
  if (!parent.ok) return { ok: false, reason: 'error' }
  const report = parent.data
  if (!report) return { ok: false, reason: 'not_found' }

  // `internal: false` — the reporter never sees the board's internal note,
  // only messages the board explicitly sends back to them.
  const msgRes = await loadOrFail(
    'resident violation report messages',
    actor.client
      .from('resident_violation_report_messages' as never)
      .select('id, author_role, body, created_at')
      .eq('report_id', id)
      .eq('internal' as never, false)
      .order('created_at', { ascending: true }),
  )

  const r = report as unknown as ViolationReportDetail
  r.messages = (msgRes.ok ? msgRes.data ?? [] : []) as unknown as SubmissionMessageRow[]
  return { ok: true, report: r, messagesFailed: !msgRes.ok }
}

export async function addViolationReportMessage(
  reportId: string,
  body: string,
): Promise<ActionResult> {
  const parsed = AddMessageSchema.safeParse({ id: reportId, body })
  if (!parsed.success) {
    return invalid(parsed.error)
  }

  if ((await getResidentActor()).impersonating) {
    return { ok: false, error: IMPERSONATION_READONLY_MSG }
  }

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
      author_role: 'resident',
      body: parsed.data.body,
      internal: false,
    } as never)

  if (error) return residentActionFailed('addViolationReportMessage', error)

  revalidatePath(`/resident/violations/${reportId}`)
  revalidatePath(`/violations/reports/${reportId}`)
  return { ok: true }
}
