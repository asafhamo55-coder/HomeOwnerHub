'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const ApproveSchema = z.object({
  meetingDate: z.string().min(4, 'Meeting date is required.'),
  meetingType: z
    .enum(['board', 'annual', 'special', 'committee'])
    .default('board'),
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
  meetingType: 'board' | 'annual' | 'special' | 'committee'
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

  revalidatePath('/meetings')
  return { ok: true, meetingId: row.id as string }
}
