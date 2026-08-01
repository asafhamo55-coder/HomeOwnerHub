import { createHash } from 'node:crypto'
import { createAdminClient } from '@homeowner-portal/db'
import { GmailClient, MailboxAuthError } from '@homeowner-portal/mailbox'
import { inngest } from './client'
import { logDbError } from './db-error'
import { getAccessTokenFor, markAuthFailed } from './mailbox-tokens'

const BUCKET = 'hoa-documents'
const BATCH_SIZE = 20
const MAX_ATTEMPTS = 2

/**
 * Attachment fetcher.
 *
 * Separate from mailboxSyncJob on purpose: a 20 MB PDF must not stall the
 * 2-minute sync loop, and a failed download must retry on its own without
 * re-walking Gmail history. gmail_attachment_id is what makes that
 * independent retry possible.
 *
 * Runs on a schedule AND on the mailbox/attachments.queued event, so a
 * fresh sync gets its files promptly while the cron catches stragglers.
 *
 * Error handling follows mailbox-sync.ts / mailbox-backfill.ts: every
 * Supabase read/write destructures `error` and either throws (query
 * failures that would otherwise masquerade as "no rows"/"nothing to do")
 * or is logged and treated as non-fatal (a best-effort write on an
 * already-failing path). A database error must never become a
 * MailboxAuthError — only a genuine MailboxAuthError from GmailClient
 * marks the mailbox account auth_failed; see mailbox-tokens.ts.
 *
 * Never log an email address, subject, or body. Even `file_name` is
 * untrusted, resident-supplied content (it could contain a name, address,
 * etc.), so log lines below use the opaque attachment id instead.
 */
