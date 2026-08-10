/**
 * ⚠ CROSS-PACKAGE CONSTRAINT — read this before adding an import here.
 *
 * `packages/jobs` imports this module DIRECTLY over a relative path
 * (`../../../apps/hoa/src/lib/...`), compiling it under its OWN tsconfig
 * rather than the `hoa` app's. Four files are shared this way:
 *
 *   apps/hoa/src/lib/inbox/ingest.ts
 *   apps/hoa/src/lib/inbox/match.ts
 *   apps/hoa/src/lib/properties/resolve.ts
 *   apps/hoa/src/lib/properties/normalize-address.ts
 *
 * That only works because every import in them that leaves this set of
 * four is `import type` — fully erased by TypeScript, so there is no
 * runtime dependency for the jobs package to resolve. Therefore, in this
 * file:
 *
 *   - NO `@/…` path aliases — jobs' tsconfig does not define them.
 *   - NO `import 'server-only'` — not a dependency of this repo, and the
 *     jobs package is not a Next runtime. (This is the tempting one: the
 *     file is full of service-role queries.)
 *   - NO Next-specific imports (`next/*`, `next/headers`, `next/cache`).
 *   - Value imports only from the other three files above; everything
 *     else stays `import type`.
 *   - Need a runtime helper? Copy it in (see the local `logDbError` in
 *     ingest.ts / match.ts) or add it to `@homeowner-portal/db` /
 *     `@homeowner-portal/mailbox`, both of which jobs already depends on.
 *
 * Breaking any of these leaves `pnpm --filter hoa typecheck` GREEN and
 * fails `pnpm --filter @homeowner-portal/jobs typecheck` instead — the
 * error surfaces in a package that does not contain the edit, which is
 * why it is written here and not only on the consumer side
 * (packages/jobs/src/mailbox-sync.ts).
 */

/**
 * Persist parsed Gmail messages.
 *
 * Idempotency is the contract. A history-expiry fallback (or an Inngest
 * retry, or an overlapping run) re-delivers messages we already have, and
 * every one of those paths must be a no-op. Three mechanisms, one per
 * table:
 *
 *   - inbox_threads      upsert on (mailbox_account_id, gmail_thread_id)
 *   - inbox_messages     upsert ... on conflict
 *                        (mailbox_account_id, gmail_message_id) ignore
 *   - inbox_attachments  upsert ... on conflict
 *                        (message_id, file_name, gmail_attachment_key)
 *                        ignore — migration 0031. gmail_attachment_key is
 *                        a generated column materializing
 *                        COALESCE(gmail_attachment_id, ''), because
 *                        gmail_attachment_id is nullable (an inline part
 *                        can have a filename with no Gmail attachment id)
 *                        and NULL never collides with NULL in a plain
 *                        unique index.
 *
 * The conflict target on inbox_messages is scoped by mailbox_account_id
 * (migration 0030), not global. Gmail only guarantees message-id
 * uniqueness WITHIN a mailbox — a global unique index let a second
 * tenant's genuinely-new email be silently discarded as a "duplicate" of
 * a first tenant's message with the same id. See 0030 for the full story.
 *
 * A message row's existence is NOT, by itself, sufficient evidence that
 * ingestion of that message finished. Before migration 0031, it was: a
 * message insert could succeed and then the attachment loop could throw
 * (transient DB/network error), aborting the call. On retry, the message
 * upsert found the row already present, `ignoreDuplicates` returned an
 * empty array, and the (former) code took that as "nothing to do" and
 * skipped straight past the attachment loop — permanently orphaning any
 * attachment that hadn't been written yet, with no unique constraint and
 * no completeness marker to ever detect or repair it. So a message that
 * is "already there" still runs its attachment loop, every time, as an
 * upsert — a fully-ingested message re-processes to zero writes, a
 * partially-ingested one is repaired.
 *
 * Failure isolation: a throw from one thread group no longer aborts the
 * rest of the batch, and a throw from one message no longer aborts the
 * rest of its thread. Each level (thread, message) is wrapped in its own
 * try/catch, logs, increments a failure counter on IngestResult, and
 * moves on to its next sibling. Attachment-level errors are handled the
 * same way without needing an actual throw, since the Supabase client
 * returns `{ error }` rather than throwing. A thread's activity fields
 * (subject, participants, last_message_at, last_direction) are computed
 * ONLY from messages that were actually stored (inserted this call, or
 * already present from a prior call) — never from the raw input array —
 * so the thread row can never claim a newest message that was never
 * persisted. If nothing in a batch could be stored for a thread, its
 * activity fields are left untouched rather than being overwritten with
 * a guess. After the whole batch runs, if anything failed, the function
 * throws a summary (counts only, no PII). The Task 15 sync job wraps
 * each mailbox in a try/catch that records sync_error and leaves the
 * cursor unadvanced on any throw, so a partial failure here still gets
 * retried — but by the time it throws, everything that COULD be
 * persisted already has been, which is the point.
 *
 * Matching is deliberately NOT done here. Ingest's job is durable
 * capture; match.ts runs after, so a matcher bug can be fixed and
 * re-applied without re-fetching from Gmail.
 *
 * Error handling: every query/mutation below captures `error` and, on
 * failure, logs diagnostic context (function, table, org/mailbox/thread/
 * message ids — never an email address, subject line, or message body,
 * all of which are resident PII) and either throws (thread- and
 * message-level errors, caught by the enclosing try/catch) or records a
 * failure counter and continues (attachment-level errors). The one
 * expected exception to "throw on error" is the thread-insert race
 * below: a unique-violation (Postgres code 23505) there means a
 * concurrent run won, not a real failure.
 */

