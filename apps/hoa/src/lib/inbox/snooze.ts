'use server'

/**
 * BL-134 (inbox plan B1) — snooze or un-snooze an inbox thread. Writes
 * inbox_threads.snoozed_until (migration 0067). Inert until M3_APPLIED:
 * with the flag off it returns an error before touching anything (the
 * column may not exist yet), and the UI does not offer it.
 *
 * Same shape as assign.ts: board/admin gate, the caller's own RLS client,
 * org-scoped update that re-selects so a foreign or stale id reports
 * "not found" instead of a false success. The instant comes from the
 * browser (its presets are in the board member's own time zone) and is
 * checked here (snooze-rules.ts). Ids and codes only in logs.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { M3_APPLIED } from '@homeowner-portal/db/m3'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { SNOOZE_ERRORS, checkSnoozeUntil } from './snooze-rules'

const ThreadId = z.string().uuid()

export async function snoozeThread(
  threadId: string,
  until: string | null,
): Promise<{ ok: true; snoozedUntil: string | null } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  if (!M3_APPLIED) return { error: SNOOZE_ERRORS.notLive }

  if (!ThreadId.safeParse(threadId).success) return { error: 'Thread not found.' }
  const checked = checkSnoozeUntil(until, Date.now())
  if (!checked.ok) return { error: checked.error }

  const supabase = await getSupabaseServerClient()
  // snoozed_until is not in the generated types until gen:types runs after
  // prod has 0067 (CLAUDE.md footgun 3), hence the casts.
  const { data: updated, error } = await supabase
    .from('inbox_threads')
    .update({ snoozed_until: checked.until } as never)
    .eq('id', threadId)
    .eq('organization_id', org.id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('snoozeThread: update failed', { orgId: org.id, threadId, code: error.code })
    return { error: 'Could not snooze this conversation. Try again.' }
  }
  if (!updated) return { error: 'Thread not found.' }

  revalidatePath('/inbox')
  revalidatePath(`/inbox/${threadId}`)
  return { ok: true, snoozedUntil: checked.until }
}
