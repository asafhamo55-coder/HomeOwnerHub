'use server'

// Storage for Web Push subscriptions — the browser-side half of the
// ticket notification feature. See
// docs/superpowers/specs/2026-08-31-ticket-notifications-design.md.
//
// WHO THIS IS FOR
//
// Board members. They are the people the ticket job notifies, so the
// guard here is requireBoardOrAdmin — a resident has no reason to hold a
// row in this table today.
//
// WHY NOTHING HERE THROWS
//
// Migration 0053 creates push_subscriptions and it is NOT applied yet;
// this code ships first, by design. A missing table makes PostgREST
// answer 42P01 ("relation does not exist"), which surfaces as an error
// object, not an exception — but a network-level failure DOES throw, so
// every call is wrapped as well. Either way the caller gets a clean
// { ok: false, error } and the settings page it is rendered on keeps
// working. The opt-in UI turns that into "not available yet".
//
// The `as never` casts are the house pattern for tables absent from the
// generated Supabase types (see resident-tickets.ts, which does the same
// for `tickets`). They go away when 0053 is applied and `pnpm gen:types`
// is re-run — and not before, because gen:types reads the LIVE database.

import { z } from 'zod'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

export interface SavePushSubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}

// The endpoint is a push-service URL (fcm.googleapis.com,
// web.push.apple.com, …). Bounding the length keeps a hostile client
// from parking megabytes in a unique-indexed text column; 2048 is far
// above anything a real push service issues.
const SaveSchema = z.object({
  endpoint: z.string().trim().url('Invalid push endpoint.').max(2048),
  p256dh: z.string().trim().min(1, 'Missing p256dh key.').max(255),
  auth: z.string().trim().min(1, 'Missing auth key.').max(255),
  userAgent: z.string().trim().max(500).optional(),
})

const NOT_AVAILABLE =
  'Push notifications are not available yet — the notifications tables have not been set up.'

// Both the "table missing" and the "column missing" codes. Either means
// 0053 has not been applied, which is a deployment state rather than a
// bug, so it gets the explanatory message instead of a raw PostgREST
// string the user cannot act on.
function describeDbError(error: { code?: string; message: string }): string {
  if (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST205') {
    return NOT_AVAILABLE
  }
  return error.message
}

/**
 * Upserts one (browser, device) subscription for the signed-in board
 * member.
 *
 * ON CONFLICT (endpoint), not (user_id), because the endpoint URL *is*
 * the device identity to the push service: re-subscribing the same
 * browser hands back the same endpoint, so upserting on it is what stops
 * one laptop accumulating a row per login. One user legitimately holds
 * several rows — phone and laptop are different endpoints.
 *
 * user_id is included in the update payload deliberately: if two people
 * share a device and the second signs in, the endpoint moves to whoever
 * subscribed last. The alternative — leaving it pointed at the first
 * user — would push one person's ticket alerts to another person's
 * session.
 */
export async function savePushSubscription(
  input: SavePushSubscriptionInput,
): Promise<ActionResult> {
  // Outside the try: requireBoardOrAdmin signals failure by throwing
  // Next's redirect, and swallowing that would strand the user on a page
  // they are not allowed to see.
  const { org } = await requireBoardOrAdmin()

  const parsed = SaveSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid subscription.' }
  }

  try {
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Not signed in.' }

    const { error } = await supabase
      .from('push_subscriptions' as never)
      .upsert(
        {
          organization_id: org.id,
          user_id: user.id,
          endpoint: parsed.data.endpoint,
          p256dh: parsed.data.p256dh,
          auth: parsed.data.auth,
          user_agent: parsed.data.userAgent ?? null,
          last_used_at: null,
        } as never,
        { onConflict: 'endpoint' },
      )

    if (error) return { ok: false, error: describeDbError(error) }
    return { ok: true }
  } catch (err) {
    // Never rethrow. This runs from a settings page; a push registration
    // that cannot be stored must not take the page down with it.
    console.error('savePushSubscription failed', err)
    return { ok: false, error: NOT_AVAILABLE }
  }
}

/**
 * Removes one subscription — the "turn it off" path.
 *
 * Scoped to the caller's own user_id as well as the endpoint. RLS gates
 * on organization membership only (0053's org_access policy), so without
 * this the board member of a shared org could delete a colleague's
 * device by guessing its endpoint.
 *
 * Deleting a row that isn't there is success, not an error: the user
 * asked for "off" and off is what they have.
 */
export async function deletePushSubscription(endpoint: string): Promise<ActionResult> {
  await requireBoardOrAdmin()

  const parsed = z.string().trim().url().max(2048).safeParse(endpoint)
  if (!parsed.success) return { ok: false, error: 'Invalid push endpoint.' }

  try {
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Not signed in.' }

    const { error } = await supabase
      .from('push_subscriptions' as never)
      .delete()
      .eq('endpoint', parsed.data)
      .eq('user_id', user.id)

    if (error) return { ok: false, error: describeDbError(error) }
    return { ok: true }
  } catch (err) {
    console.error('deletePushSubscription failed', err)
    return { ok: false, error: NOT_AVAILABLE }
  }
}

/**
 * How many devices the signed-in user has registered.
 *
 * The opt-in card uses this to tell "push is on, and the server knows
 * about this device" apart from "the browser thinks it is subscribed but
 * nothing was ever stored" — which is exactly the state you land in
 * while 0053 is unapplied, and the state that would otherwise read as a
 * silently broken feature.
 */
export async function countMyPushDevices(): Promise<ActionResult<{ count: number }>> {
  await requireBoardOrAdmin()

  try {
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Not signed in.' }

    const { count, error } = await supabase
      .from('push_subscriptions' as never)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (error) return { ok: false, error: describeDbError(error) }
    return { ok: true, data: { count: count ?? 0 } }
  } catch (err) {
    console.error('countMyPushDevices failed', err)
    return { ok: false, error: NOT_AVAILABLE }
  }
}
