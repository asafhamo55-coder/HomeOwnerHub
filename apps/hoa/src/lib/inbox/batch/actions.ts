'use server'

/**
 * BL-101 A9 — "Answer all": one board-written reply, sent to several
 * threads that ask the same thing.
 *
 * Nothing new on the send side. For each selected thread this creates an
 * ordinary reply draft addressed ONLY to that thread's newest inbound
 * sender, then hands it to the existing `approveDraft` — the same blank
 * check, recipient validation, 30-second undo window, send job and BL-004
 * outbound guard as a reply approved by hand. There is never a shared To,
 * Cc or Bcc across residents.
 *
 * Explicit confirmation is structural, not only a dialog: the caller must
 * echo the exact number of threads it showed the board (`confirmCount`),
 * and a mismatch sends nothing.
 *
 * Skipped, not failed, per thread: a thread already sending a reply, a
 * closed or parked one, one with no sender to reply to. The board is told
 * the count and why.
 *
 * Logs carry ids, counts and codes only — never an address, subject or body.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { appUrl } from '@/lib/app-origin'
import { approveDraft, cancelDraft } from '@/lib/inbox/draft/actions'
import { MAX_BATCH } from './group'
import { batchBodyProblem, batchReplySubject, renderBatchBody } from './body'

export type BatchSkipReason = 'not_found' | 'not_open' | 'already_sending' | 'no_sender' | 'failed'

export interface BatchReplyResult {
  ok: true
  /** Draft ids now in their undo window, for "Undo all". */
  queued: string[]
  skipped: Array<{ threadId: string; reason: BatchSkipReason }>
  sendAfter: string | null
}

const Input = z.object({
  threadIds: z
    .array(z.string().uuid())
    .min(2, 'Pick at least two conversations.')
    .max(MAX_BATCH, `A batch reply goes to at most ${MAX_BATCH} conversations.`),
  body: z.string(),
  confirmCount: z.number().int(),
  closeThreads: z.boolean(),
})

export async function sendBatchReply(input: {
  threadIds: string[]
  body: string
  confirmCount: number
  closeThreads: boolean
}): Promise<BatchReplyResult | { ok: false; error: string }> {
  const parsed = Input.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.' }
  const threadIds = [...new Set(parsed.data.threadIds)]
  if (threadIds.length !== parsed.data.threadIds.length) return { ok: false, error: 'A conversation is listed twice.' }
  if (parsed.data.confirmCount !== threadIds.length) {
    return { ok: false, error: 'The number of conversations changed. Check the list and confirm again.' }
  }
  const problem = batchBodyProblem(parsed.data.body)
  if (problem) return { ok: false, error: problem }

  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const [threadsRead, messagesRead, busyRead] = await Promise.all([
    supabase.from('inbox_threads').select('id, subject, status').eq('organization_id', org.id).in('id', threadIds),
    supabase
      .from('inbox_messages')
      .select('thread_id, from_email, from_name, sent_at')
      .eq('organization_id', org.id)
      .in('thread_id', threadIds)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false }),
    supabase
      .from('inbox_drafts')
      .select('thread_id')
      .eq('organization_id', org.id)
      .in('thread_id', threadIds)
      .in('status', ['queued', 'sending']),
  ])
  for (const [table, read] of [
    ['inbox_threads', threadsRead],
    ['inbox_messages', messagesRead],
    ['inbox_drafts', busyRead],
  ] as const) {
    if (read.error) {
      console.error('sendBatchReply: read failed', { orgId: org.id, table, code: read.error.code })
      return { ok: false, error: 'Couldn’t load these conversations. Nothing was sent.' }
    }
  }

  const threads = new Map((threadsRead.data ?? []).map((t) => [t.id, t]))
  const newestInbound = new Map<string, { from_email: string | null; from_name: string | null }>()
  for (const m of messagesRead.data ?? []) {
    if (!newestInbound.has(m.thread_id)) newestInbound.set(m.thread_id, m)
  }
  const busy = new Set((busyRead.data ?? []).map((d) => d.thread_id))

  const portalLink = appUrl('/resident')
  const arcLink = appUrl('/resident/arc/new')
  const queued: string[] = []
  const skipped: BatchReplyResult['skipped'] = []
  let sendAfter: string | null = null

  // Sequential on purpose: each approve is its own audited transition, and
  // 25 is small. A failure on one thread never stops the rest.
  for (const threadId of threadIds) {
    const thread = threads.get(threadId)
    if (!thread) {
      skipped.push({ threadId, reason: 'not_found' })
      continue
    }
    if (thread.status !== 'needs_review' && thread.status !== 'open') {
      skipped.push({ threadId, reason: 'not_open' })
      continue
    }
    if (busy.has(threadId)) {
      skipped.push({ threadId, reason: 'already_sending' })
      continue
    }
    const sender = newestInbound.get(threadId)
    const to = sender?.from_email?.trim()
    if (!to) {
      skipped.push({ threadId, reason: 'no_sender' })
      continue
    }

    const subject = batchReplySubject(thread.subject)
    const body = renderBatchBody(parsed.data.body, { fromName: sender?.from_name ?? null, portalLink, arcLink })

    const { data: draft, error: insertError } = await supabase
      .from('inbox_drafts')
      .insert({
        organization_id: org.id,
        thread_id: threadId,
        kind: 'reply',
        status: 'draft',
        created_by: user.id,
        subject,
        body_text: body,
        to_emails: [to],
        cc_emails: [],
      })
      .select('id')
      .single()
    if (insertError || !draft) {
      console.error('sendBatchReply: draft insert failed', { orgId: org.id, threadId, code: insertError?.code })
      skipped.push({ threadId, reason: 'failed' })
      continue
    }

    const approved = await approveDraft(draft.id, { subject, body, to: [to], cc: [] }, { closeThread: parsed.data.closeThreads })
    if ('error' in approved) {
      // Left as an unsent draft in its thread, where the board can see it
      // and send or discard it by hand.
      console.error('sendBatchReply: approve refused', { orgId: org.id, threadId, draftId: draft.id })
      skipped.push({ threadId, reason: 'failed' })
      continue
    }
    queued.push(draft.id)
    sendAfter = approved.sendAfter
  }

  console.info('sendBatchReply: done', { orgId: org.id, requested: threadIds.length, queued: queued.length, skipped: skipped.length })
  revalidatePath('/inbox')
  return { ok: true, queued, skipped, sendAfter }
}

/**
 * "Undo all" inside the 30-second window: cancels each queued reply through
 * the existing cancelDraft (which also reopens a thread the send closed).
 * Returns how many were stopped; any already sending are reported, not hidden.
 */
export async function undoBatchReply(input: {
  draftIds: string[]
}): Promise<{ ok: true; cancelled: number; tooLate: number } | { ok: false; error: string }> {
  const parsed = z.object({ draftIds: z.array(z.string().uuid()).min(1).max(MAX_BATCH) }).safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid request.' }
  let cancelled = 0
  let tooLate = 0
  for (const draftId of parsed.data.draftIds) {
    const r = await cancelDraft(draftId)
    if ('error' in r) tooLate += 1
    else cancelled += 1
  }
  return { ok: true, cancelled, tooLate }
}
