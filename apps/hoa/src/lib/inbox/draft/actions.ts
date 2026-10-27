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

import { checkOrgOwned } from '@/lib/org-owned'
import { revalidatePath } from 'next/cache'
import { inngest } from '@homeowner-portal/jobs'
import {
  composeVendorRequest,
  type VendorRequestIntent,
} from '@homeowner-portal/workflows'
import { resolveModel } from '@homeowner-portal/ai'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getLatestDraft, getThreadDetail } from '@/lib/inbox/queries'
import { chargeAiActionQuota } from '@/lib/api/ai-action-quota'
import { generateReplyDraft } from './generate-reply'
import { retrieveForVendorRequest } from './vendor-request-retrieve'
import { buildVendorRequestBody } from './vendor-request-body'
import { UNDO_WINDOW_SECONDS, hasUnfilledBlanks } from './blanks'
import { normalizeRecipients } from './recipients'
import { attachmentNameProblem, MAX_ATTACHMENT_BYTES } from './attachments'
import { buildForwardSubject, buildForwardBody } from './forward'
import { addDraftAttachment } from './attachment-actions'
import { setThreadStatus } from '@/lib/inbox/actions'
import { computeDraftMetrics } from './metrics'
import { recordDraftMetrics } from './metrics-store'

/**
 * The inbox's manual "Draft a reply" button.
 *
 * BL-112: draws on the `board_ai` bucket before the model call. Not
 * `inbox_autodraft`: that bucket is the AUTOMATIC draft-on-open, stops at
 * the resident/automatic spend tier, and its 429 tells the board "You can
 * still select Draft a reply" — the button must stay usable when it is
 * exhausted. A click is a board-initiated AI draft of the same size as the
 * other board drafts (~$0.0009), which is exactly what `board_ai` meters
 * (shared board AI pool; limits unchanged).
 */
export async function createDraft(
  threadId: string,
): Promise<{ ok: true; draftId: string } | { error: string; rateLimited?: true }> {
  const { org } = await requireBoardOrAdmin()
  const quota = await chargeAiActionQuota('board_ai', org.id)
  if (!quota.ok) return { error: quota.error, ...(quota.rateLimited ? { rateLimited: true as const } : {}) }
  return generateReplyDraft(threadId)
}

/**
 * Drafts a work order to a vendor from a resident's thread (W34).
 *
 * The resulting row is threadless — `thread_id` NULL, `mailbox_account_id`
 * set — so the request starts its OWN Gmail conversation. That is the whole
 * point: the resident is a party to their own thread, and a board member
 * hitting reply-all on a vendor's pricing there would send it to the owner.
 * The `inbox_drafts_thread_or_account` CHECK (migration 0042) enforces the
 * shape; `isThreadless` in mailbox-send.ts is the send-side half.
 *
 * `source_thread_id` is what ties the two conversations back together. Both
 * link directions resolve from it — see the spec's D5.
 *
 * Never log an email address, subject, body, or file name.
 */
export async function draftVendorRequest(input: {
  threadId: string
  intent: VendorRequestIntent
  freeTextInstruction: string | null
  neededBy: string | null
  toEmails: string[]
}): Promise<
  { ok: true; draftId: string; skippedAttachments: string[] } | { error: string }
> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  // Same validation the approve path uses — syntax, CR/LF, dedup, the
  // 25-recipient cap. Run BEFORE the model call so a typo costs nothing.
  const recipients = normalizeRecipients(input.toEmails, [])
  if (!recipients.ok) return { error: recipients.error }

  // BL-112: board-initiated AI draft → `board_ai` (limits unchanged).
  // Drawn BEFORE retrieval, because retrieval itself may make the vision
  // call that reads the thread's photos (photo-findings.ts).
  const quota = await chargeAiActionQuota('board_ai', org.id)
  if (!quota.ok) return { error: quota.error }

  let retrieval
  try {
    retrieval = await retrieveForVendorRequest(supabase, org.id, input.threadId)
  } catch (error) {
    console.error(
      `draftVendorRequest: retrieval failed for thread ${input.threadId}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return { error: 'Could not gather context for this thread. Nothing was drafted.' }
  }

  // Null means the thread is not in this org (or does not exist). Same
  // response either way — telling the two apart would confirm the existence
  // of another tenant's thread id.
  if (!retrieval) return { error: 'Thread not found.' }

  // Without a mailbox there is nothing to send from, and unlike a reply
  // there is no thread to fall back to at send time. Refuse before spending
  // a model call.
  if (!retrieval.mailboxAccountId) {
    return { error: 'This conversation has no mailbox to send from.' }
  }

  let generated
  try {
    generated = await composeVendorRequest(
      {
        intent: input.intent,
        freeTextInstruction: input.freeTextInstruction,
        neededBy: input.neededBy,
        threadSubject: retrieval.threadSubject,
        messages: retrieval.messages,
        property: retrieval.property,
        vendor: retrieval.vendor,
        attachmentText: retrieval.attachmentText,
        photoFindings: retrieval.photoFindings,
        degraded: retrieval.degraded,
      },
      { organizationId: org.id },
    )
  } catch (error) {
    console.error(
      `draftVendorRequest: W34 failed for thread ${input.threadId}: ${error instanceof Error ? error.name : 'UnknownError'}`,
    )
    return { error: 'Could not draft this request. Try again.' }
  }

  const {
    data: { user: creator },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('inbox_drafts')
    .insert({
      organization_id: org.id,
      // Threadless by design — see this function's docstring.
      thread_id: null,
      mailbox_account_id: retrieval.mailboxAccountId,
      source_thread_id: input.threadId,
      status: 'draft',
      kind: 'vendor_request',
      request_intent: input.intent,
      vendor_id: retrieval.vendorId,
      to_emails: recipients.to,
      cc_emails: [],
      created_by: creator?.id ?? null,
      subject: generated.subject,
      body_text: buildVendorRequestBody(generated, `— ${org.name} Board`),
      // Empty, not omitted. A vendor email has nothing citable in it (spec
      // D7); `attachmentDigest` is rendered into the body as the review aid
      // instead. An absent column here would read as "citations were lost".
      citations: [],
      blanks: generated.blanks,
      grounded: true,
      grounding_note: null,
      ai_run_id: generated.runId,
      model: resolveModel(),
      prompt_version: null,
    })
    .select('id')
    .single()

  if (error) {
    console.error(`draftVendorRequest: insert failed: ${error.code} ${error.message}`)
    return { error: 'Could not save the draft.' }
  }

  // Attach the thread's stored inbound files, smallest first so a single
  // oversized scan cannot crowd out three small ones that would all have
  // fit. Whatever does not fit is REPORTED, never silently dropped — the
  // board member has to know the vendor is not getting the photo.
  const skippedAttachments: string[] = []
  for (const attachment of [...retrieval.attachments].sort((a, b) => a.sizeBytes - b.sizeBytes)) {
    const result = await addDraftAttachment(data.id, 'inbox', attachment.id)
    if ('error' in result) skippedAttachments.push(attachment.fileName)
  }

  revalidatePath(`/inbox/${input.threadId}`)
  return { ok: true, draftId: data.id, skippedAttachments }
}

export async function approveDraft(
  draftId: string,
  input: { subject: string; body: string; to: string[]; cc: string[] },
  /**
   * BL-101 A3. `closeThread`: "Approve and send" closes the thread once the
   * reply is queued (the default in the composer); "Approve, keep open"
   * passes false. Omitted means false, so every other caller (compose,
   * forward, vendor request) behaves exactly as before.
   */
  options: { closeThread?: boolean } = {},
): Promise<{ ok: true; sendAfter: string; threadClosed: boolean } | { error: string }> {
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

  // Tenant isolation: the draft's thread and mailbox account must belong to
  // the caller's org BEFORE anything is queued. The send job re-checks, but
  // refusing here keeps a poisoned draft from ever reaching the queue.
  const { data: link, error: linkError } = await supabase
    .from('inbox_drafts')
    .select('thread_id, mailbox_account_id')
    .eq('id', draftId)
    .eq('organization_id', org.id)
    .eq('status', 'draft')
    .maybeSingle()
  if (linkError) {
    console.error(`approveDraft: link read failed: ${linkError.code}`)
    return { error: 'Could not queue the reply.' }
  }
  if (!link) return { error: 'This draft is no longer awaiting approval.' }
  const linked: Array<[string, string | null]> = [
    ['inbox_threads', link.thread_id],
    ['mailbox_accounts', link.mailbox_account_id],
  ]
  for (const [table, id] of linked) {
    if (!id) continue
    if ((await checkOrgOwned(table, id, org.id)) !== 'owned') {
      console.error(`approveDraft: draft ${draftId} links ${table} outside org ${org.id}`)
      return { error: 'Could not queue the reply.' }
    }
  }

  // BL-101 A10: the generated text is about to be overwritten by the
  // approved text, so snapshot it first. Measurement only — a failed read
  // costs one metrics row, never the approval.
  const generatedDraft = await readGeneratedDraft(supabase, org.id, draftId)

  const approvedAt = new Date()
  const sendAfter = new Date(approvedAt.getTime() + UNDO_WINDOW_SECONDS * 1000).toISOString()

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
      approved_at: approvedAt.toISOString(),
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

  if (generatedDraft) {
    await recordDraftMetrics(supabase, {
      orgId: org.id,
      userId: user.id,
      metrics: computeDraftMetrics({
        draftId,
        threadId: data.thread_id,
        aiRunId: generatedDraft.ai_run_id,
        draftSubject: generatedDraft.subject,
        draftBody: generatedDraft.body_text,
        sentSubject: subject,
        sentBody: body,
        citations: generatedDraft.citations,
        createdAt: generatedDraft.created_at,
        approvedAt,
      }),
    })
  }

  const threadClosed = data.thread_id
    ? await afterApproveThreadEffects(supabase, org.id, data.thread_id, user.id, options.closeThread === true)
    : false

  revalidatePath(`/inbox/${data.thread_id}`)
  return { ok: true, sendAfter, threadClosed }
}

/**
 * What an approved reply does to its THREAD (BL-101 A3 + A6). Runs after
 * the reply is queued and never un-queues it: both effects are
 * conveniences on top of a reply that is already on its way, so a failure
 * is logged by code and the approve still succeeds.
 *
 *   1. Replying to an unassigned thread assigns it to the replier (the
 *      Front pattern). Conditional on `assigned_to IS NULL`, so it never
 *      takes a thread from someone it was given to.
 *   2. `closeThread` closes it through the existing `setThreadStatus`. If
 *      the resident writes back, ingest reopens it (reopensClosedThread).
 *
 * Returns whether the thread is now closed, so the composer knows to move
 * on to the next thread.
 */
async function afterApproveThreadEffects(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  orgId: string,
  threadId: string,
  userId: string,
  closeThread: boolean,
): Promise<boolean> {
  try {
    const { error: assignError } = await supabase
      .from('inbox_threads')
      .update({ assigned_to: userId })
      .eq('id', threadId)
      .eq('organization_id', orgId)
      .is('assigned_to', null)
    if (assignError) {
      console.error(`approveDraft: auto-assign failed for thread ${threadId}: ${assignError.code}`)
    }
  } catch (error) {
    console.error(
      `approveDraft: auto-assign threw for thread ${threadId}: ${error instanceof Error ? error.name : 'UnknownError'}`,
    )
  }

  if (!closeThread) return false
  const form = new FormData()
  form.set('threadId', threadId)
  form.set('status', 'closed')
  const closed = await setThreadStatus({}, form)
  if (closed.error) {
    console.error(`approveDraft: closing thread ${threadId} failed after queueing`)
    return false
  }
  return true
}

/**
 * BL-101 A10: the AI-generated subject/body/citations of a reply draft as
 * it stands before approval, or null when it is not a measurable AI reply
 * (a forward, compose or vendor request, no ai_run_id) or the read failed.
 * Never throws and never logs anything but the draft id and a code.
 */
async function readGeneratedDraft(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  orgId: string,
  draftId: string,
): Promise<{
  subject: string
  body_text: string
  citations: unknown
  created_at: string
  ai_run_id: string | null
} | null> {
  try {
    const { data, error } = await supabase
      .from('inbox_drafts')
      .select('kind, status, subject, body_text, citations, created_at, ai_run_id')
      .eq('id', draftId)
      .eq('organization_id', orgId)
      .maybeSingle()
    if (error) {
      console.error(`approveDraft: metrics snapshot read failed for draft ${draftId}: ${error.code}`)
      return null
    }
    if (!data || data.kind !== 'reply' || data.status !== 'draft' || !data.ai_run_id) return null
    if (typeof data.body_text !== 'string' || typeof data.subject !== 'string') return null
    return data
  } catch (error) {
    console.error(
      `approveDraft: metrics snapshot threw for draft ${draftId}: ${error instanceof Error ? error.name : 'UnknownError'}`,
    )
    return null
  }
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

  // An undone reply means the resident is still unanswered, so a thread
  // that "Approve and send" just closed goes back into the queue (BL-101
  // A3). Conditional on 'closed'; any other status is left alone. Not
  // fatal: the cancel itself already happened.
  if (data.thread_id) {
    const { error: reopenError } = await supabase
      .from('inbox_threads')
      .update({ status: 'needs_review' })
      .eq('id', data.thread_id)
      .eq('organization_id', org.id)
      .eq('status', 'closed')
    if (reopenError) {
      console.error(`cancelDraft: reopen failed for thread ${data.thread_id}: ${reopenError.code}`)
    }
    revalidatePath('/inbox')
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
