import type { SupabaseClient } from '@supabase/supabase-js'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { loadEmailConsent } from '@/lib/email-consent'
import { officialNoticeApplies } from '@/lib/communications/official-notice'
import type { PaperRule } from './labels'

/**
 * The paper-notice rule for the label page, built from the product's own
 * consent store. `states` are the states of the homes on the roster, so a
 * mixed-state org is judged home by home, not by the primary state.
 *
 * The consent read (loadEmailConsent: paged, org-scoped) happens only when
 * the rule applies to at least one of those states. If it cannot be read the
 * result is null and the caller must show a failure: a list that quietly
 * ignores consent would leave people off the paper run. Nothing is logged here.
 */
export async function loadPaperRule(
  supabase: SupabaseClient,
  orgId: string,
  states: readonly (string | null)[],
  opts: { m1?: boolean } = {},
): Promise<PaperRule | null> {
  const m1 = opts.m1 ?? M1_APPLIED
  const consentApplies = (state: string | null) => officialNoticeApplies(state, m1)
  if (!states.some((s) => consentApplies(s))) return { consentApplies, granted: new Set() }

  const res = await loadEmailConsent(supabase as never, orgId, { m1 })
  if (!res.ok || !res.available) return null
  const granted = new Set<string>()
  for (const [userId, state] of res.consent) if (state.granted) granted.add(userId)
  return { consentApplies, granted }
}
