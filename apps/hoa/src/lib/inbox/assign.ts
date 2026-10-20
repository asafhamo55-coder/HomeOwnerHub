'use server'

/**
 * Assign an inbox thread to a board member, or unassign it (BL-101 A6).
 * Writes the existing `inbox_threads.assigned_to`; no migration.
 *
 * The assignee is a VALUE written into an org-scoped row, so it is checked
 * against the caller's org before it is written (the same rule
 * `assignThreadToProperty` follows for `unitId`): it must be a board or
 * admin member of this org. A resident can never own a thread.
 *
 * Ids only in logs.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { isAssignableMember } from './assignees'

const AssignSchema = z.object({
  threadId: z.string().uuid(),
  /** null unassigns. */
  assigneeId: z.string().uuid().nullable(),
})

export async function assignThread(
  threadId: string,
  assigneeId: string | null,
): Promise<{ ok: true } | { error: string }> {
  const { org } = await requireBoardOrAdmin()

  const parsed = AssignSchema.safeParse({ threadId, assigneeId })
  if (!parsed.success) return { error: 'Pick a board member.' }

  if (parsed.data.assigneeId) {
    let allowed: boolean
    try {
      allowed = await isAssignableMember(org.id, parsed.data.assigneeId)
    } catch {
      return { error: 'Could not check that board member. Try again.' }
    }
    if (!allowed) return { error: 'Only board members and admins can be assigned a conversation.' }
  }

  const supabase = await getSupabaseServerClient()
  const { data: updated, error } = await supabase
    .from('inbox_threads')
    .update({ assigned_to: parsed.data.assigneeId })
    .eq('id', parsed.data.threadId)
    .eq('organization_id', org.id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('assignThread: update failed', { orgId: org.id, threadId: parsed.data.threadId, code: error.code })
    return { error: 'Could not assign this conversation. Try again.' }
  }
  if (!updated) return { error: 'Thread not found.' }

  revalidatePath('/inbox')
  revalidatePath(`/inbox/${parsed.data.threadId}`)
  return { ok: true }
}
