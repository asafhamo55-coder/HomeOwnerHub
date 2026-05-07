'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

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
