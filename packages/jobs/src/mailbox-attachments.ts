import { createHash } from 'node:crypto'
import { createAdminClient } from '@homeowner-portal/db'
import { GmailClient, MailboxAuthError } from '@homeowner-portal/mailbox'
import {
  DISCONNECTED_FETCH_ERROR,
  dueForAttemptFilter,
  MAX_FETCH_ATTEMPTS,
  MISSING_SOURCE_FETCH_ERROR,
} from '../../../apps/hoa/src/lib/inbox/attachment-state'
import { inngest } from './client'
import { logDbError } from './db-error'
import { getAccessTokenFor, markAuthFailed } from './mailbox-tokens'
import { readAll } from './read-all'

const BUCKET = 'hoa-documents'
/** Attachments downloaded per run, across every tenant. */
export const ATTACHMENT_BATCH_SIZE = 20
const MAX_ATTEMPTS = MAX_FETCH_ATTEMPTS
/** The cron period; the org rotation advances once per period. */
const ROTATION_PERIOD_MS = 5 * 60_000

type AdminDb = ReturnType<typeof createAdminClient>

interface AttachmentFetcher {
  getAttachment(gmailMessageId: string, gmailAttachmentId: string): Promise<Buffer>
}

export interface AttachmentFetchDeps {
  now?: () => Date
  /** One per mailbox account. Tests inject a fake; production builds a GmailClient. */
  clientFor?: (db: AdminDb, mailboxAccountId: string) => Promise<AttachmentFetcher>
}

interface JobLogger {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

interface PendingAttachment {
  id: string
  organization_id: string
  thread_id: string
  message_id: string
  file_name: string
  content_type: string | null
  gmail_attachment_id: string | null
  fetch_attempts: number
}

/** `items` starting at `offset`, wrapping round. */
export function rotate<T>(items: T[], offset: number): T[] {
  if (items.length === 0) return []
  const start = ((offset % items.length) + items.length) % items.length
  return [...items.slice(start), ...items.slice(0, start)]
}

/**
 * Round-robin across per-org queues: one from each org in turn, then a
 * second from each, until `batchSize` is reached or every queue is empty.
 * A lone org still gets the whole batch — fairness must not leave
 * capacity idle.
 */
export function pickFairBatch<T>(queues: T[][], batchSize: number): T[] {
  const picked: T[] = []
  for (let round = 0; picked.length < batchSize; round++) {
    let tookAny = false
    for (const queue of queues) {
      if (round >= queue.length) continue
      picked.push(queue[round]!)
      tookAny = true
      if (picked.length >= batchSize) break
    }
    if (!tookAny) break
  }
  return picked
}

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
  async ({ logger }) => runAttachmentFetch(createAdminClient(), logger),
)

/**
 * One run of the fetcher. Exported, with an injectable clock and Gmail
 * client, so fairness and retry behaviour are unit-testable without Gmail.
 *
 * BL-017 — per-tenant fairness. The queue used to be one global
 * `order(created_at).limit(20)`, so an org importing a year of history
 * with thousands of attachments owned every batch until it drained, and
 * every other HOA's fresh attachments sat at "downloading…" for hours.
 * Now each org with a mailbox gets its own due queue (up to a batch each)
 * and the batch is filled round-robin, one per org per round. The org
 * order rotates by a full batch width every cron period, so even with more
 * orgs than batch slots every org is reached within a few runs (the
 * shifts are multiples of gcd(batch, orgs), which is ≤ the batch width).
 *
 * BL-017 — bounded retry with backoff. A failed attempt leaves the row
 * 'pending' with one more attempt recorded; the due filter
 * (`dueForAttemptFilter`) holds it back until its next slot in
 * RETRY_DELAYS_MS, and after MAX_FETCH_ATTEMPTS it is 'failed', where a
 * board member can Retry it from the thread view (which resets attempts).
 */
