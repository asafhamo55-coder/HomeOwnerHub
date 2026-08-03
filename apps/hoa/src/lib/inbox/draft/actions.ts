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
import { getLatestDraft, getThreadDetail } from '@/lib/inbox/queries'
import { retrieveForThread } from './retrieve'
import { UNDO_WINDOW_SECONDS, hasUnfilledBlanks } from './blanks'
import { normalizeRecipients } from './recipients'
import { attachmentNameProblem, MAX_ATTACHMENT_BYTES } from './attachments'
import { buildForwardSubject, buildForwardBody } from './forward'

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
        // Tone samples, passed separately from `fragments` so they cannot be
        // cited — see retrieve.ts's `VoiceExample`.
        voiceExamples: retrieval.voiceExamples,
        degraded: retrieval.degraded,
        aiContext: retrieval.aiContext,
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
      console.error(`createDraft: citation validation failed for thread ${threadId}: ${errorName}`)
      return {
        error:
          'A reply was drafted, but a quotation in it could not be verified against the source document, so it was discarded rather than shown to you. This is usually temporary — trying again often works.',
      }
    }
    console.error(
      `createDraft: generation failed for thread ${threadId}: ${error instanceof Error ? error.name : 'UnknownError'}`,
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
    console.error(`createDraft: ai_runs lookup failed: ${runError.code} ${runError.message}`)
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
      `createDraft: last-inbound lookup failed: ${lastInboundError.code} ${lastInboundError.message}`,
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
    console.error(`createDraft: insert failed: ${error.code} ${error.message}`)
    return { error: 'Could not save the draft.' }
  }

  revalidatePath(`/inbox/${threadId}`)
  return { ok: true, draftId: data.id }
}

export async function approveDraft(
  draftId: string,
  input: { subject: string; body: string; to: string[]; cc: string[] },
): Promise<{ ok: true; sendAfter: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const { subject, body } = input

  // BOTH fields. The subject is as editable as the body and ships in the
  // same email, so a `[[BLANK: money]]` left in a subject line would reach
  // the resident in the most visible place there is. Checking only the body
  // (as this did) made the subject the one unguarded route past the gate.
  if (hasUnfilledBlanks(subject) || hasUnfilledBlanks(body)) {
    return { error: 'Fill in or remove every highlighted blank before sending.' }
  }
  if (!subject.trim() || !body.trim()) {
    return { error: 'A reply needs both a subject and a body.' }
  }

  // Recipients are validated BEFORE the status transition, so a rejected
  // address leaves the draft exactly as it was rather than half-queued.
  const recipients = normalizeRecipients(input.to, input.cc)
  if (!recipients.ok) return { error: recipients.error }

  const supabase = await getSupabaseServerClient()
  // `requireBoardOrAdmin()` only returns `{ role, org }` — it never exposes
  // the user id it resolved internally — so this second `auth.getUser()`
  // call is not redundant with the one above; it's the only way to get
  // `user.id` for `approved_by`. But per the convention in
  // `apps/hoa/src/lib/inbox/actions.ts` (assignThreadToProperty), a missing
  // user here must refuse outright rather than fall back to null: approval
  // is the one action in this feature whose entire purpose is attribution,
  // and a queued reply with no recorded approver defeats the audit trail
  // this file's own docstring exists to protect.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  // Re-checked server-side. The composer already refuses an over-budget
  // file, but that is an affordance: a stale tab, a concurrent second
  // window, or a direct action call could all reach here over the cap, and
  // Gmail would reject the whole send after the row was already 'queued'.
  const { data: attachmentRows, error: attachmentError } = await supabase
    .from('inbox_draft_attachments')
    .select('size_bytes')
    .eq('organization_id', org.id)
    .eq('draft_id', draftId)
  if (attachmentError) {
    console.error(
      `approveDraft: attachment size read failed: ${attachmentError.code} ${attachmentError.message}`,
    )
    return { error: 'Could not check the attachment size limit.' }
  }
  // Compared against the total, NOT against `remainingBudget(...) === 0` —
  // the budget is also exactly zero when attachments come to precisely the
  // cap, which is allowed.
  const totalBytes = (attachmentRows ?? []).reduce(
    (sum, row) => sum + Number(row.size_bytes),
    0,
  )
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    // Whole-MB, derived from the constant — the SAME approach
    // `checkAttachmentFits` already uses. `formatBytes` always keeps one
    // decimal ("15.0 MB"), and this message's wording is asserted on.
    const capMb = MAX_ATTACHMENT_BYTES / (1024 * 1024)
    return {
      error: `Attachments exceed the ${capMb} MB limit. Remove a file and try again.`,
    }
  }

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
      to_emails: recipients.to,
      cc_emails: recipients.cc,
      approved_by: user.id,
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

