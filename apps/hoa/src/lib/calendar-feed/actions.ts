'use server'

/**
 * "Reset my calendar link" (Round 29). Bumps the signed-in resident's
 * `calendar_feed_v`, which makes every earlier feed link fail
 * (lib/calendar-feed/token.ts). The subject is always the signed-in user;
 * the action takes no arguments, so nobody can reset anyone else's link.
 */
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@homeowner-portal/db'
import { requireRouteMember } from '@/lib/api/auth'
import { getSignedInUser } from '@/lib/orgs'
import { MAX_FEED_VERSION, feedVersionOf } from './token'

export type ResetCalendarLinkResult = { ok: true } | { ok: false; error: string }

export async function resetCalendarLink(): Promise<ResetCalendarLinkResult> {
  try {
    await requireRouteMember()
  } catch {
    return { ok: false, error: 'Sign in again to change your calendar link.' }
  }
  const user = await getSignedInUser()
  if (!user) return { ok: false, error: 'Sign in again to change your calendar link.' }

  const admin = createAdminClient()
  const current = await admin.auth.admin.getUserById(user.id)
  if (current.error || !current.data.user) return { ok: false, error: 'Couldn’t reset your link. Try again.' }
  const metadata = (current.data.user.user_metadata ?? {}) as Record<string, unknown>
  const next = Math.min(feedVersionOf(metadata) + 1, MAX_FEED_VERSION)
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...metadata, calendar_feed_v: next },
  })
  if (error) return { ok: false, error: 'Couldn’t reset your link. Try again.' }

  revalidatePath('/resident/meetings')
  return { ok: true }
}