import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import type {
  GmailMessageState,
  GmailThreadState,
  ParsedMessage,
} from '@homeowner-portal/mailbox'
// Value imports, permitted by the cross-package constraint above:
// packages/jobs already depends on @homeowner-portal/mailbox, so these
// resolve under its tsconfig as well as the hoa app's.
import { messageStateFromLabels, threadStateFromMessages } from '@homeowner-portal/mailbox'

type Db = SupabaseClient<Database>

/** Inline images at or below this size are signature logos, not content. */
const INLINE_SKIP_BYTES = 100 * 1024

/** Gmail's own attachment ceiling. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

/** Postgres unique_violation. */
const PG_UNIQUE_VIOLATION = '23505'

/**
 * A message is outbound when its From address is the mailbox's own
 * address; otherwise inbound. Phase B widened `buildScopeQuery` to also
 * fetch `from:<mailbox address>` so the HOA's own sent replies sync too
 * (see packages/mailbox/src/scope.ts) — before this, ingest hardcoded
 * every row as 'inbound', so the reply corpus that
 * `mailboxReplyEmbeddingsJob` reads (WHERE direction = 'outbound') was
 * permanently empty, the "Sent by HOA" badge never appeared, and
 * inbox_threads.last_direction could never reflect who a thread was
 * waiting on.
 *
 * Case-insensitive and trimmed: Gmail preserves the sender's casing on
 * the From header as typed, and mailboxEmailAddress comes straight from
 * the `mailbox_accounts.email_address` column.
 *
 * `fromEmail === null` (a malformed envelope) is NOT treated as a match.
 * It is deliberately not coerced to a string first — `String(null)`
 * yields `"null"`, which could accidentally equal a literal address of
 * "null" — so a null From falls through to 'inbound', same fail-safe
 * default as before this fix.
 *
 * Known limitation, not fixed here: a mailbox can have Gmail "send as"
 * aliases (see `recommendScope` in packages/mailbox/src/scope.ts, which
 * actively recommends scoping shared inboxes BY an alias distinct from
 * the account's own login address). A message the HOA sent from such an
 * alias carries that alias in From, not `mailbox_accounts.email_address`,
 * so it would be mislabeled inbound here. Resolving that needs the
 * account's Gmail send-as list, which isn't loaded by either caller
 * today; a soft lookup that could silently miss would reproduce exactly
 * the mislabeling this fix removes, so it's left as a known gap rather
 * than guessed at.
 */
export function computeDirection(
  fromEmail: string | null,
  mailboxEmailAddress: string,
): 'inbound' | 'outbound' {
  if (fromEmail === null) return 'inbound'
  return fromEmail.trim().toLowerCase() === mailboxEmailAddress.trim().toLowerCase()
    ? 'outbound'
    : 'inbound'
}

