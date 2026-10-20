'use server'

// BL-122: the quorum kit's one write — a proxy received, a check-in, the
// board's quorum percent, or "this special meeting is the members'".
// Storage, signing and limits: ./quorum.ts.
//
// Board/admin only: every call re-checks the role
// (requireBoardOrAdminForAction) because a server action is a public
// endpoint. The meeting and the home must both be the caller's org's.
// Nothing is sent to anyone.

import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readKitAssociations, readKitMeeting } from './load'
import {
  UUID,
  applyKitChange,
  isValidQuorumPct,
  kitEligibility,
  kitIsOpen,
  type KitChange,
  type QuorumKit,
} from './quorum'
import { readKit, signKit, withKit } from './store'

export type UpdateKitResult = { ok: true; kit: QuorumKit } | { ok: false; error: string }

function validChange(c: unknown): c is KitChange {
  if (typeof c !== 'object' || c === null) return false
  const v = c as Record<string, unknown>
  switch (v.kind) {
    case 'quorum_pct':
      return v.pct === null || isValidQuorumPct(v.pct)
    case 'member_meeting':
      return typeof v.value === 'boolean'
    case 'proxy':
      return typeof v.propertyId === 'string' && UUID.test(v.propertyId) && (v.proxy === null || v.proxy === 'general' || v.proxy === 'limited')
    case 'present':
      return typeof v.propertyId === 'string' && UUID.test(v.propertyId) && typeof v.present === 'boolean'
    default:
      return false
  }
}

export async function updateQuorumKit(meetingId: string, change: KitChange): Promise<UpdateKitResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof meetingId !== 'string' || !UUID.test(meetingId) || !validChange(change)) {
    return { ok: false, error: 'Invalid input.' }
  }
  if (change.kind === 'quorum_pct' && change.pct !== null && !isValidQuorumPct(change.pct)) {
    return { ok: false, error: 'Enter a percent above 0 and up to 100.' }
  }

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'The quorum kit can’t be saved on this server yet. Contact support.' }

  const supabase = await getSupabaseServerClient()
  const m = await readKitMeeting(supabase, gate.orgId, meetingId)
  if (!m.ok) return { ok: false, error: 'Couldn’t load this meeting. Try again.' }
  if (!m.meeting) return { ok: false, error: 'That meeting isn’t part of your organization.' }

  const a = await readKitAssociations(supabase, gate.orgId)
  if (!a.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  const assoc = a.rows[0]
  if (!assoc) return { ok: false, error: 'Set up an association before using the quorum kit.' }

  // An unverified kit reads as empty, so this write replaces it.
  const current = readKit(assoc.id, meetingId, assoc.compliance_settings, secret)
  const eligibility = kitEligibility(m.meeting.meeting_type, current)
  if (change.kind === 'member_meeting') {
    if (m.meeting.meeting_type !== 'special') {
      return { ok: false, error: 'Only a special meeting needs to be marked as a members’ meeting.' }
    }
  } else if (!kitIsOpen(eligibility)) {
    return { ok: false, error: 'The quorum kit is for the annual meeting or a special meeting of the members.' }
  }

  if (change.kind === 'proxy' || change.kind === 'present') {
    const { data, error } = await supabase
      .from('hoa_properties')
      .select('id')
      .eq('id', change.propertyId)
      .eq('org_id', gate.orgId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) {
      console.error('[quorum-kit] home read failed', { code: error.code ?? 'unknown' })
      return { ok: false, error: 'Couldn’t check that home. Try again.' }
    }
    if (!data) return { ok: false, error: 'That home isn’t part of your organization.' }
  }

  const now = new Date().toISOString()
  const base: QuorumKit = { memberMeeting: current.memberMeeting, quorumPct: current.quorumPct, homes: current.homes }
  const next = applyKitChange(base, change, now)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let stored
  try {
    stored = signKit(assoc.id, meetingId, next, { updatedAt: now, updatedBy: user?.id ?? null }, secret)
  } catch {
    return { ok: false, error: 'Invalid input.' }
  }
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withKit(assoc.compliance_settings, meetingId, stored) as never })
    .eq('id', assoc.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values (RC-2).
    console.error('[quorum-kit] save failed', { code: error?.code ?? 'no_rows', meetingId })
    return { ok: false, error: 'Couldn’t save. Try again.' }
  }

  revalidatePath(`/meetings/${meetingId}/quorum`)
  return { ok: true, kit: next }
}
