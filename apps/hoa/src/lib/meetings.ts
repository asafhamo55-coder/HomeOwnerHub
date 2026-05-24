'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// Schema-aligned slugs (hoa_meeting_minutes_meeting_type_check).
export type MeetingType = 'regular' | 'special' | 'annual' | 'emergency'

const ApproveSchema = z.object({
  meetingDate: z.string().min(4, 'Meeting date is required.'),
  meetingType: z
    .enum(['regular', 'special', 'annual', 'emergency'])
    .default('regular'),
  rawTranscript: z.string().min(50, 'Paste at least a paragraph of transcript.'),
  aiSummary: z.string().min(20, 'AI summary is empty.'),
  approvedSummary: z.string().min(20, 'Approved minutes are empty.'),
  attendees: z.array(z.string()).optional(),
})

export interface ApproveResult {
  ok: boolean
  meetingId?: string
  error?: string
}

export async function approveMeetingMinutes(input: {
  meetingDate: string
  meetingType: MeetingType
  rawTranscript: string
  aiSummary: string
  approvedSummary: string
  attendees: string[]
}): Promise<ApproveResult> {
  const parsed = ApproveSchema.safeParse(input)
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

  const now = new Date().toISOString()

  const { data: row, error } = await supabase
    .from('hoa_meeting_minutes')
    .insert({
      org_id: org.id,
      meeting_date: parsed.data.meetingDate,
      meeting_type: parsed.data.meetingType,
      attendees: parsed.data.attendees ?? null,
      raw_transcript: parsed.data.rawTranscript,
      ai_summary: parsed.data.aiSummary,
      // Approved minutes are stored on the same row; we keep the AI version
      // separate so future audits can see what changed during human review.
      action_items: null,
      motions: null,
      status: 'approved',
      approved_at: now,
      approved_by: user.id,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Could not save the minutes.' }
  }

  // Persist the approved version into ai_summary by overwriting (the column
  // is the single canonical "minutes text" the rest of the app reads).
  // raw_transcript stays intact for audit.
  await supabase
    .from('hoa_meeting_minutes')
    .update({ ai_summary: parsed.data.approvedSummary })
    .eq('id', row.id as string)

  revalidatePath('/')  // dashboard rollup
  revalidatePath('/meetings')
  return { ok: true, meetingId: row.id as string }
}

// ─── Update meeting ─────────────────────────────────────────────────

type MeetingActionResult = { ok: true } | { ok: false; error: string }

const UpdateMeetingSchema = z.object({
  meetingDate: z.string().min(4).optional(),
  meetingType: z.enum(['regular', 'special', 'annual', 'emergency']).optional(),
  approvedSummary: z.string().min(10).optional(),
  attendees: z.array(z.string()).optional(),
})

export interface UpdateMeetingInput {
  meetingDate?: string
  meetingType?: MeetingType
  approvedSummary?: string
  attendees?: string[]
}

export async function updateMeeting(
  meetingId: string,
  input: UpdateMeetingInput,
): Promise<MeetingActionResult> {
  const parsed = UpdateMeetingSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const supabase = await getSupabaseServerClient()
  const patch: Record<string, unknown> = {}
  if (parsed.data.meetingDate !== undefined) patch.meeting_date = parsed.data.meetingDate
  if (parsed.data.meetingType !== undefined) patch.meeting_type = parsed.data.meetingType
  if (parsed.data.approvedSummary !== undefined) patch.ai_summary = parsed.data.approvedSummary
  if (parsed.data.attendees !== undefined) patch.attendees = parsed.data.attendees

  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await supabase
    .from('hoa_meeting_minutes')
    .update(patch as never)
    .eq('id', meetingId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/meetings/${meetingId}`)
  revalidatePath('/meetings')
  return { ok: true }
}

// ─── Delete meeting ─────────────────────────────────────────────────

export async function deleteMeeting(
  meetingId: string,
): Promise<MeetingActionResult> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from('hoa_meeting_minutes')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', meetingId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/meetings')
  return { ok: true }
}
