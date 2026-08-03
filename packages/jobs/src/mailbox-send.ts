import { createAdminClient } from '@homeowner-portal/db'
import {
  buildMimeMessage,
  sendReply,
  MailboxAuthError,
  type OutboundAttachment,
} from '@homeowner-portal/mailbox'
import { inngest } from './client'
import { getAccessTokenFor, markAuthFailed } from './mailbox-tokens'
import { logDbError } from './db-error'

type Db = ReturnType<typeof createAdminClient>

const BUCKET = 'hoa-documents'

/**
 * Minimal structural subset of Inngest's step tools this job needs.
 * `step.run` / `step.sleepUntil` throw when invoked outside a real Inngest
 * execution context (see InngestStepTools.d.ts), so the core logic below is
 * factored out to take `step` as a plain parameter — a test can then hand it
 * a fake (`run` just invokes its callback, `sleepUntil` resolves
 * immediately) without spinning up Inngest. The real `step` object passed by
 * `mailboxSendJob` satisfies this structurally.
 */
export interface MailboxSendStep {
  sleepUntil(id: string, time: Date): Promise<void>
  // Narrowed to the one payload this job ever passes through `step.run`
  // (the claim's boolean outcome), rather than generic over `T`: Inngest's
  // real `run` return type passes through `Jsonify<Awaited<T>>`, which is
  // not assignable back to an arbitrary `T` and fails structural typing
  // when this interface is generic. A boolean survives that round trip
  // unchanged, so this stays precise without fighting the real type.
  run(id: string, fn: () => Promise<boolean>): Promise<boolean>
}

export interface MailboxSendLogger {
  info(message: string): void
  error(message: string): void
}

export type MailboxSendResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: string }

/**
 * Read every attached file's bytes out of storage.
 *
 * Called BEFORE sendToGmail, deliberately. A missing or unreadable object
 * must fail the draft while nothing has been transmitted — attachments
 * reference live storage paths rather than copies, so a file deleted between
 * attach and send is a real and expected case. Sending the message without
 * the file the approver reviewed would be worse than not sending it.
 *
 * Never log a file name — only the opaque attachment count and draft id.
 */
async function loadAttachments(
  db: Db,
  orgId: string,
  draftId: string,
): Promise<OutboundAttachment[]> {
  const { data, error } = await db
    .from('inbox_draft_attachments')
    .select('storage_path, file_name, content_type, size_bytes')
    .eq('organization_id', orgId)
    .eq('draft_id', draftId)
    .order('created_at', { ascending: true })

  if (error) {
    logDbError('mailboxSendJob', 'inbox_draft_attachments', { draftId }, error)
    throw new Error(`mailboxSendJob: could not load attachments: ${error.message}`)
  }

  const files: OutboundAttachment[] = []
  for (const row of data ?? []) {
    const { data: blob, error: downloadError } = await db.storage
      .from(BUCKET)
      .download(row.storage_path)
    if (downloadError || !blob) {
      throw new Error(
        `mailboxSendJob: attachment could not be read from storage: ${downloadError?.message ?? 'no data'}`,
      )
    }
    files.push({
      fileName: row.file_name,
      contentType: row.content_type,
      bytes: Buffer.from(await blob.arrayBuffer()),
    })
  }
  return files
}

/**
 * Send an approved reply once its undo window has elapsed.
 *
 * The claim is a CONDITIONAL update, not a read-then-decide. If a board
 * member pressed Undo while this function slept, the update matches zero
 * rows and the job stops. Reading the status and then updating would leave a
 * window in which a cancelled reply is still sent — and unlike the analogous
 * race the Phase A review found in applyMatch, this one cannot be repaired
 * afterwards, because the resident already has the email.
 *
 * `cancelDraft` (apps/hoa/src/lib/inbox/draft/actions.ts) guards
 * symmetrically on `.eq('status', 'queued')`, so whichever operation wins
 * the race, the other matches zero rows and backs off.
 *
 * Never log an email address, subject, or body — every log line below uses
 * only the opaque draftId/messageId.
 */