export const mailboxAttachmentsJob = inngest.createFunction(
  { id: 'mailbox-attachments', name: 'Mailbox Attachment Fetch' },
  [{ cron: '*/5 * * * *' }, { event: 'mailbox/attachments.queued' }],
  async ({ logger }) => {
    const db = createAdminClient()

    const { data: pending, error: pendingError } = await db
      .from('inbox_attachments')
      .select(
        'id, organization_id, thread_id, message_id, file_name, content_type, gmail_attachment_id, fetch_attempts',
      )
      .eq('fetch_status', 'pending')
      .lt('fetch_attempts', MAX_ATTEMPTS)
      .order('created_at')
      .limit(BATCH_SIZE)

    if (pendingError) {
      // A failed read here is NOT "nothing pending" — falling into that
      // branch would silently skip a whole run's worth of attachments.
      // Throw so the run fails visibly and Inngest retries.
      logDbError('mailboxAttachmentsJob', 'inbox_attachments', {}, pendingError)
      throw new Error(
        `mailboxAttachmentsJob: failed to load pending attachments: ${pendingError.message}`,
      )
    }

    if (!pending || pending.length === 0) return { fetched: 0 }

    // One Gmail client per mailbox account, not per attachment.
    const clientCache = new Map<string, GmailClient>()
    let fetched = 0

    for (const attachment of pending) {
      try {
        const { data: message, error: messageError } = await db
          .from('inbox_messages')
          .select('gmail_message_id, thread_id')
          .eq('id', attachment.message_id)
          .maybeSingle()

        if (messageError) {
          // A soft read failure is not evidence the message is gone — it is
          // indistinguishable from any other transient failure. Throw
          // (caught below) so this attachment is retried up to
          // MAX_ATTEMPTS rather than immediately marked 'failed' for
          // "missing message" when the message is actually fine.
          logDbError(
            'mailboxAttachmentsJob',
            'inbox_messages',
            { attachmentId: attachment.id },
            messageError,
          )
          throw new Error(
            `mailboxAttachmentsJob: failed to read message for attachment ${attachment.id}: ${messageError.message}`,
          )
        }

        let thread: { mailbox_account_id: string } | null = null
        if (message) {
          const { data: threadData, error: threadError } = await db
            .from('inbox_threads')
            .select('mailbox_account_id')
            .eq('id', message.thread_id)
            .maybeSingle()

          if (threadError) {
            logDbError(
              'mailboxAttachmentsJob',
              'inbox_threads',
              { attachmentId: attachment.id },
              threadError,
            )
            throw new Error(
              `mailboxAttachmentsJob: failed to read thread for attachment ${attachment.id}: ${threadError.message}`,
            )
          }
          thread = threadData
        }

        if (!message || !thread || !attachment.gmail_attachment_id) {
          const { error: missingError } = await db
            .from('inbox_attachments')
            .update({
              fetch_status: 'failed',
              fetch_error: 'Missing message, thread, or Gmail attachment id.',
              fetch_attempts: attachment.fetch_attempts + 1,
            })
            .eq('id', attachment.id)

          if (missingError) {
            logDbError(
              'mailboxAttachmentsJob',
              'inbox_attachments',
              { attachmentId: attachment.id },
              missingError,
            )
          }
          continue
        }

        let client = clientCache.get(thread.mailbox_account_id)
        if (!client) {
          client = new GmailClient(await getAccessTokenFor(db, thread.mailbox_account_id))
          clientCache.set(thread.mailbox_account_id, client)
        }

        // GmailClient.getAttachment throws when `data` is absent rather
        // than returning an empty Buffer — deliberately, so a 0-byte file
        // can never be silently stored as if it downloaded successfully.
        const bytes = await client.getAttachment(
          message.gmail_message_id,
          attachment.gmail_attachment_id,
        )

        // Sanitize: a filename from an email is untrusted input and must
        // never be able to escape the org's storage prefix. Strip
        // everything but a conservative allowlist (letters, digits, dot,
        // underscore, hyphen) — in particular this removes every '/', so
        // the sanitized name can never introduce a path segment. A
        // sanitized name that is entirely dots (e.g. "." or "..") is also
        // rejected: it would sit between two literal '/' from the template
        // below, which reads like a traversal segment to anything that
        // treats storage keys as filesystem paths. That can't actually
        // happen today — Supabase Storage keys are opaque strings that are
        // never canonicalized against a filesystem — but that's a property
        // of the storage backend, not something this code should rely on,
        // so guard explicitly rather than lean on an argument that doesn't
        // hold. Also fall back to the attachment id if sanitizing leaves
        // nothing usable at all (e.g. an all-emoji original filename). Cap
        // length.
        const sanitized = attachment.file_name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
        const safeName = sanitized && !/^\.+$/.test(sanitized) ? sanitized : attachment.id

        // Two attachments on the same message can sanitize to the same
        // name (e.g. "Report [Q1].pdf" and "Report (Q1).pdf" both become
        // "Report_Q1_.pdf", since '[', ']', '(', ')' all map to '_'), so
        // safeName alone is not a safe path component — the upload below
        // uses upsert: true, so a collision would silently overwrite one
        // attachment's stored bytes with another's while both rows keep
        // their own, now-mismatched, metadata and sha256. The attachment's
        // own id disambiguates: it's unique per row and stable across
        // retries of that same row, so a retry after a partial failure
        // still resolves to this same path and upsert: true overwrites
        // only its own prior (partial) upload, never another attachment's.
        const path = `${attachment.organization_id}/inbox/${attachment.thread_id}/${attachment.message_id}/${attachment.id}/${safeName}`

        const { error: uploadError } = await db.storage.from(BUCKET).upload(path, bytes, {
          upsert: true,
          contentType: attachment.content_type ?? undefined,
        })

        if (uploadError) {
          logDbError(
            'mailboxAttachmentsJob',
            'storage:hoa-documents',
            { attachmentId: attachment.id },
            uploadError,
          )
          throw new Error(
            `mailboxAttachmentsJob: failed to upload attachment ${attachment.id}: ${uploadError.message}`,
          )
        }

        // Known, accepted trade-off: storage_path is only ever set on this
        // success branch. If this update itself fails, the row retries and
        // can still land 'failed' at MAX_ATTEMPTS (see the catch block
        // below) with the object already sitting in storage but no row
        // ever referencing it — an orphaned object, permanently. Harmless
        // (no data is served incorrectly), but a real storage leak. Not
        // building a cleanup mechanism for this pass; this comment is the
        // record that it's a deliberate gap, not an oversight.
        const { error: storedError } = await db
          .from('inbox_attachments')
          .update({
            storage_path: path,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            size_bytes: bytes.length,
            fetch_status: 'stored',
            fetch_error: null,
            fetch_attempts: attachment.fetch_attempts + 1,
          })
          .eq('id', attachment.id)

        if (storedError) {
          // The bytes are safely in storage (uploaded with upsert: true,
          // so a retry re-uploads the identical content harmlessly) but the
          // row still says 'pending'. Throw so the catch block below
          // records the failure and this row is retried — never leave a
          // row that looks pending forever while the file already exists.
          logDbError(
            'mailboxAttachmentsJob',
            'inbox_attachments',
            { attachmentId: attachment.id },
            storedError,
          )
          throw new Error(
            `mailboxAttachmentsJob: failed to persist stored status for attachment ${attachment.id}: ${storedError.message}`,
          )
        }

        fetched++
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const attempts = attachment.fetch_attempts + 1

        if (error instanceof MailboxAuthError) {
          const { data: thread, error: threadLookupError } = await db
            .from('inbox_threads')
            .select('mailbox_account_id')
            .eq('id', attachment.thread_id)
            .maybeSingle()

          if (threadLookupError) {
            // A database error must never become a MailboxAuthError-driven
            // markAuthFailed call — this is only the lookup of WHICH
            // account to flag for a MailboxAuthError we already have in
            // hand, but a failed lookup means we don't know which account,
            // so log and move on rather than guessing.
            logDbError(
              'mailboxAttachmentsJob',
              'inbox_threads',
              { attachmentId: attachment.id },
              threadLookupError,
            )
          } else if (thread) {
            await markAuthFailed(db, thread.mailbox_account_id, message)
          }
        }

        const { error: failError } = await db
          .from('inbox_attachments')
          .update({
            // Fail loudly at the cap. An attachment row that looks fine
            // but downloads nothing is worse than a visible error.
            fetch_status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            fetch_error: message,
            fetch_attempts: attempts,
          })
          .eq('id', attachment.id)

        if (failError) {
          logDbError(
            'mailboxAttachmentsJob',
            'inbox_attachments',
            { attachmentId: attachment.id },
            failError,
          )
        }

        logger.error(`[mailbox-attachments] attachment ${attachment.id}: ${message}`)
      }
    }

    logger.info(`[mailbox-attachments] stored ${fetched}/${pending.length}`)
    return { fetched }
  },
)
