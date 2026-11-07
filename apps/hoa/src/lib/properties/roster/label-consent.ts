import type { SupabaseClient } from '@supabase/supabase-js'
import { M1_APPLIED } from '@homeowner-portal/db/m1'
import { loadEmailConsent } from '@/lib/email-consent'
import { officialNoticeApplies, planOfficialNotice } from '@/lib/communications/official-notice'
import { resolveAudience } from '@/lib/communications/audience'

/**
 * Lowercased email addresses of members the product's own paper-notice rule
 * would not email (no consent to electronic notices). It is the same plan
 * the composer uses (planOfficialNotice), not a second copy of the rule.
 * Empty where the rule does not apply (not California, or M1 off).
 * Returns null when consent could not be read: the caller must not print a
 * list that silently ignores it. Nothing is logged here.
 */
export async function loadNoConsentEmails(
  supabase: SupabaseClient,
  args: { orgId: string; associationId: string | null; state: string | null | undefined },
): Promise<Set<string> | null> {
  if (!officialNoticeApplies(args.state, M1_APPLIED)) return new Set()
  if (!args.associationId) return null
  const consent = await loadEmailConsent(supabase as never, args.orgId, { m1: true })
  const resolved = await resolveAudience(supabase as never, args.associationId, { kind: 'everyone' })
  const plan = planOfficialNotice(resolved.recipients, {
    channels: ['email'],
    state: args.state,
    officialNotice: true,
    m1: true,
    consent,
  })
  if (!plan.applies || !plan.ok) return null
  const out = new Set<string>()
  for (const r of resolved.recipients) {
    const email = r.email?.trim().toLowerCase()
    if (email && !plan.emailKeep.has(r)) out.add(email)
  }
  return out
}