export interface IngestResult {
  threadsCreated: number
  messagesInserted: number
  messagesSkipped: number
  attachmentsQueued: number
  /** Thread groups that failed outright (e.g. the thread upsert itself). */
  threadsFailed: number
  /** Individual messages that failed within an otherwise-processed thread. */
  messagesFailed: number
  /** Individual attachments that failed within an otherwise-stored message. */
  attachmentsFailed: number
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

/**
 * Ascending by sentAt, with a null sentAt (an upstream parse failure)
 * sorted to the END rather than treated as the earliest possible
 * timestamp. A message we can't date is not necessarily old — sorting it
 * last makes it win the "newest" pick (`stored[stored.length - 1]`)
 * instead of being masked by an older-but-parseable message. Overstating
 * a thread's recency (bumped to the top of the queue) is the safer
 * failure mode than understating it (a genuinely live thread going stale
 * in the queue because its newest arrival's date didn't parse).
 *
 * Exported (typed against just `{ sentAt }`, not the full ParsedMessage)
 * so scripts/backfill-message-direction.ts can pick the same "newest"
 * message a live ingest would, rather than re-deriving the tie-break rule
 * and risking drift from this one.
 */
export function compareBySentAt(a: { sentAt: string | null }, b: { sentAt: string | null }): number {
  if (a.sentAt === null && b.sentAt === null) return 0
  if (a.sentAt === null) return 1
  if (b.sentAt === null) return -1
  return a.sentAt.localeCompare(b.sentAt)
}

/**
 * Recompute and persist a thread's `gmail_state` from its own messages.
 *
 * Reads EVERY message on the thread, never just the ones a caller happens
 * to be holding. `threadStateFromMessages` answers "is any inbound message
 * still in the Gmail inbox", which a partial view cannot decide: a batch
 * containing one archived message says nothing about the sibling that is
 * still sitting in the board's inbox, and archiving the thread on that
 * basis would hide live mail.
 *
 * This is the per-thread path, used by live ingest. The reconcile job
 * deliberately does NOT call it — it would mean one round trip per thread
 * across a whole mailbox — and instead rolls messages up in bulk. What
 * keeps the two honest is that both derive the answer from the same
 * `threadStateFromMessages`, which is where the rule actually lives; only
 * the read strategy differs.
 *
 * Returns the state it wrote, or null if it could not be determined (the
 * caller logs; leaving the previous value in place is the safe outcome,
 * since both the column default and the fail-open value are 'unknown').
 */
export async function recomputeThreadGmailState(
  db: Db,
  threadId: string,
): Promise<GmailThreadState | null> {
  const { data, error } = await db
    .from('inbox_messages')
    .select('direction, gmail_state')
    .eq('thread_id', threadId)

  if (error) {
    logDbError('recomputeThreadGmailState', 'inbox_messages', { threadId }, error)
    return null
  }

  const state = threadStateFromMessages(
    (data ?? []).map((row) => ({
      direction: row.direction === 'outbound' ? 'outbound' : 'inbound',
      gmailState: (row.gmail_state ?? 'unknown') as GmailMessageState,
    })),
  )

  const { error: writeError } = await db
    .from('inbox_threads')
    .update({ gmail_state: state })
    .eq('id', threadId)

  if (writeError) {
    logDbError('recomputeThreadGmailState', 'inbox_threads', { threadId }, writeError)
    return null
  }

  return state
}

export async function ingestMessages(
  db: Db,
  orgId: string,
  mailboxAccountId: string,
  mailboxEmailAddress: string,
  messages: ParsedMessage[],
): Promise<IngestResult> {
  const result: IngestResult = {
    threadsCreated: 0,
    messagesInserted: 0,
    messagesSkipped: 0,
    attachmentsQueued: 0,
    threadsFailed: 0,
    messagesFailed: 0,
    attachmentsFailed: 0,
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
    try {
      await ingestThread(
        db,
        orgId,
        mailboxAccountId,
        mailboxEmailAddress,
        gmailThreadId,
        threadMessages,
        result,
      )
    } catch (threadError) {
      result.threadsFailed++
      logDbError(
        'ingestMessages',
        'inbox_threads',
        { orgId, mailboxAccountId, gmailThreadId },
        threadError instanceof Error ? threadError : new Error(String(threadError)),
      )
      // One bad thread must not block the rest of the batch.
    }
  }

  const totalFailed = result.threadsFailed + result.messagesFailed + result.attachmentsFailed
  if (totalFailed > 0) {
    throw new Error(
      `ingestMessages: partial failure for mailbox ${mailboxAccountId} — ` +
        `${result.threadsFailed} thread(s), ${result.messagesFailed} message(s), ` +
        `${result.attachmentsFailed} attachment(s) failed out of ${byThread.size} ` +
        `thread(s) / ${messages.length} message(s) submitted. Everything that could ` +
        `be persisted was persisted; retry will repair the rest.`,
    )
  }

  return result
}

/** Process one Gmail thread's worth of messages. Throws on a thread-level failure. */
async function ingestThread(
  db: Db,
  orgId: string,
  mailboxAccountId: string,
  mailboxEmailAddress: string,
  gmailThreadId: string,
  threadMessages: ParsedMessage[],
  result: IngestResult,
): Promise<void> {
  const sorted = [...threadMessages].sort(compareBySentAt)

  // ── thread upsert (bare) ────────────────────────────────────────────
  // Activity fields (subject, participants, last_message_at,
  // last_direction) are deliberately NOT set here. They are set below,
  // once we know which messages in this batch actually made it to disk
  // — never guessed from the raw input array.
  const { data: existing, error: lookupError } = await db
    .from('inbox_threads')
    .select('id')
    .eq('mailbox_account_id', mailboxAccountId)
    .eq('gmail_thread_id', gmailThreadId)
    .maybeSingle()

  if (lookupError) {
    logDbError('ingestMessages', 'inbox_threads', { orgId, mailboxAccountId, gmailThreadId }, lookupError)
    throw lookupError
  }

  let threadId: string

  if (existing) {
    threadId = existing.id
  } else {
    const { data: created, error: insertError } = await db
      .from('inbox_threads')
      .insert({
        organization_id: orgId,
        mailbox_account_id: mailboxAccountId,
        gmail_thread_id: gmailThreadId,
        status: 'needs_review',
        match_confidence: 'none',
      })
      .select('id')
      .single()

    if (insertError) {
      if (insertError.code !== PG_UNIQUE_VIOLATION) {
        // A genuine failure, not a race — surface it.
        logDbError('ingestMessages', 'inbox_threads', { orgId, mailboxAccountId, gmailThreadId }, insertError)
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
        logDbError('ingestMessages', 'inbox_threads', { orgId, mailboxAccountId, gmailThreadId }, racedError)
        throw racedError
      }

      if (!raced) {
        // A unique violation implies a row exists. Not finding one on
        // re-read means something else is wrong — treat as a genuine
        // failure rather than silently dropping this thread's mail.
        const err = new Error('inbox_threads: unique violation on insert but no row found on re-read')
        logDbError('ingestMessages', 'inbox_threads', { orgId, mailboxAccountId, gmailThreadId }, err)
        throw err
      }

      threadId = raced.id
    } else {
      threadId = created.id
      result.threadsCreated++
    }
  }

  // ── messages ─────────────────────────────────────────────────────────
  // Each message is isolated: a throw here is caught, counted, and does
  // not stop the rest of this thread's messages from being attempted.
  const stored: ParsedMessage[] = []
  for (const message of sorted) {
    try {
      await ingestMessage(
        db,
        orgId,
        mailboxAccountId,
        mailboxEmailAddress,
        threadId,
        message,
        result,
      )
      stored.push(message)
    } catch (messageError) {
      result.messagesFailed++
      logDbError(
        'ingestMessages',
        'inbox_messages',
        { orgId, mailboxAccountId, threadId },
        messageError instanceof Error ? messageError : new Error(String(messageError)),
      )
      // One bad message must not abort the rest of the thread.
    }
  }

  // ── activity fields, derived ONLY from messages actually stored ──────
  // If nothing in this batch could be stored for this thread, leave the
  // row exactly as it was — no write, no guess, no lie.
  if (stored.length === 0) return

  const newest = stored[stored.length - 1]
  const participants = [
    ...new Set(
      stored.flatMap((m) => [m.fromEmail, ...m.toEmails, ...m.ccEmails].filter((e): e is string => e !== null)),
    ),
  ]

  // Only advance the activity fields. Never touch unit_id, status, or
  // match_* — a manager's manual assignment must survive new mail
  // arriving on the thread.
  const { error: updateError } = await db
    .from('inbox_threads')
    .update({
      subject: newest.subject,
      participants,
      last_message_at: newest.sentAt,
      last_direction: computeDirection(newest.fromEmail, mailboxEmailAddress),
    })
    .eq('id', threadId)

  if (updateError) {
    logDbError('ingestMessages', 'inbox_threads', { orgId, mailboxAccountId, threadId }, updateError)
    throw updateError
  }

  // ── Gmail filing state ───────────────────────────────────────────────
  // Fast path: if anything just stored is inbound mail still carrying
  // INBOX, the thread is live by definition and no sibling can outvote
  // that — `threadStateFromMessages` returns 'active' on ANY such message.
  // This is the overwhelmingly common case (new mail arriving), and it
  // matters because it also un-hides a thread the board had filed away
  // the moment a resident writes back.
  //
  // Anything else — an archived message arriving via a fallback re-fetch,
  // an outbound-only batch — cannot be decided from this batch alone and
  // falls through to the full recompute.
  const revivesThread = stored.some(
    (message) =>
      computeDirection(message.fromEmail, mailboxEmailAddress) === 'inbound' &&
      messageStateFromLabels(message.labelIds) === 'inbox',
  )

  if (revivesThread) {
    const { error: stateError } = await db
      .from('inbox_threads')
      .update({ gmail_state: 'active' })
      .eq('id', threadId)

    if (stateError) {
      // Not fatal: the reconcile job recomputes this on its next pass, and
      // a stale 'archived' hides a thread rather than losing it. Logged so
      // a persistent failure is still visible.
      logDbError('ingestMessages', 'inbox_threads', { orgId, mailboxAccountId, threadId }, stateError)
    }
    return
  }

  await recomputeThreadGmailState(db, threadId)
}

/**
 * Store one message and its attachments. Throws on a message-level
 * failure (caught by the caller's per-message try/catch).
 */
async function ingestMessage(
  db: Db,
  orgId: string,
  mailboxAccountId: string,
  mailboxEmailAddress: string,
  threadId: string,
  message: ParsedMessage,
  result: IngestResult,
): Promise<void> {
  // Stamped once and reused on both the insert and the already-present
  // branch below, so a row's labels and the time they were observed can
  // never disagree.
  const observedAt = new Date().toISOString()

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
        direction: computeDirection(message.fromEmail, mailboxEmailAddress),
        from_email: message.fromEmail,
        from_name: message.fromName,
        to_emails: message.toEmails,
        cc_emails: message.ccEmails,
        subject: message.subject,
        body_text: message.bodyText,
        body_html: message.bodyHtml,
        stripped_text: message.strippedText,
        sent_at: message.sentAt,
        gmail_labels: message.labelIds,
        gmail_state: messageStateFromLabels(message.labelIds),
        gmail_state_at: observedAt,
      },
      { onConflict: 'mailbox_account_id,gmail_message_id', ignoreDuplicates: true },
    )
    .select('id')

  if (upsertError) {
    logDbError('ingestMessages', 'inbox_messages', { orgId, mailboxAccountId, threadId }, upsertError)
    throw upsertError
  }

  // ignoreDuplicates returns an empty array when the row already
  // existed — that is the idempotent path, not an error. But a message
  // row existing is not proof its attachments finished (see the module
  // doc comment), so we still run the attachment loop below in both
  // branches — fetching the existing id when this call didn't insert it.
  let messageId = inserted?.[0]?.id

  if (messageId) {
    result.messagesInserted++
  } else {
    const { data: existingMessage, error: fetchError } = await db
      .from('inbox_messages')
      .select('id')
      .eq('mailbox_account_id', mailboxAccountId)
      .eq('gmail_message_id', message.gmailMessageId)
      .maybeSingle()

    if (fetchError) {
      logDbError('ingestMessages', 'inbox_messages', { orgId, mailboxAccountId, threadId }, fetchError)
      throw fetchError
    }

    if (!existingMessage) {
      // ignoreDuplicates implies a row exists. Not finding one on
      // re-read means something else is wrong — treat as a genuine
      // failure rather than silently dropping this message.
      const err = new Error('inbox_messages: ignoreDuplicates reported a duplicate but no row found on re-read')
      logDbError('ingestMessages', 'inbox_messages', { orgId, mailboxAccountId, threadId }, err)
      throw err
    }

    messageId = existingMessage.id
    result.messagesSkipped++

    // `ignoreDuplicates` left the stored row untouched, INCLUDING its
    // label columns — but this fetch is a fresh observation from Gmail
    // and is strictly newer than whatever is on the row. This is the path
    // a history-expiry fallback or a backfill re-fetch takes, so skipping
    // it would mean a re-synced message keeps label state from its
    // original ingest forever. Not fatal on its own (the reconcile job
    // would correct it on its next pass), so a failure here is logged and
    // the message still counts as stored rather than aborting it.
    const { error: labelError } = await db
      .from('inbox_messages')
      .update({
        gmail_labels: message.labelIds,
        gmail_state: messageStateFromLabels(message.labelIds),
        gmail_state_at: observedAt,
      })
      .eq('id', messageId)

    if (labelError) {
      logDbError('ingestMessages', 'inbox_messages', { orgId, mailboxAccountId, threadId }, labelError)
    }
  }

  await ingestAttachments(db, orgId, mailboxAccountId, threadId, messageId, message, result)
}

