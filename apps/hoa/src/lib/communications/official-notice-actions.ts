'use server'

import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { loadEmailConsent } from '@/lib/email-consent'
import { resolveAudience, type AudienceDefinition } from './audience'
import { officialNoticeApplies, planOfficialNotice, type PaperNoticeSummary } from './official-notice'

export type OfficialNoticePreview =
  | { ok: true; applies: false }
  | { ok: true; applies: true; recipients: number; paper: PaperNoticeSummary }
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

const CONSENT_FAILED = 'Couldn’t check e-consent. Try again before sending.'

/**
 * The composer's Review step for an official notice (BL-020): who this
 * audience would NOT get by email, so the board can mail them a paper
 * copy. Same resolver and the same plan as sendCommunication, so the list
 * is what the send will do. Returns names and homes for the board's
 * screen; nothing is logged.
 */
export async function previewOfficialNotice(
  audience: AudienceDefinition,
  channels: readonly string[],
): Promise<OfficialNoticePreview> {
  if (!M1_APPLIED) return { ok: true, applies: false }
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!audience || !KINDS.has(audience.kind)) return { ok: false, error: 'Pick an audience first.' }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }
  const supabase = await getSupabaseServerClient()
  const { data: assocRow, error: assocErr } = await supabase
    .from('associations')
    .select('organization_id, state')
    .eq('id', assoc.id)
    .single()
  if (assocErr || !assocRow) return { ok: false, error: CONSENT_FAILED }
  if (!officialNoticeApplies(assocRow.state, true)) return { ok: true, applies: false }

  const resolved = await resolveAudience(supabase, assoc.id, audience)
  const consent = await loadEmailConsent(supabase, assocRow.organization_id, { m1: true })
  const plan = planOfficialNotice(resolved.recipients, {
    channels,
    state: assocRow.state,
    officialNotice: true,
    m1: true,
    consent,
  })
  if (!plan.applies) return { ok: true, applies: false }
  if (!plan.ok) return { ok: false, error: CONSENT_FAILED }
  return { ok: true, applies: true, recipients: resolved.recipients.length, paper: plan.paper }
}
