'use server'

/**
 * Server actions for the human loop around an AI-suggested reply: generate a
 * draft, approve it into a 30-second undo window, or cancel it before it
 * sends.
 *
 * `'use server'` modules may export only async functions — see blanks.ts for
 * why `UNDO_WINDOW_SECONDS` and `hasUnfilledBlanks` live there instead.
 *
 * Invariant this file owns (not enforced by the schema — migration 0035 puts
 * no constraint tying `status` to `approved_by`/`approved_at`): a row can
 * only reach 'queued' in the same UPDATE that stamps `approved_by` and
 * `approved_at`. Never as two statements — a failure between them would
 * leave a queued reply with no record of who approved it, and that record
 * is the entire point of the audit trail.
 *
 * Every state transition below is a CONDITIONAL update (`.eq('status', …)`),
 * never read-then-decide, and every one is additionally scoped to
 * `.eq('organization_id', org.id)`. Never log an email address, subject, or
 * body — draft bodies carry resident PII. `PostgrestError.message`/`.code`
 * only, never `.details`.
 */

import { revalidatePath } from 'next/cache'
import { inngest } from '@homeowner-portal/jobs'
import { draftReply, InvalidCitationError, UnsupportedQuoteError } from '@homeowner-portal/workflows'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { retrieveForThread } from './retrieve'
import { UNDO_WINDOW_SECONDS, hasUnfilledBlanks } from './blanks'

export async function createDraft(
  threadId: string,
): Promise<{ ok: true; draftId: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  let retrieval
  try {
    retrieval = await retrieveForThread(supabase, org.id, threadId)
  } catch (error) {
    console.error(
      `createDraft: retrieval failed for thread ${threadId}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return { error: 'Could not gather context for this thread. Nothing was drafted.' }
  }

  let generated
  try {
    generated = await draftReply(
      {
        threadSubject: retrieval.threadSubject,
        messages: retrieval.messages,
        fragments: retrieval.fragments,
        degraded: retrieval.degraded,
        aiContext: retrieval.aiContext,
      },
      { organizationId: org.id },
    )
  } catch (error) {
    // A rejected draft is not persisted. Showing a partial draft that failed
    // citation validation would put invented references in front of a
    // reviewer, which is the exact failure the validator exists to prevent.
    if (error instanceof InvalidCitationError || error instanceof UnsupportedQuoteError) {
      console.error(`createDraft: citation validation failed for thread ${threadId}: ${error.name}`)
      return {
        error: 'The draft cited sources that could not be verified, so it was discarded. Try again.',
      }
    }
    console.error(
      `createDraft: generation failed for thread ${threadId}: ${error instanceof Error ? error.name : 'UnknownError'}`,
    )
    return { error: 'Could not draft a reply right now.' }
  }

  const { data, error } = await supabase
    .from('inbox_drafts')
    .insert({
      organization_id: org.id,
      thread_id: threadId,
      status: 'draft',
      subject: generated.subject,
      body_text: generated.body,
      citations: generated.citations,
      blanks: generated.blanks,
      grounded: generated.grounded,
      grounding_note: generated.groundingNote,
      ai_run_id: generated.runId,
    })
    .select('id')
    .single()

  if (error) {
    console.error(`createDraft: insert failed: ${error.code} ${error.message}`)
    return { error: 'Could not save the draft.' }
  }

  revalidatePath(`/inbox/${threadId}`)
  return { ok: true, draftId: data.id }
}

export async function approveDraft(
  draftId: string,
  subject: string,
  body: string,
): Promise<{ ok: true; sendAfter: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()

  if (hasUnfilledBlanks(body)) {
    return { error: 'Fill in or remove every highlighted blank before sending.' }
  }
  if (!subject.trim() || !body.trim()) {
    return { error: 'A reply needs both a subject and a body.' }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const sendAfter = new Date(Date.now() + UNDO_WINDOW_SECONDS * 1000).toISOString()

  // Conditional: only a row still in 'draft' can be approved. Guards against
  // a double submit queueing the same reply twice. `status`, `approved_by`,
  // and `approved_at` are set together in this one UPDATE — never as
  // separate statements — so a queued row is never left without a record of
  // who approved it.
  const { data, error } = await supabase
    .from('inbox_drafts')
    .update({
      status: 'queued',
      subject,
      body_text: body,
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      send_after: sendAfter,
    })
    .eq('id', draftId)
    .eq('organization_id', org.id)
    .eq('status', 'draft')
    .select('id, thread_id')
    .maybeSingle()

  if (error) {
    console.error(`approveDraft: update failed: ${error.code} ${error.message}`)
    return { error: 'Could not queue the reply.' }
  }
  if (!data) {
    return { error: 'This draft is no longer awaiting approval.' }
  }

  try {
    await inngest.send({ name: 'mailbox/reply.queued', data: { draftId } })
  } catch (sendError) {
    // The row is already 'queued' but nothing will ever pick it up. Roll it
    // back to 'draft' so the reply is visibly un-sent rather than sitting in
    // a queue with no consumer — the failure mode Phase A hit when a lost
    // backfill event left an account 'pending' forever.
    console.error(
      `approveDraft: could not enqueue send for draft ${draftId}: ${sendError instanceof Error ? sendError.name : 'UnknownError'}`,
    )
    await supabase
      .from('inbox_drafts')
      .update({ status: 'draft', send_after: null, approved_at: null, approved_by: null })
      .eq('id', draftId)
      .eq('organization_id', org.id)
      .eq('status', 'queued')
    return { error: 'Could not schedule the send. The draft is still here — try again.' }
  }

  revalidatePath(`/inbox/${data.thread_id}`)
  return { ok: true, sendAfter }
}

export async function cancelDraft(draftId: string): Promise<{ ok: true } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  // Only a queued row can be cancelled. If the send job has already claimed
  // it ('sending'), this matches nothing and the user is told the truth
  // rather than shown a cancellation that did not happen.
  const { data, error } = await supabase
    .from('inbox_drafts')
    .update({ status: 'cancelled' })
    .eq('id', draftId)
    .eq('organization_id', org.id)
    .eq('status', 'queued')
    .select('id, thread_id')
    .maybeSingle()

  if (error) {
    console.error(`cancelDraft: update failed: ${error.code} ${error.message}`)
    return { error: 'Could not cancel the reply.' }
  }
  if (!data) {
    return { error: 'Too late — this reply has already been sent.' }
  }

  revalidatePath(`/inbox/${data.thread_id}`)
  return { ok: true }
}
