'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { stampNoticePosted, type StampOutcome } from './notice-record'

const Input = z.object({ meetingId: z.string().uuid(), communicationId: z.string().uuid() })

/**
 * BL-118: called by the composer after a meeting notice is sent. Fills
 * hoa_meeting_minutes.notice_posted_at only once M1_APPLIED (see
 * notice-record.ts); before that it does nothing and the meeting page
 * reads "Notice sent on <date>" from the communication itself.
 */
export async function recordMeetingNoticeSent(
  meetingId: string,
  communicationId: string,
): Promise<{ ok: true; outcome: StampOutcome } | { ok: false; error: string }> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = Input.safeParse({ meetingId, communicationId })
  if (!parsed.success) return { ok: false, error: 'Invalid meeting or message.' }

  const supabase = await getSupabaseServerClient()
  const outcome = await stampNoticePosted(supabase, {
    m1: M1_APPLIED,
    orgId: gate.orgId,
    meetingId: parsed.data.meetingId,
    communicationId: parsed.data.communicationId,
  })
  revalidatePath(`/meetings/${parsed.data.meetingId}`)
  if (outcome === 'stamped') revalidatePath('/legal/compliance')
  return { ok: true, outcome }
}
