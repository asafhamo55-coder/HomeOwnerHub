'use server'

/**
 * BL-101 A5 — fill a saved reply's merge fields for one thread
 * (lib/inbox/saved-replies.ts). Returns text only: the composer puts it in
 * the draft, and nothing is written or sent here.
 *
 * The balance goes through the same disclosure gate as an AI draft (A2,
 * account-context.ts checkSenderForUnit): it is filled in only when the
 * newest inbound sender is a resident of the thread's home, and only from
 * a complete ledger. Otherwise it stays `[[BLANK: money]]`, so Approve is
 * blocked until a person decides. Board RLS client only.
 *
 * Ids and codes only in logs — never an address, a name or a figure.
 */

import { z } from 'zod'
import { requireBoardOrAdminForAction, BOARD_ONLY_DENIED } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { checkSenderForUnit, loadHomeAccount } from '@/lib/inbox/account-context'
import { appUrl } from '@/lib/app-origin'
import { fieldsUsed, findSavedReply, firstNameFrom, formatBalance, renderSavedReply } from './saved-replies'

export type SavedReplyResult = { ok: true; text: string; balanceWithheld: boolean } | { ok: false; error: string }

const Input = z.object({ threadId: z.string().uuid(), replyId: z.string().min(1).max(64) })

export async function resolveSavedReply(input: { threadId: string; replyId: string }): Promise<SavedReplyResult> {
  const parsed = Input.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }
  const reply = findSavedReply(parsed.data.replyId)
  if (!reply) return { ok: false, error: 'That saved reply wasn’t found.' }

  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const orgId = gate.orgId
  const threadId = parsed.data.threadId
  const db = await getSupabaseServerClient()

  const { data: thread, error: threadError } = await db
    .from('inbox_threads')
    .select('id, unit_id')
    .eq('organization_id', orgId)
    .eq('id', threadId)
    .maybeSingle()
  if (threadError) {
    console.error('[inbox.saved-replies] thread read failed', { orgId, threadId, code: threadError.code })
    return { ok: false, error: 'Couldn’t load this conversation. Try again.' }
  }
  if (!thread) return { ok: false, error: 'Thread not found.' }

  const used = fieldsUsed(reply.text)
  let sender: { from_email: string | null; from_name: string | null } | null = null
  if (used.has('first_name') || used.has('balance')) {
    const { data, error } = await db
      .from('inbox_messages')
      .select('from_email, from_name')
      .eq('thread_id', threadId)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error('[inbox.saved-replies] message read failed', { orgId, threadId, code: error.code })
      return { ok: false, error: 'Couldn’t load this conversation. Try again.' }
    }
    sender = data
  }

  // The disclosure gate, then the account — never the account first.
  let balance: string | null = null
  if (used.has('balance') && thread.unit_id && sender?.from_email) {
    const check = await checkSenderForUnit(db, orgId, thread.unit_id, sender.from_email.trim().toLowerCase(), {
      threadId,
    })
    if (check.verified) {
      const home = await loadHomeAccount(db, orgId, thread.unit_id)
      const a = home.account
      // A capped ledger could understate the balance: withhold it.
      if (a && !a.truncated) balance = formatBalance(a.balanceCents, a.today)
    }
  }

  const text = renderSavedReply(reply.text, {
    firstName: firstNameFrom(sender?.from_name),
    balance,
    portalLink: appUrl('/resident'),
    arcLink: appUrl('/resident/arc/new'),
  })
  return { ok: true, text, balanceWithheld: used.has('balance') && balance === null }
}