/**
 * A forward: the thread's latest message quoted below a blank opening, with
 * its files carried along, addressed to nobody yet.
 *
 * No AI call, deliberately. The reply drafter grounds a reply to a resident
 * in governing documents and property context; "can you quote this?" to a
 * landscaper has nothing to ground and no citations to validate. So
 * `citations`, `blanks`, and the ai_runs metadata stay empty — the human is
 * the author, and `grounded=false` here means "not applicable", which is
 * why the composer only renders the ungrounded banner for kind='reply'.
 */
export async function createForwardDraft(
  threadId: string,
): Promise<{ ok: true; draftId: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const thread = await getThreadDetail(supabase, org.id, threadId)
  if (!thread) return { error: 'That conversation no longer exists.' }

  // A forward must not displace a draft that is still live.
  //
  // The thread page renders exactly ONE draft — `getLatestDraft`, newest
  // first, with no status filter — so inserting a forward makes it the
  // rendered draft and whatever was there disappears from the UI. For a
  // 'queued' reply that is not cosmetic: `cancelDraft` has exactly one call
  // site, the countdown panel in DraftPanel, so replacing that panel removes
  // the only way to press Undo while the reply still sends. mailbox-send.ts
  // calls that failure unrepairable — "this one cannot be repaired
  // afterwards, because the resident already has the email". For a 'draft' it
  // silently shadows unsent work with no route back to it.
  //
  // Terminal statuses ('sent', 'failed', 'cancelled') must still allow a
  // forward: being able to forward a thread that has already been replied to
  // is the entire reason Forward moved into the thread header.
  //
  // Reuses `getLatestDraft` (org-scoped, same read the page makes) rather
  // than a second query that could drift from it. It THROWS on a query
  // failure by design, which must not become an unhandled server-action
  // rejection — and must not become "no draft, go ahead" either, since that
  // is precisely the state this guard exists to detect.
  let latest
  try {
    latest = await getLatestDraft(supabase, org.id, threadId)
  } catch (error) {
    console.error(
      `createForwardDraft: latest-draft check failed for thread ${threadId}: ${error instanceof Error ? error.name : 'UnknownError'}`,
    )
    return { error: 'Could not check this thread for an existing draft. Nothing was started.' }
  }
  if (latest && (latest.status === 'queued' || latest.status === 'sending')) {
    return {
      error:
        'A reply is being sent on this thread. Wait for it to finish, or press Undo, before starting a forward.',
    }
  }
  if (latest && latest.status === 'draft') {
    return {
      error: 'You have an unsent draft on this thread. Send or cancel it before starting a forward.',
    }
  }

  const {
    data: { user: creator },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('inbox_drafts')
    .insert({
      organization_id: org.id,
      thread_id: threadId,
      kind: 'forward',
      status: 'draft',
      created_by: creator?.id ?? null,
      subject: buildForwardSubject(thread.subject),
      body_text: buildForwardBody(thread.messages),
      // Addressed to nobody: choosing who receives a resident's message is
      // the whole decision a forward asks a board member to make, and
      // pre-filling it would invite sending to the wrong party by reflex.
      to_emails: [],
      cc_emails: [],
      // A forward is written by a human — there is nothing here for the
      // reply drafter's citation validator or blank-filler to have produced.
      citations: [],
      blanks: [],
      grounded: false,
      grounding_note: null,
    })
    .select('id')
    .single()

  if (error) {
    console.error(`createForwardDraft: insert failed: ${error.code} ${error.message}`)
    return { error: 'Could not start a forward.' }
  }

  // Carry the thread's files along. A forward without the photos of the
  // broken fence is half a forward — but losing them is a convenience
  // failure, not a correctness one, so it never discards the draft. The
  // human can re-attach from the picker.
  const storedFiles = thread.messages.flatMap((message) =>
    message.attachments.filter((file) => file.fetchStatus === 'stored'),
  )
  if (storedFiles.length > 0) {
    const { data: sourceRows, error: sourceError } = await supabase
      .from('inbox_attachments')
      .select('id, storage_path, file_name, content_type, size_bytes')
      .eq('organization_id', org.id)
      .in(
        'id',
        storedFiles.map((file) => file.id),
      )

    if (sourceError) {
      console.error(
        `createForwardDraft: attachment read failed: ${sourceError.code} ${sourceError.message}`,
      )
    } else if (sourceRows && sourceRows.length > 0) {
      const usable = sourceRows.filter(
        (row): row is typeof row & { storage_path: string } => Boolean(row.storage_path),
      )
      // A resident-supplied filename carrying a quote or a line break cannot
      // go in a MIME header, and letting one through here would fail the
      // whole send later with a misleading "may already have reached the
      // resident" warning (see attachmentNameProblem). Skip just that file —
      // failing the entire forward over one badly-named photo would be the
      // worse trade, and the human can still attach the rest from the picker.
      // Log the COUNT only: the name is untrusted resident content.
      const attachable = usable.filter((row) => attachmentNameProblem(row.file_name) === null)
      const skipped = usable.length - attachable.length
      if (skipped > 0) {
        console.error(
          `createForwardDraft: skipped ${skipped} auto-attachment(s) whose file name cannot go in an email header`,
        )
      }

      if (attachable.length > 0) {
        const { error: copyError } = await supabase.from('inbox_draft_attachments').insert(
          attachable.map((row) => ({
            organization_id: org.id,
            draft_id: data.id,
            source: 'inbox' as const,
            storage_path: row.storage_path,
            file_name: row.file_name,
            content_type: row.content_type,
            size_bytes: Number(row.size_bytes ?? 0),
          })),
        )
        if (copyError) {
          console.error(
            `createForwardDraft: attachment copy failed: ${copyError.code} ${copyError.message}`,
          )
        }
      }
    }
  }

  revalidatePath(`/inbox/${threadId}`)
  return { ok: true, draftId: data.id }
}

/**
 * A message that starts a new conversation.
 *
 * Deliberately does NOT create a placeholder inbox_threads row.
 * `inbox_threads.gmail_thread_id` is NOT NULL under a unique index, so a
 * placeholder would need a fake id plus a merge-on-conflict path when Gmail
 * returns a real thread id that already exists. Instead the message is sent
 * with no threadId and the ordinary sync ingests it into a real thread. The
 * cost is that the conversation takes up to one sync cycle to appear in the
 * inbox list, which the compose screen states plainly.
 */
export async function createComposeDraft(
  mailboxAccountId: string,
): Promise<{ ok: true; draftId: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  // Scoped to the org and to a LIVE connection: a disconnected mailbox would
  // fail at send time, after the human wrote the whole message.
  const { data: account, error: accountError } = await supabase
    .from('mailbox_accounts')
    .select('id, disconnected_at')
    .eq('id', mailboxAccountId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (accountError) {
    console.error(`createComposeDraft: account read failed: ${accountError.code} ${accountError.message}`)
    return { error: 'Could not load your mailbox.' }
  }
  if (!account || account.disconnected_at) {
    return { error: 'That mailbox is not connected.' }
  }

  const {
    data: { user: creator },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('inbox_drafts')
    .insert({
      organization_id: org.id,
      thread_id: null,
      mailbox_account_id: mailboxAccountId,
      kind: 'new',
      status: 'draft',
      created_by: creator?.id ?? null,
      subject: '',
      body_text: '',
      to_emails: [],
      cc_emails: [],
    })
    .select('id')
    .single()

  if (error) {
    console.error(`createComposeDraft: insert failed: ${error.code} ${error.message}`)
    return { error: 'Could not start a new message.' }
  }

  return { ok: true, draftId: data.id }
}
