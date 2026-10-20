/**
 * BL-112: the reply-draft generation behind the inbox's "Draft a reply"
 * (createDraft, actions.ts) and draft-on-open (autoDraftOnOpen,
 * autodraft-actions.ts). Moved out of the 'use server' module so each
 * caller draws on its OWN AI bucket first — `board_ai` for the button,
 * `inbox_autodraft` for draft-on-open — and this unmetered core is never
 * itself a callable server action (every export of a 'use server' file
 * is one, so it cannot live there).
 *
 * Do not call it from anywhere that has not already drawn on a bucket.
 *
 * Never log an email address, subject, or body — ids and error names only.
 */

import { revalidatePath } from 'next/cache'
import { draftReply, InvalidCitationError, UnsupportedQuoteError } from '@homeowner-portal/workflows'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { retrieveForThread } from './retrieve'

export async function generateReplyDraft(
  threadId: string,
): Promise<{ ok: true; draftId: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  let retrieval
  try {
    retrieval = await retrieveForThread(supabase, org.id, threadId)
  } catch (error) {
    console.error(
      `generateReplyDraft: retrieval failed for thread ${threadId}: ${error instanceof Error ? error.message : String(error)}`,
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
        // Tone samples, passed separately from `fragments` so they cannot be
        // cited — see retrieve.ts's `VoiceExample`.
        voiceExamples: retrieval.voiceExamples,
        degraded: retrieval.degraded,
        aiContext: retrieval.aiContext,
        // BL-101 A2: why account facts were withheld, if they were.
        accountNote: retrieval.accountNote,
        // BL-101 A8: the verified sender's attachment excerpts — untrusted,
        // uncitable, fenced by W32's prompt (rule 7). Empty when withheld.
        attachmentContext: retrieval.attachmentContext,
      },
      { organizationId: org.id },
    )
  } catch (error) {
    // A rejected draft is not persisted. Showing a partial draft that failed
    // citation validation would put invented references in front of a
    // reviewer, which is the exact failure the validator exists to prevent.
    //
    // `draftReply` -> `replyDrafter.execute` -> `defineWorkflow`'s wrapper
    // (packages/ai/src/workflow.ts) catches whatever W32's run() throws,
    // logs it to ai_runs, and re-throws a plain `Error` so a workflow
    // failure always looks the same at the call site regardless of which
    // workflow or model error caused it. That wrapper attaches the original
    // error as `.cause` (standard `Error` option), so it must be checked
    // here too — W32 already retries once internally (see
    // W32-reply-drafter/index.ts) before ever throwing, so by the time this
    // branch sees InvalidCitationError/UnsupportedQuoteError — directly or
    // via `.cause` — both attempts failed and there is nothing left to show.
    const cause = error instanceof Error ? error.cause : undefined
    if (
      error instanceof InvalidCitationError ||
      error instanceof UnsupportedQuoteError ||
      cause instanceof InvalidCitationError ||
      cause instanceof UnsupportedQuoteError
    ) {
      // Prefer the real InvalidCitationError/UnsupportedQuoteError's own name
      // when it's only reachable via `.cause` — logging the outer wrapper's
      // generic "Error" there would defeat the point of checking `.cause` at
      // all for anyone reading the logs.
      const errorName =
        error instanceof InvalidCitationError || error instanceof UnsupportedQuoteError
          ? error.name
          : cause instanceof Error
            ? cause.name
            : 'UnknownError'
      console.error(`generateReplyDraft: citation validation failed for thread ${threadId}: ${errorName}`)
      return {
        error:
          'A reply was drafted, but a quotation in it could not be verified against the source document, so it was discarded rather than shown to you. This is usually temporary — trying again often works.',
      }
    }
    console.error(
      `generateReplyDraft: generation failed for thread ${threadId}: ${error instanceof Error ? error.name : 'UnknownError'}`,
    )
    return { error: 'Could not draft a reply right now.' }
  }

  // `model` and `prompt_version` are denormalised from the ai_runs row for
  // cheap display (no join needed to show "which model/prompt produced
  // this draft"). Read them off the ai_runs row itself rather than off
  // `replyDrafter`'s static `defaultModel` — W32's run() calls
  // `api.setModel(completion.model)` with whatever the provider actually
  // answered with, which persistRun writes to ai_runs.model and which can
  // differ from the model that was requested. Sourcing from the same row
  // draftReply just wrote keeps this a single source of truth instead of a
  // second, potentially-wrong claim. A lookup failure here is a display
  // nicety, not a correctness issue — log it and still save the draft with
  // both columns null rather than discard a valid, already-validated draft.
  let model: string | null = null
  let promptVersion: string | null = null
  const { data: runRow, error: runError } = await supabase
    .from('ai_runs')
    .select('model, prompt_version')
    .eq('id', generated.runId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (runError) {
    console.error(`generateReplyDraft: ai_runs lookup failed: ${runError.code} ${runError.message}`)
  } else if (runRow) {
    model = runRow.model
    promptVersion = runRow.prompt_version
  }

  // Resolved here, not at send time. The job used to look up the last
  // inbound message when it ran, which meant a new message arriving during
  // the 30-second undo window could silently redirect the reply to a
  // different address than the approver saw. A lookup failure is not fatal:
  // the row is saved with an empty To and the composer requires the human to
  // supply one before Approve enables.
  let defaultTo: string[] = []
  const { data: lastInbound, error: lastInboundError } = await supabase
    .from('inbox_messages')
    .select('from_email')
    .eq('organization_id', org.id)
    .eq('thread_id', threadId)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastInboundError) {
    console.error(
      `generateReplyDraft: last-inbound lookup failed: ${lastInboundError.code} ${lastInboundError.message}`,
    )
  } else if (lastInbound?.from_email) {
    defaultTo = [lastInbound.from_email]
  }

  // `created_by` was declared in migration 0035 but never populated, so
  // every draft recorded who approved it and nothing about who asked for
  // it. `requireBoardOrAdmin()` returns only `{ role, org }`, so the user id
  // has to come from a separate `auth.getUser()` — same reason as
  // approveDraft's second call below.
  //
  // Unlike approveDraft, a missing user here does NOT refuse. Approval is
  // the attributable act — a queued reply with no approver defeats the audit
  // trail — whereas generating a draft ships nothing to anyone, and losing
  // an already-validated draft over an authorship footnote is the worse
  // trade. The column is nullable for exactly this case.
  const {
    data: { user: creator },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('inbox_drafts')
    .insert({
      organization_id: org.id,
      thread_id: threadId,
      status: 'draft',
      kind: 'reply',
      to_emails: defaultTo,
      cc_emails: [],
      created_by: creator?.id ?? null,
      subject: generated.subject,
      body_text: generated.body,
      citations: generated.citations,
      blanks: generated.blanks,
      grounded: generated.grounded,
      grounding_note: generated.groundingNote,
      ai_run_id: generated.runId,
      model,
      prompt_version: promptVersion,
    })
    .select('id')
    .single()

  if (error) {
    console.error(`generateReplyDraft: insert failed: ${error.code} ${error.message}`)
    return { error: 'Could not save the draft.' }
  }

  revalidatePath(`/inbox/${threadId}`)
  return { ok: true, draftId: data.id }
}
