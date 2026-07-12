'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getResidentUnits } from '@/lib/resident'
import { getResidentActor, IMPERSONATION_READONLY_MSG } from '@/lib/impersonation'

// ─── shared ──────────────────────────────────────────────────────────

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

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
])

const CreateArcSchema = z.object({
  unit_id: z.string().uuid('Pick a unit.'),
  category: ArcCategorySchema,
  summary: z.string().trim().min(5, 'Summary is too short.').max(200),
  scope_description: z.string().trim().min(20, 'Describe the scope in more detail.').max(4000),
  proposed_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  proposed_completion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  contractor_name: z.string().trim().max(200).nullable().optional(),
  contractor_license: z.string().trim().max(100).nullable().optional(),
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
}

export async function listMyArcRequests(): Promise<ArcRequestRow[]> {
  const actor = await getResidentActor()
  if (!actor.id) return []
  const { data } = await actor.client
    .from('arc_requests' as never)
    .select(
      'id, unit_id, category, summary, scope_description, proposed_start, proposed_completion, contractor_name, status, board_response, board_response_at, submitted_at',
    )
    .eq('submitted_by', actor.id)
    .order('submitted_at', { ascending: false })
    .limit(50)
  return (data ?? []) as unknown as ArcRequestRow[]
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
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
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
    return { ok: false, error: error?.message ?? 'Could not submit application.' }
  }

  revalidatePath('/')  // dashboard rollup
  revalidatePath('/resident')
  revalidatePath('/resident/arc')
  return { ok: true, data: { requestId: row.id } }
}

export interface ArcRequestDetail extends ArcRequestRow {
  contractor_license: string | null
  messages: SubmissionMessageRow[]
}

export async function getMyArcRequest(id: string): Promise<ArcRequestDetail | null> {
  const actor = await getResidentActor()
  if (!actor.id) return null

  const { data: request } = await actor.client
    .from('arc_requests' as never)
    .select(
      'id, unit_id, category, summary, scope_description, proposed_start, proposed_completion, contractor_name, contractor_license, status, board_response, board_response_at, submitted_at',
    )
    .eq('id', id)
    .eq('submitted_by', actor.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!request) return null

  // `internal: false` reproduces the resident's exact visibility — they
  // never see internal board notes. Explicit here because the impersonated
  // path uses a service-role client that would otherwise bypass that RLS.
  const { data: msgs } = await actor.client
    .from('arc_request_messages' as never)
    .select('id, author_role, body, created_at')
    .eq('arc_request_id', id)
    .eq('internal' as never, false)
    .order('created_at', { ascending: true })

  const r = request as unknown as ArcRequestDetail
  r.messages = (msgs ?? []) as unknown as SubmissionMessageRow[]
  return r
}

export async function addArcMessage(
  arcId: string,
  body: string,
): Promise<ActionResult> {
  const parsed = AddMessageSchema.safeParse({ id: arcId, body })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
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

  if (error) return { ok: false, error: error.message }

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
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error) return { ok: false, error: error.message }
  if (!row) {
    return { ok: false, error: 'This application can no longer be withdrawn.' }
  }

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
])

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

export async function listMyViolationReports(): Promise<ViolationReportRow[]> {
  const actor = await getResidentActor()
  if (!actor.id) return []
  const { data } = await actor.client
    .from('resident_violation_reports' as never)
    .select(
      'id, category, description, about_address, occurred_at, status, submitted_at',
    )
    .eq('reported_by', actor.id)
    .order('submitted_at', { ascending: false })
    .limit(50)
  return (data ?? []) as unknown as ViolationReportRow[]
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
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
    return { ok: false, error: error?.message ?? 'Could not submit report.' }
  }

  revalidatePath('/resident')
  revalidatePath('/resident/violations')
  revalidatePath('/resident/report-violation')
  return { ok: true, data: { reportId: row.id } }
}

export interface ViolationReportDetail extends ViolationReportRow {
  messages: SubmissionMessageRow[]
}

export async function getMyViolationReport(
  id: string,
): Promise<ViolationReportDetail | null> {
  const actor = await getResidentActor()
  if (!actor.id) return null

  const { data: report } = await actor.client
    .from('resident_violation_reports' as never)
    .select('id, category, description, about_address, occurred_at, status, submitted_at')
    .eq('id', id)
    .eq('reported_by', actor.id)
    .maybeSingle()
  if (!report) return null

  // `internal: false` — the reporter never sees the board's internal note,
  // only messages the board explicitly sends back to them.
  const { data: msgs } = await actor.client
    .from('resident_violation_report_messages' as never)
    .select('id, author_role, body, created_at')
    .eq('report_id', id)
    .eq('internal' as never, false)
    .order('created_at', { ascending: true })

  const r = report as unknown as ViolationReportDetail
  r.messages = (msgs ?? []) as unknown as SubmissionMessageRow[]
  return r
}

export async function addViolationReportMessage(
  reportId: string,
  body: string,
): Promise<ActionResult> {
  const parsed = AddMessageSchema.safeParse({ id: reportId, body })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
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

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/resident/violations/${reportId}`)
  revalidatePath(`/violations/reports/${reportId}`)
  return { ok: true }
}