export async function runAttachmentFetch(
  db: AdminDb,
  logger: JobLogger,
  deps: AttachmentFetchDeps = {},
): Promise<{ fetched: number; attempted: number; orgs: number }> {
  const now = (deps.now ?? (() => new Date()))()
  const clientFor =
    deps.clientFor ??
    (async (adminDb: AdminDb, accountId: string) =>
      new GmailClient(await getAccessTokenFor(adminDb, accountId)))

  // Every org that has (or had) a mailbox. Disconnected accounts are
  // included on purpose: their still-pending attachments must reach the
  // "disconnected" branch below and fail visibly rather than sit at
  // "downloading…" forever.
  // readAll: a silent 1000-row cap here would drop whole tenants from the
  // rotation. A failed read is not "nothing pending" — it throws.
  const accountRows = await readAll<{ organization_id: string }>(
    (from, to) =>
      db.from('mailbox_accounts').select('organization_id').order('id').range(from, to),
    (error) => {
      logDbError('mailboxAttachmentsJob', 'mailbox_accounts', {}, {
        code: error.code,
        message: error.message ?? 'unknown',
      })
      return new Error(
        `mailboxAttachmentsJob: failed to load pending attachments (orgs): ${error.code ?? 'unknown'}`,
      )
    },
  )

  const orgIds = [...new Set(accountRows.map((r) => r.organization_id))].sort()
  if (orgIds.length === 0) return { fetched: 0, attempted: 0, orgs: 0 }

  const slot = Math.floor(now.getTime() / ROTATION_PERIOD_MS)
  const ordered = rotate(orgIds, slot * ATTACHMENT_BATCH_SIZE)
  const dueFilter = dueForAttemptFilter(now)

  const queues: PendingAttachment[][] = []
  let failedQueries = 0
  for (const orgId of ordered) {
    const { data, error } = await db
      .from('inbox_attachments')
      .select(
        'id, organization_id, thread_id, message_id, file_name, content_type, gmail_attachment_id, fetch_attempts',
      )
      .eq('organization_id', orgId)
      .eq('fetch_status', 'pending')
      .lt('fetch_attempts', MAX_ATTEMPTS)
      .or(dueFilter)
      .order('created_at')
      .limit(ATTACHMENT_BATCH_SIZE)

    if (error) {
      // One org's failed read must not stall every other tenant, but it is
      // not "nothing pending" either: logged here, and if EVERY org's read
      // failed the run throws below so Inngest retries it visibly.
      failedQueries++
      logDbError('mailboxAttachmentsJob', 'inbox_attachments', { orgId }, error)
      continue
    }
    if (data && data.length > 0) queues.push(data as PendingAttachment[])
  }

  if (failedQueries === ordered.length) {
    throw new Error(
      `mailboxAttachmentsJob: failed to load pending attachments for all ${failedQueries} org(s)`,
    )
  }

  const pending = pickFairBatch(queues, ATTACHMENT_BATCH_SIZE)
  if (pending.length === 0) return { fetched: 0, attempted: 0, orgs: 0 }

    // One Gmail client per mailbox account, not per attachment.
    const clientCache = new Map<string, AttachmentFetcher>()
    // Whether each account is still connected, resolved at most once per
    // run. This queue spans tenants and an account can be
    // disconnected while its attachments are still pending, so the check
    // cannot be hoisted out of the loop the way the other
    // getAccessTokenFor callers hoist `.is('disconnected_at', null)` into
    // their account query.
    const liveAccountCache = new Map<string, boolean>()
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
              fetch_error: MISSING_SOURCE_FETCH_ERROR,
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

        // Disconnecting hard-deletes the mailbox_account_secrets row, so
        // without this check getAccessTokenFor throws "No stored
        // credentials" and the catch below stamps auth_failed onto an
        // account that is already disconnected — noise that reads like a
        // credential problem when nothing is wrong. Fail these attachments
        // deliberately instead: the bytes were never downloaded and now
        // cannot be, which is what Disconnect means. The UI already renders
        // this state as "couldn't retrieve, open in Gmail".
        let accountIsLive = liveAccountCache.get(thread.mailbox_account_id)
        if (accountIsLive === undefined) {
          const { data: account, error: accountError } = await db
            .from('mailbox_accounts')
            .select('disconnected_at')
            .eq('id', thread.mailbox_account_id)
            .maybeSingle()

          if (accountError) {
            // Soft failure is indistinguishable from "no such account".
            // Throw so this attachment retries rather than being failed
            // for a disconnect that may not have happened.
            logDbError(
              'mailboxAttachmentsJob',
              'mailbox_accounts',
              { attachmentId: attachment.id },
              accountError,
            )
            throw new Error(
              `mailboxAttachmentsJob: failed to read mailbox account for attachment ${attachment.id}: ${accountError.message}`,
            )
          }

          accountIsLive = Boolean(account) && account?.disconnected_at === null
          liveAccountCache.set(thread.mailbox_account_id, accountIsLive)
        }

        if (!accountIsLive) {
          const { error: disconnectedError } = await db
            .from('inbox_attachments')
            .update({
              fetch_status: 'failed',
              fetch_error: DISCONNECTED_FETCH_ERROR,
              fetch_attempts: attachment.fetch_attempts + 1,
            })
            .eq('id', attachment.id)

          if (disconnectedError) {
            logDbError(
              'mailboxAttachmentsJob',
              'inbox_attachments',
              { attachmentId: attachment.id },
              disconnectedError,
            )
          }
          continue
        }

        let client = clientCache.get(thread.mailbox_account_id)
        if (!client) {
          client = await clientFor(db, thread.mailbox_account_id)
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

    // Counts only — never a file name or address.
    logger.info(
      `[mailbox-attachments] stored ${fetched}/${pending.length} across ${queues.length} org(s)`,
    )
    return { fetched, attempted: pending.length, orgs: queues.length }
}
