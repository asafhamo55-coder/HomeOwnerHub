'use server'

import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { resolveAudience, type AudienceDefinition } from './audience'
import { deliverableChannels, officialNoticeApplies } from './official-notice'
import { applyPreferences, loadPreferenceMap, preferencesApply } from './preferences'

export type PreferencePreview =
  | { ok: true; email: number; sms: number }
  | { ok: false; error: string }

const KINDS = new Set<AudienceDefinition['kind']>([
  'everyone',
  'owners_only',
  'tenants_only',
  'late_on_dues',
  'open_violations',
  'specific_residents',
  'board',
  'manual_emails',
])

const READ_FAILED = 'Couldn’t check residents’ message preferences. Try again before sending.'

/**
 * The composer's Review step (BL-102): how many recipients each channel
 * will skip because of their own preferences — "N will be skipped (opted
 * out)". Same resolver and the same policy as sendCommunication, so the
 * count is what the send will do. Returns counts only; nothing is logged.
 */
export async function previewPreferenceSkips(
  audience: AudienceDefinition,
  channels: readonly string[],
  officialNotice: boolean,
): Promise<PreferencePreview> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!audience || !KINDS.has(audience.kind)) return { ok: false, error: 'Pick an audience first.' }
  if (!preferencesApply(audience.kind, channels)) return { ok: true, email: 0, sms: 0 }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }
  const supabase = await getSupabaseServerClient()
  const { data: assocRow, error: assocErr } = await supabase
    .from('associations')
    .select('organization_id, state')
    .eq('id', assoc.id)
    .single()
  if (assocErr || !assocRow) return { ok: false, error: READ_FAILED }

  const prefs = await loadPreferenceMap(supabase, assocRow.organization_id)
  if (!prefs.ok) return { ok: false, error: READ_FAILED }
  const resolved = await resolveAudience(supabase, assoc.id, audience)
  const policy = {
    map: prefs.map,
    officialNoticeEmail: officialNotice && M1_APPLIED && officialNoticeApplies(assocRow.state, true),
  }

  let email = 0
  let sms = 0
  for (const r of resolved.recipients) {
    const { optedOut } = applyPreferences(r.userId, deliverableChannels(r, channels, null), policy)
    if (optedOut.includes('email')) email += 1
    if (optedOut.includes('sms')) sms += 1
  }
  return { ok: true, email, sms }
}
