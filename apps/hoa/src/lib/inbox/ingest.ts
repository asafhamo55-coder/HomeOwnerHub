/**
 * Persist parsed Gmail messages.
 *
 * Idempotency is the contract. A history-expiry fallback (or an Inngest
 * retry, or an overlapping run) re-delivers messages we already have, and
 * every one of those paths must be a no-op. Two mechanisms:
 *
 *   - inbox_threads   upsert on (mailbox_account_id, gmail_thread_id)
 *   - inbox_messages  insert ... on conflict (mailbox_account_id, gmail_message_id) do nothing
 *
 * The conflict target on inbox_messages is scoped by mailbox_account_id
 * (migration 0030), not global. Gmail only guarantees message-id
 * uniqueness WITHIN a mailbox — a global unique index let a second
 * tenant's genuinely-new email be silently discarded as a "duplicate" of
 * a first tenant's message with the same id. See 0030 for the full story.
 *
 * Matching is deliberately NOT done here. Ingest's job is durable
 * capture; match.ts runs after, so a matcher bug can be fixed and
 * re-applied without re-fetching from Gmail.
 *
 * Error handling: every query/mutation below captures `error` and, on
 * failure, logs diagnostic context (function, table, org/mailbox ids —
 * never an email address, subject line, or message body, all of which
 * are resident PII) and throws. The Task 15 sync job wraps each mailbox
 * in a try/catch that records sync_error and leaves the cursor
 * unadvanced, so throwing here surfaces the failure and gets it retried
 * instead of silently mis-ingesting. The one expected exception is the
 * thread-insert race below: a unique-violation (Postgres code 23505)
 * there means a concurrent run won, not a real failure.
 */

import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import type { ParsedMessage } from '@homeowner-portal/mailbox'

type Db = SupabaseClient<Database>

/** Inline images at or below this size are signature logos, not content. */
const INLINE_SKIP_BYTES = 100 * 1024

/** Gmail's own attachment ceiling. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

/** Postgres unique_violation. */
const PG_UNIQUE_VIOLATION = '23505'

export interface IngestResult {
  threadsCreated: number
  messagesInserted: number
  messagesSkipped: number
  attachmentsQueued: number
}

function logDbError(
  fn: string,
  table: string,
  context: Record<string, string | null>,
  error: PostgrestError | Error,
): void {
  console.error(`${fn}: query on "${table}" failed`, {
    ...context,
    code: 'code' in error ? error.code : undefined,
    message: error.message,
  })
}

