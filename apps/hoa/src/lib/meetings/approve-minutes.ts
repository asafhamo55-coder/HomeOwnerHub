// Approving the minutes of a meeting that already exists (scheduled first,
// minutes recorded later). Pure rule plus a db-injected core, so no server
// imports here: a 'use client' file may import canApproveMinutes.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { minutesApproved } from './meetings-list'

export interface ApprovableMeeting {
  meeting_date: string
  status: string | null
  approved_at: string | null
  ai_summary: string | null
}

/** Past, has minutes text, not archived, not already approved. */
export function canApproveMinutes(m: ApprovableMeeting, today: string): boolean {
  return (
    m.meeting_date.slice(0, 10) < today &&
    m.status !== 'archived' &&
    !minutesApproved(m) &&
    (m.ai_summary ?? '').trim().length > 0
  )
}

export type ApproveMinutesResult = { ok: true; alreadyApproved: boolean } | { ok: false; error: string }

export async function approveExistingMinutes(
  db: SupabaseClient<Database>,
  args: { orgId: string; meetingId: string; userId: string; role: 'admin' | 'board'; now?: Date },
): Promise<ApproveMinutesResult> {
  const { orgId, meetingId, userId, role } = args
  const { data: row, error: readError } = await db
    .from('hoa_meeting_minutes')
    .select('id, status, approved_at, ai_summary')
    .eq('id', meetingId)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (readError) return { ok: false, error: 'Couldn’t load this meeting. Try again.' }
  if (!row) return { ok: false, error: 'Meeting not found.' }
  if (minutesApproved(row)) return { ok: true, alreadyApproved: true }
  if (!(row.ai_summary ?? '').trim()) return { ok: false, error: 'Record the minutes before approving them.' }

  const now = (args.now ?? new Date()).toISOString()
  const { data: updated, error } = await db
    .from('hoa_meeting_minutes')
    .update({ status: 'approved', approved_at: now, approved_by: userId })
    .eq('id', meetingId)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .neq('status', 'approved')
    .select('id')
  if (error) return { ok: false, error: 'Couldn’t approve the minutes. Try again.' }
  // A concurrent approval got there first: same end state, no second audit row.
  if (!updated || updated.length === 0) return { ok: true, alreadyApproved: true }

  try {
    const { error: auditError } = await db.from('audit_log').insert({
      org_id: orgId,
      user_id: userId,
      action: 'meeting.minutes_approved',
      entity_type: 'hoa_meeting_minutes',
      entity_id: meetingId,
      metadata: { actor_role: role },
    })
    if (auditError) console.error('approveMinutes audit failed', { meetingId, code: auditError.code })
  } catch {
    console.error('approveMinutes audit failed', { meetingId, code: 'thrown' })
  }
  return { ok: true, alreadyApproved: false }
}
