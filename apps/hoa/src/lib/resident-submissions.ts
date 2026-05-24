'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getResidentUnits } from '@/lib/resident'

// ─── shared ──────────────────────────────────────────────────────────

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

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
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('arc_requests' as never)
    .select(
      'id, unit_id, category, summary, scope_description, proposed_start, proposed_completion, contractor_name, status, board_response, board_response_at, submitted_at',
    )
    .eq('submitted_by', user.id)
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
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('resident_violation_reports' as never)
    .select(
      'id, category, description, about_address, occurred_at, status, submitted_at',
    )
    .eq('reported_by', user.id)
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
  revalidatePath('/resident/report-violation')
  return { ok: true, data: { reportId: row.id } }
}