export async function runMailboxSend(
  db: Db,
  step: MailboxSendStep,
  logger: MailboxSendLogger,
  draftId: string,
): Promise<MailboxSendResult> {
  const { data: draft, error: draftError } = await db
    .from('inbox_drafts')
    .select(
      'id, organization_id, thread_id, subject, body_text, send_after, status, kind, to_emails, cc_emails, mailbox_account_id',
    )
    .eq('id', draftId)
    .maybeSingle()

  if (draftError) {
    logDbError('mailboxSendJob', 'inbox_drafts', { draftId }, draftError)
    throw new Error(`mailboxSendJob: failed to load draft: ${draftError.message}`)
  }
  if (!draft) throw new Error(`mailboxSendJob: draft ${draftId} not found`)

  // 'sending' must pass this guard, and that is not a widening of it.
  //
  // Inngest memoizes each step result and RE-INVOKES this function from the
  // top; only code inside a step is skipped on replay. The read above is not
  // in a step, so it re-runs every invocation — and the invocation right
  // after `step.run('claim')` reads back the row THIS RUN just flipped to
  // 'sending'. Rejecting 'sending' here therefore made the job return
  // `{sent:false}` before reaching its own memoized claim, so the reply was
  // never sent, nothing threw, no `fail()` ran, and the row sat at 'sending'
  // until the watchdog closed it out with STUCK_SEND_REASON — which tells a
  // board "we cannot tell whether it was delivered" about a message that
  // provably never left. No draft ever reached 'sent'.
  //
  // Exclusivity does NOT come from this guard; it comes from the conditional
  // claim below (`.eq('status','queued')`), which is the sole arbiter. A
  // DIFFERENT run reaching here while this one holds the row still gets
  // zero matched rows from its own claim and backs off — unchanged. So the
  // only statuses that may short-circuit are the terminal ones this run
  // cannot have produced.
  if (draft.status !== 'queued' && draft.status !== 'sending') {
    return { sent: false, reason: draft.status }
  }

  if (draft.send_after) await step.sleepUntil('undo-window', new Date(draft.send_after))

  // Atomic claim. Zero rows means cancelled (or already claimed).
  const claimed = await step.run('claim', async () => {
    const { data, error } = await db
      .from('inbox_drafts')
      .update({ status: 'sending' })
      .eq('id', draftId)
      .eq('status', 'queued')
      .select('id')
      .maybeSingle()

    if (error) {
      logDbError('mailboxSendJob', 'inbox_drafts', { draftId }, error)
      throw new Error(`mailboxSendJob: claim failed: ${error.message}`)
    }
    return Boolean(data)
  })

  if (!claimed) {
    logger.info(`[mailbox-send] ${draftId} was cancelled before its window elapsed`)
    return { sent: false, reason: 'cancelled' }
  }

  // A kind='new' draft has no thread to read: it is sent with no Gmail
  // threadId, and the ordinary 2-minute sync ingests the sent message into a
  // real thread through the normal path — the same reasoning recorded at the
  // bottom of this file for sent replies. So there is nothing to look up,
  // and the mailbox comes off the draft row instead.
  let accountId: string
  let gmailThreadId: string | null = null
  let last: { rfc822_message_id: string | null; from_email: string | null } = {
    rfc822_message_id: null,
    from_email: null,
  }

  if (draft.kind === 'new') {
    if (!draft.mailbox_account_id) {
      await fail(db, draftId, 'This message has no mailbox to send from.')
      return { sent: false, reason: 'no_account' }
    }
    accountId = draft.mailbox_account_id
  } else {
    // Guaranteed by the `inbox_drafts_thread_or_account` CHECK constraint
    // (migration 0038): any kind other than 'new' has a non-null thread_id.
    // database.types.ts types the column `string | null` because 'new' rows
    // are nullable, so this narrows for TS as well as catching a row that
    // somehow violated the constraint.
    if (!draft.thread_id) {
      await fail(db, draftId, 'This message has no thread to send to.')
      throw new Error(`mailboxSendJob: draft ${draftId} has kind='${draft.kind}' but no thread_id`)
    }
    const threadId = draft.thread_id

    const { data: thread, error: threadError } = await db
      .from('inbox_threads')
      .select('gmail_thread_id, mailbox_account_id')
      .eq('id', threadId)
      .maybeSingle()

    if (threadError || !thread) {
      await fail(db, draftId, threadError?.message ?? 'thread not found')
      throw new Error(`mailboxSendJob: could not load thread for ${draftId}`)
    }
    accountId = thread.mailbox_account_id
    gmailThreadId = thread.gmail_thread_id

    // Reply to the most recent inbound message so threading is correct.
    const { data: lastRow, error: lastError } = await db
      .from('inbox_messages')
      .select('rfc822_message_id, from_email')
      .eq('thread_id', threadId)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastError) {
      logDbError('mailboxSendJob', 'inbox_messages', { draftId }, lastError)
      await fail(db, draftId, lastError.message)
      throw new Error(`mailboxSendJob: could not load last inbound message: ${lastError.message}`)
    }
    if (lastRow) last = lastRow
  }

  const { data: account, error: accountError } = await db
    .from('mailbox_accounts')
    .select('email_address, disconnected_at')
    .eq('id', accountId)
    .maybeSingle()

  if (accountError || !account) {
    await fail(db, draftId, accountError?.message ?? 'mailbox account not found')
    throw new Error(`mailboxSendJob: could not load account for ${draftId}`)
  }
  if (account.disconnected_at) {
    await fail(db, draftId, 'The mailbox was disconnected before this reply was sent.')
    return { sent: false, reason: 'disconnected' }
  }

  // Recipients come from the ROW, resolved when a human approved it.
  //
  // The empty-array fallback covers drafts queued before migration 0038,
  // which have no recipients stored. It reproduces the old behaviour exactly
  // and can be deleted once no such row remains queued.
  const to = draft.to_emails?.length ? draft.to_emails : last?.from_email ? [last.from_email] : []
  if (to.length === 0) {
    await fail(db, draftId, 'No recipient for this reply.')
    return { sent: false, reason: 'no_recipient' }
  }

  // Before sendToGmail, so a storage failure marks the draft failed while
  // nothing has been sent. Inside sendToGmail this would be unsafe.
  let attachments: OutboundAttachment[]
  try {
    attachments = await loadAttachments(db, draft.organization_id, draftId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await fail(db, draftId, 'A file attached to this reply is no longer available.')
    throw new Error(`mailboxSendJob: attachment load failed for ${draftId}: ${message}`)
  }

  // `sendToGmail`'s try/catch is the ONLY code path in this job allowed to
  // call `fail()`, and its try block's body is the entire function — it has
  // no statement after `sendReply` to widen into, by construction, because
  // the function returns the instant `sendReply` resolves. Once this call
  // returns, Gmail has accepted the message and no subsequent failure of any
  // kind may ever mark the draft 'failed' again. `recordSent`, below, is
  // deliberately a separate function with its own try/catch that only logs —
  // it has no `fail()` call in it to begin with, so a later editor extending
  // the *bookkeeping* update still can't reach `fail()` without visibly
  // adding a new import/call where the surrounding code and this comment
  // make the invariant obvious.
  const sent = await sendToGmail(
    db,
    draftId,
    { gmailThreadId, accountId },
    account,
    draft,
    to,
    attachments,
    { rfc822_message_id: last?.rfc822_message_id ?? null },
  )

  await recordSent(db, logger, draftId, sent)
  return { sent: true, messageId: sent.messageId }
}

