'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { stampNoticePosted, type StampOutcome } from './notice-record'
import { appOrigin } from '@/lib/app-origin'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { calendarLinkParams, calendarParagraphHtml } from './notice-prefill'
import { signCalendarLink } from './calendar-link-sign'

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

/**
 * L-3: the notice's "Add to calendar" paragraph, built on the server so the
 * link's time and place carry an HMAC (calendar-link-sign.ts) bound to the
 * board's org and this meeting. The calendar route serves a time and place
 * only with a valid signature. No secret configured → the link carries
 * the date only.
 */
export async function meetingCalendarParagraph(
  meetingId: string,
  answers: { time?: unknown; where?: unknown },
): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!z.string().uuid().safeParse(meetingId).success) return { ok: false, error: 'Invalid meeting.' }

  const { start, where } = calendarLinkParams(answers ?? {})
  const secret = paySettingsSecret()
  const sig = secret && (start || where) ? signCalendarLink(secret, { orgId: gate.orgId, meetingId, start, where }) : null
  return { ok: true, html: calendarParagraphHtml(appOrigin(), meetingId, { time: start ?? undefined, where: where ?? undefined }, sig) }
}