/**
 * Store a message's attachments as an idempotent upsert (migration 0031).
 * Runs unconditionally — for both newly-inserted messages and messages
 * that already existed — so a message whose row survived a prior partial
 * failure gets its missing attachments repaired instead of permanently
 * orphaned. Each attachment is independent: one failing does not stop
 * its siblings from being attempted.
 */
async function ingestAttachments(
  db: Db,
  orgId: string,
  mailboxAccountId: string,
  threadId: string,
  messageId: string,
  message: ParsedMessage,
  result: IngestResult,
): Promise<void> {
  for (const attachment of message.attachments) {
    // Unknown size (sizeBytes === null) deliberately falls through to
    // 'pending' rather than being defaulted to 0. Defaulting to 0 would
    // make an inline attachment of UNKNOWN size look "small" and get
    // skipped as a signature logo — discarding possible evidence is
    // worse than storing one. Only a KNOWN small inline size is skipped.
    const size = attachment.sizeBytes
    let fetchStatus: 'pending' | 'skipped' | 'failed' = 'pending'
    let fetchError: string | null = null

    if (attachment.isInline && size !== null && size <= INLINE_SKIP_BYTES) {
      // Signature logos. Storing them buries real attachments in the
      // UI and multiplies storage for no value.
      fetchStatus = 'skipped'
    } else if (size !== null && size > MAX_ATTACHMENT_BYTES) {
      fetchStatus = 'failed'
      fetchError = `Exceeds ${MAX_ATTACHMENT_BYTES} byte limit.`
    } else if (!attachment.gmailAttachmentId) {
      fetchStatus = 'failed'
      fetchError = 'No Gmail attachment id — cannot fetch.'
    }

    const { data: attachmentRow, error: attachmentError } = await db
      .from('inbox_attachments')
      .upsert(
        {
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
        },
        { onConflict: 'message_id,file_name,gmail_attachment_key', ignoreDuplicates: true },
      )
      .select('id')

    if (attachmentError) {
      result.attachmentsFailed++
      logDbError(
        'ingestMessages',
        'inbox_attachments',
        { orgId, mailboxAccountId, threadId, messageId },
        attachmentError,
      )
      // One bad attachment must not block its siblings.
      continue
    }

    // ignoreDuplicates returns an empty array when the row already
    // existed — do not recount an already-queued attachment as newly
    // queued on a repair re-run.
    const wasInserted = (attachmentRow?.length ?? 0) > 0
    if (wasInserted && fetchStatus === 'pending') result.attachmentsQueued++
  }
}