async function sendToGmail(
  db: Db,
  draftId: string,
  target: { gmailThreadId: string | null; accountId: string },
  account: { email_address: string },
  draft: { subject: string; body_text: string; cc_emails: string[] | null },
  to: string[],
  attachments: OutboundAttachment[],
  last: { rfc822_message_id: string | null },
): Promise<{ messageId: string }> {
  try {
    const accessToken = await getAccessTokenFor(db, target.accountId)
    const mime = buildMimeMessage({
      from: account.email_address,
      to,
      cc: draft.cc_emails ?? [],
      subject: draft.subject,
      body: draft.body_text,
      inReplyTo: last.rfc822_message_id,
      references: last.rfc822_message_id ? [last.rfc822_message_id] : [],
      attachments,
    })
    return await sendReply(accessToken, target.gmailThreadId, mime)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await fail(db, draftId, message)
    if (error instanceof MailboxAuthError) {
      await markAuthFailed(db, target.accountId, message)
    }
    throw error
  }
}

/**
 * Post-send bookkeeping only. Gmail has already accepted the message by the
 * time this runs, so this function must never mark the draft 'failed' — a
 * human seeing 'failed' would resend, and the resident would get the reply
 * twice. That holds whether the update call rejects with a returned
 * PostgrestError (handled below) or throws outright (an unexpected
 * `undefined` destructure, a client exception) — both are caught here and
 * only logged, never routed to `fail()`.
 */
async function recordSent(
  db: Db,
  logger: MailboxSendLogger,
  draftId: string,
  sent: { messageId: string },
): Promise<void> {
  try {
    const { error: sentError } = await db
      .from('inbox_drafts')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        gmail_message_id: sent.messageId,
        error: null,
      })
      .eq('id', draftId)

    if (sentError) {
      logDbError('mailboxSendJob', 'inbox_drafts', { draftId }, sentError)
      logger.error(
        `[mailbox-send] ${draftId} SENT as ${sent.messageId} but the row could not be updated`,
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      `[mailbox-send] ${draftId} SENT as ${sent.messageId} but the row update threw: ${message}`,
    )
  }
}

async function fail(db: Db, draftId: string, message: string): Promise<void> {
  const { error } = await db
    .from('inbox_drafts')
    .update({ status: 'failed', error: message })
    .eq('id', draftId)
  if (error) logDbError('mailboxSendJob', 'inbox_drafts', { draftId }, error)
}

/**
 * Decision — the sent reply is NOT written into `inbox_messages` here. Task
 * 1 put the HOA's own sent mail in sync scope, so the next 2-minute sync
 * ingests this reply through the ordinary path, with the ordinary dedupe.
 * Writing it directly as well would mean two code paths creating the same
 * message and a dedupe that has to be exactly right forever, to save at most
 * two minutes of latency. The thread shows the reply on the next sync; the
 * draft row shows `status='sent'` immediately, so the board is never left
 * wondering whether it went.
 */
export const mailboxSendJob = inngest.createFunction(
  { id: 'mailbox-send', name: 'Mailbox Send Reply' },
  { event: 'mailbox/reply.queued' },
  async ({ event, step, logger }) => {
    const draftId = event.data?.draftId as string | undefined
    if (!draftId) throw new Error('mailboxSendJob: event carried no draftId')

    const db = createAdminClient()
    return runMailboxSend(db, step, logger, draftId)
  },
)
