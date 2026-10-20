// BL-112 — requireAiQuota for SERVER ACTIONS.
//
// requireAiQuota is the route entry (it throws ApiRouteError, which
// withRoute turns into the 429 / 503 envelope). A server action has no
// envelope: it returns `{ error }` to the component that called it. This
// draws on the same bucket through the same checkAndRecordAiUsage — same
// caps, same monthly spend meter, same AI_PLATFORM_KILL_SWITCH — and hands
// back the same public message the route would have sent:
//   - rate limit / spend ceiling (the route's 429) → `rateLimited: true`;
//   - kill switch (the route's 503 `ai_paused`)    → `rateLimited: true`.
// Any other error propagates, exactly as in a route.
//
// Call it AFTER auth, role and input checks and BEFORE the model call
// (RC-3), so a refused or malformed request costs nothing.
//
// Ids only in logs (checkAndRecordAiUsage logs codes; nothing here logs).

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ApiRouteError } from './errors'
import { checkAndRecordAiUsage, type UsageGrant } from './rate-limit'
import type { AiUsageBucket } from './ai-limits'

export type AiActionQuota =
  | ({ ok: true; userId: string } & UsageGrant)
  | { ok: false; error: string; rateLimited?: true }

export async function chargeAiActionQuota(bucket: AiUsageBucket, orgId: string): Promise<AiActionQuota> {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  try {
    const grant = await checkAndRecordAiUsage(bucket, { orgId, userId: user.id })
    return { ok: true, userId: user.id, ...grant }
  } catch (err) {
    if (err instanceof ApiRouteError && (err.code === 'rate_limited' || err.extra?.reason === 'ai_paused')) {
      return { ok: false, error: err.publicMessage, rateLimited: true }
    }
    throw err
  }
}
