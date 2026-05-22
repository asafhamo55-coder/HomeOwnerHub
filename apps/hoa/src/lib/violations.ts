'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { VIOLATION_STATUSES, type ViolationStatus } from '@/lib/violation-statuses'

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
  resolutionNote: z.string().trim().max(2000).nullable().optional(),
})

export interface UpdateViolationStatusInput {
  violationId: string
  status: ViolationStatus
  resolutionNote?: string | null
}

export type UpdateViolationStatusResult =
  | { ok: true }
  | { ok: false; error: string }

export async function updateViolationStatus(
  input: UpdateViolationStatusInput,
): Promise<UpdateViolationStatusResult> {
  const parsed = UpdateStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

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