export async function ingestMessages(
  db: Db,
  orgId: string,
  mailboxAccountId: string,
  messages: ParsedMessage[],
): Promise<IngestResult> {
  const result: IngestResult = {
    threadsCreated: 0,
    messagesInserted: 0,
    messagesSkipped: 0,
    attachmentsQueued: 0,
  }
  if (messages.length === 0) return result

  // ── group by Gmail thread ─────────────────────────────────────────
  const byThread = new Map<string, ParsedMessage[]>()
  for (const message of messages) {
    const bucket = byThread.get(message.gmailThreadId)
    if (bucket) bucket.push(message)
    else byThread.set(message.gmailThreadId, [message])
  }

  for (const [gmailThreadId, threadMessages] of byThread) {
    const sorted = [...threadMessages].sort((a, b) =>
      (a.sentAt ?? '').localeCompare(b.sentAt ?? ''),
    )
    const newest = sorted[sorted.length - 1]

    const participants = [
      ...new Set(
        sorted.flatMap((m) =>
          [m.fromEmail, ...m.toEmails, ...m.ccEmails].filter(
            (e): e is string => e !== null,
          ),
        ),
      ),
    ]

    // ── thread upsert ───────────────────────────────────────────────
    const { data: existing, error: lookupError } = await db
      .from('inbox_threads')
      .select('id')
      .eq('mailbox_account_id', mailboxAccountId)
      .eq('gmail_thread_id', gmailThreadId)
      .maybeSingle()

    if (lookupError) {
      logDbError(
        'ingestMessages',
        'inbox_threads',
        { orgId, mailboxAccountId },
        lookupError,
      )
      throw lookupError
    }

    let threadId: string

    if (existing) {
      threadId = existing.id
      // Only advance the activity fields. Never touch unit_id, status, or
      // match_* — a manager's manual assignment must survive new mail
      // arriving on the thread.
      const { error: updateError } = await db
        .from('inbox_threads')
        .update({
          subject: newest.subject,
          participants,
          last_message_at: newest.sentAt,
          last_direction: 'inbound',
        })
        .eq('id', threadId)

      if (updateError) {
        logDbError(
          'ingestMessages',
          'inbox_threads',
          { orgId, mailboxAccountId, threadId },
          updateError,
        )
        throw updateError
      }
    } else {
      const { data: created, error: insertError } = await db
        .from('inbox_threads')
        .insert({
          organization_id: orgId,
          mailbox_account_id: mailboxAccountId,
          gmail_thread_id: gmailThreadId,
          subject: newest.subject,
          participants,
          last_message_at: newest.sentAt,
          last_direction: 'inbound',
          status: 'needs_review',
          match_confidence: 'none',
        })
        .select('id')
        .single()

      if (insertError) {
        if (insertError.code !== PG_UNIQUE_VIOLATION) {
          // A genuine failure, not a race — surface it.
          logDbError(
            'ingestMessages',
            'inbox_threads',
            { orgId, mailboxAccountId },
            insertError,
          )
          throw insertError
        }

        // Expected: a concurrent run won the unique index on
        // (mailbox_account_id, gmail_thread_id). Re-read and continue —
        // this is not an error.
        const { data: raced, error: racedError } = await db
          .from('inbox_threads')
          .select('id')
          .eq('mailbox_account_id', mailboxAccountId)
          .eq('gmail_thread_id', gmailThreadId)
          .maybeSingle()

        if (racedError) {
          logDbError(
            'ingestMessages',
            'inbox_threads',
            { orgId, mailboxAccountId },
            racedError,
          )
          throw racedError
        }

        if (!raced) {
          // A unique violation implies a row exists. Not finding one on
          // re-read means something else is wrong — treat as a genuine
          // failure rather than silently dropping this thread's mail.
          const err = new Error(
            'inbox_threads: unique violation on insert but no row found on re-read',
          )
          logDbError('ingestMessages', 'inbox_threads', { orgId, mailboxAccountId }, err)
          throw err
        }

        threadId = raced.id
      } else {
        threadId = created.id
        result.threadsCreated++
      }
    }

    // ── messages ────────────────────────────────────────────────────
    for (const message of sorted) {
      const { data: inserted, error: upsertError } = await db
        .from('inbox_messages')
        .upsert(
          {
            organization_id: orgId,
            thread_id: threadId,
            mailbox_account_id: mailboxAccountId,
            gmail_message_id: message.gmailMessageId,
            rfc822_message_id: message.rfc822MessageId,
            in_reply_to: message.inReplyTo,
            references_ids: message.references,
            direction: 'inbound',
            from_email: message.fromEmail,
            from_name: message.fromName,
            to_emails: message.toEmails,
            cc_emails: message.ccEmails,
            subject: message.subject,
            body_text: message.bodyText,
            body_html: message.bodyHtml,
            stripped_text: message.strippedText,
            sent_at: message.sentAt,
          },
          { onConflict: 'mailbox_account_id,gmail_message_id', ignoreDuplicates: true },
        )
        .select('id')

      if (upsertError) {
        logDbError(
          'ingestMessages',
          'inbox_messages',
          { orgId, mailboxAccountId, threadId },
          upsertError,
        )
        throw upsertError
      }

      // ignoreDuplicates returns an empty array when the row already
      // existed — that is the idempotent path, not an error.
      const messageId = inserted?.[0]?.id
      if (!messageId) {
        result.messagesSkipped++
        continue
      }
      result.messagesInserted++

      // ── attachments (metadata now, bytes by a separate job) ───────
      for (const attachment of message.attachments) {
        const size = attachment.sizeBytes ?? 0
        let fetchStatus: 'pending' | 'skipped' | 'failed' = 'pending'
        let fetchError: string | null = null

        if (attachment.isInline && size <= INLINE_SKIP_BYTES) {
          // Signature logos. Storing them buries real attachments in the
          // UI and multiplies storage for no value.
          fetchStatus = 'skipped'
        } else if (size > MAX_ATTACHMENT_BYTES) {
          fetchStatus = 'failed'
          fetchError = `Exceeds ${MAX_ATTACHMENT_BYTES} byte limit.`
        } else if (!attachment.gmailAttachmentId) {
          fetchStatus = 'failed'
          fetchError = 'No Gmail attachment id — cannot fetch.'
        }

        const { error: attachmentError } = await db.from('inbox_attachments').insert({
          organization_id: orgId,
          thread_id: threadId,
          message_id: messageId,
          file_name: attachment.fileName,
          content_type: attachment.contentType,
          size_bytes: attachment.sizeBytes,
          gmail_attachment_id: attachment.gmailAttachmentId,
          is_inline: attachment.isInline,
          fetch_status: fetchStatus,
          fetch_error: fetchError,
        })

        if (attachmentError) {
          logDbError(
            'ingestMessages',
            'inbox_attachments',
            { orgId, mailboxAccountId, threadId, messageId },
            attachmentError,
          )
          throw attachmentError
        }

        if (fetchStatus === 'pending') result.attachmentsQueued++
      }
    }
  }

  return result
}
