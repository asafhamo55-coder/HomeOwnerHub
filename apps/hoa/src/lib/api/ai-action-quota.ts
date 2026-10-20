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
//
// Board buckets fail closed (M-1): `board_ai` and `compose` are board/admin
// features, so a caller whose role in `orgId` is not board or admin — or
// whose role cannot be read — is refused here, before anything is counted
// or charged, even if the action that called this forgot its own gate.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { BOARD_ONLY_DENIED } from '@/lib/accounting/guard'
import { ApiRouteError } from './errors'
import { checkAndRecordAiUsage, type UsageGrant } from './rate-limit'
import type { AiUsageBucket } from './ai-limits'

export type AiActionQuota =
  | ({ ok: true; userId: string } & UsageGrant)
  | { ok: false; error: string; rateLimited?: true }

const BOARD_BUCKETS: ReadonlySet<AiUsageBucket> = new Set<AiUsageBucket>(['board_ai', 'compose'])

export async function chargeAiActionQuota(bucket: AiUsageBucket, orgId: string): Promise<AiActionQuota> {
  if (BOARD_BUCKETS.has(bucket)) {
    let role: Awaited<ReturnType<typeof getCurrentUserRoleInOrg>> = null
    try {
      role = await getCurrentUserRoleInOrg(orgId)
    } catch {
      role = null
    }
    if (role !== 'admin' && role !== 'board') return { ok: false, error: BOARD_ONLY_DENIED }
  }
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
