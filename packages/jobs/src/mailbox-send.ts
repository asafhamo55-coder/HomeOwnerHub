import { createAdminClient } from '@homeowner-portal/db'
import { buildRawMessage, sendReply, MailboxAuthError } from '@homeowner-portal/mailbox'
import { inngest } from './client'
import { getAccessTokenFor, markAuthFailed } from './mailbox-tokens'
import { logDbError } from './db-error'

type Db = ReturnType<typeof createAdminClient>

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
    .select('id, organization_id, thread_id, subject, body_text, send_after, status')
    .eq('id', draftId)
    .maybeSingle()

  if (draftError) {
    logDbError('mailboxSendJob', 'inbox_drafts', { draftId }, draftError)
    throw new Error(`mailboxSendJob: failed to load draft: ${draftError.message}`)
  }
  if (!draft) throw new Error(`mailboxSendJob: draft ${draftId} not found`)
  if (draft.status !== 'queued') return { sent: false, reason: draft.status }

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

  const { data: thread, error: threadError } = await db
    .from('inbox_threads')
    .select('gmail_thread_id, mailbox_account_id')
    .eq('id', draft.thread_id)
    .maybeSingle()

  if (threadError || !thread) {
    await fail(db, draftId, threadError?.message ?? 'thread not found')
    throw new Error(`mailboxSendJob: could not load thread for ${draftId}`)
  }

  const { data: account, error: accountError } = await db
    .from('mailbox_accounts')
    .select('email_address, disconnected_at')
    .eq('id', thread.mailbox_account_id)
    .maybeSingle()

  if (accountError || !account) {
    await fail(db, draftId, accountError?.message ?? 'mailbox account not found')
    throw new Error(`mailboxSendJob: could not load account for ${draftId}`)
  }
  if (account.disconnected_at) {
    await fail(db, draftId, 'The mailbox was disconnected before this reply was sent.')
    return { sent: false, reason: 'disconnected' }
  }

  // Reply to the most recent inbound message so threading is correct.
  const { data: last, error: lastError } = await db
    .from('inbox_messages')
    .select('rfc822_message_id, from_email')
    .eq('thread_id', draft.thread_id)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastError) {
    logDbError('mailboxSendJob', 'inbox_messages', { draftId }, lastError)
    await fail(db, draftId, lastError.message)
    throw new Error(`mailboxSendJob: could not load last inbound message: ${lastError.message}`)
  }
  if (!last?.from_email) {
    await fail(db, draftId, 'No inbound message to reply to.')
    return { sent: false, reason: 'no_recipient' }
  }

  try {
    const accessToken = await getAccessTokenFor(db, thread.mailbox_account_id)
    const raw = buildRawMessage({
      from: account.email_address,
      to: [last.from_email],
      subject: draft.subject,
      body: draft.body_text,
      inReplyTo: last.rfc822_message_id,
      references: last.rfc822_message_id ? [last.rfc822_message_id] : [],
    })
    const sent = await sendReply(accessToken, thread.gmail_thread_id, raw)

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
      // The email IS sent. Never mark it failed here — a human would resend
      // and the resident would get it twice. Log loudly instead.
      logDbError('mailboxSendJob', 'inbox_drafts', { draftId }, sentError)
      logger.error(
        `[mailbox-send] ${draftId} SENT as ${sent.messageId} but the row could not be updated`,
      )
    }

    return { sent: true, messageId: sent.messageId }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await fail(db, draftId, message)
    if (error instanceof MailboxAuthError) {
      await markAuthFailed(db, thread.mailbox_account_id, message)
    }
    throw error
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
