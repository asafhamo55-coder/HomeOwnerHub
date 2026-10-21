'use server'

// BL-141: the election planner's one write — seats and dates, inspectors,
// a candidate added, taken off the ballot or removed, the results, or the
// CA quorum outcome. What is stored and why it is signed: ./model.ts.
//
// Board/admin only: every call re-checks the role
// (requireBoardOrAdminForAction) because a server action is a public
// endpoint. The meeting and a candidate's home must both be the caller's
// org's. Nothing is sent to anyone.

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readKitAssociations, readKitMeeting } from '@/lib/meeting-quorum/load'
import { UUID as MEETING_UUID, kitEligibility, kitIsOpen } from '@/lib/meeting-quorum/quorum'
import { readKit } from '@/lib/meeting-quorum/store'
import { applyElectionChange, isElectionChange, type Election, type ElectionChange } from './model'
import { electionOf, readElection, signElection, withElection } from './store'

export type UpdateElectionResult = { ok: true; election: Election } | { ok: false; error: string }

export async function updateElection(meetingId: string, change: ElectionChange): Promise<UpdateElectionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof meetingId !== 'string' || !MEETING_UUID.test(meetingId) || !isElectionChange(change)) {
    return { ok: false, error: 'Invalid input.' }
  }

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'The election planner can’t be saved on this server yet. Contact support.' }

  const supabase = await getSupabaseServerClient()
  const m = await readKitMeeting(supabase, gate.orgId, meetingId)
  if (!m.ok) return { ok: false, error: 'Couldn’t load this meeting. Try again.' }
  if (!m.meeting) return { ok: false, error: 'That meeting isn’t part of your organization.' }

  const a = await readKitAssociations(supabase, gate.orgId)
  if (!a.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  const assoc = a.rows[0]
  if (!assoc) return { ok: false, error: 'Set up an association before planning an election.' }

  const kit = readKit(assoc.id, meetingId, assoc.compliance_settings, secret)
  if (!kitIsOpen(kitEligibility(m.meeting.meeting_type, kit))) {
    return { ok: false, error: 'Elections are held at the annual meeting or a special meeting of the members.' }
  }

  if (change.kind === 'add_candidate' && change.propertyId) {
    const { data, error } = await supabase
      .from('hoa_properties')
      .select('id')
      .eq('id', change.propertyId)
      .eq('org_id', gate.orgId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) {
      console.error('[election] home read failed', { code: error.code ?? 'unknown' })
      return { ok: false, error: 'Couldn’t check that home. Try again.' }
    }
    if (!data) return { ok: false, error: 'That home isn’t part of your organization.' }
  }

  // An unverified election reads as empty, so this write replaces it.
  const current = electionOf(readElection(assoc.id, meetingId, assoc.compliance_settings, secret))
  const applied = applyElectionChange(current, change, { meetingDate: m.meeting.meeting_date, newId: randomUUID() })
  if (!applied.ok) return applied

  const now = new Date().toISOString()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let stored
  try {
    stored = signElection(assoc.id, meetingId, applied.election, { updatedAt: now, updatedBy: user?.id ?? null }, secret)
  } catch {
    return { ok: false, error: 'Invalid input.' }
  }
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withElection(assoc.compliance_settings, meetingId, stored) as never })
    .eq('id', assoc.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values (RC-2).
    console.error('[election] save failed', { code: error?.code ?? 'no_rows', meetingId })
    return { ok: false, error: 'Couldn’t save. Try again.' }
  }

  revalidatePath(`/meetings/${meetingId}/election`)
  revalidatePath(`/meetings/${meetingId}`)
  return { ok: true, election: applied.election }
}
