/**
 * Incremental mailbox sync.
 *
 * Pure with respect to storage — takes a client and a cursor, returns
 * messages and the next cursor. The caller persists. This is what lets an
 * Inngest cron drive it today and a Pub/Sub push webhook drive it later
 * without changing a line here.
 *
 * Three paths:
 *   1. cursor present  → history.list from it (cheap, the normal case)
 *   2. cursor missing  → dated messages.list bootstrap
 *   3. history expired → dated messages.list fallback (Gmail drops
 *                        history after ~7 days, so any outage longer than
 *                        that cannot resume incrementally)
 *
 * Paths 2 and 3 rely on the unique index on
 * inbox_messages(mailbox_account_id, gmail_message_id) for idempotency: a
 * re-fetch of already-stored mail must be a no-op. Scoped per mailbox
 * because Gmail only guarantees message-id uniqueness within one mailbox.
 */

import { GmailClient } from './client'
import { parseGmailMessage } from './parse'
import { buildScopeQuery, isInScope } from './scope'
import {
  MailboxAuthError,
  MailboxHistoryExpiredError,
  type MailboxAccount,
  type ParsedMessage,
  type SyncResult,
} from './types'

const DEFAULT_MAX_MESSAGES = 200

export interface SyncOptions {
  /** Gmail-format date (YYYY/MM/DD) for bootstrap and fallback queries. */
  fallbackAfterDate?: string
  /** Hard cap per run so one invocation cannot exceed the function timeout. */
  maxMessages?: number
}

/**
 * `SyncResult` (types.ts) doesn't have a `fetchFailures` field yet — that
 * file is out of scope for this change. This extends it locally so the
 * count can be returned without editing types.ts. types.ts should grow this
 * field for real in a follow-up so callers elsewhere in the codebase can
 * import it directly instead of relying on structural typing.
 */
export interface SyncResultWithFetchFailures extends SyncResult {
  /**
   * Count of selected messages whose fetch/parse failed and were skipped
   * rather than aborting the whole run (e.g. a 404 from a message deleted
   * between listing and fetching). Does not include MailboxAuthError, which
   * always propagates instead of being counted.
   */
  fetchFailures: number
}

async function collectHistoryIds(
  client: GmailClient,
  startHistoryId: string,
  cap: number,
): Promise<{ ids: string[]; historyId: string | null; hasMore: boolean }> {
  const ids: string[] = []
  let pageToken: string | undefined
  let historyId: string | null = null

  do {
    const page = await client.listHistory(startHistoryId, pageToken)
    ids.push(...page.messageIds)
    if (page.historyId) historyId = page.historyId
    pageToken = page.nextPageToken ?? undefined
  } while (pageToken && ids.length < cap)

  // `pageToken` is truthy here only if the loop stopped because it hit the
  // cap while a page still had more results waiting — i.e. pagination was
  // cut short, not exhausted. Do not infer this from `ids.length` alone: a
  // count that lands exactly on `cap` looks identical to "done" unless we
  // also track whether a page token was left unconsumed.
  return { ids, historyId, hasMore: Boolean(pageToken) }
}

async function collectQueryIds(
  client: GmailClient,
  query: string,
  cap: number,
): Promise<{ ids: string[]; hasMore: boolean }> {
  const ids: string[] = []
  let pageToken: string | undefined

  do {
    const page = await client.listMessages(query, pageToken)
    ids.push(...page.messageIds)
    pageToken = page.nextPageToken ?? undefined
  } while (pageToken && ids.length < cap)

  return { ids, hasMore: Boolean(pageToken) }
}

export async function syncMailbox(
  client: GmailClient,
  account: MailboxAccount,
  opts: SyncOptions = {},
): Promise<SyncResultWithFetchFailures> {
  const cap = opts.maxMessages ?? DEFAULT_MAX_MESSAGES

  let messageIds: string[] = []
  let historyId: string | null = null
  let usedFallback = false
  let hasMore = false

  if (account.syncCursor) {
    try {
      const walked = await collectHistoryIds(client, account.syncCursor, cap)
      messageIds = walked.ids
      historyId = walked.historyId
      hasMore = walked.hasMore
    } catch (error) {
      if (!(error instanceof MailboxHistoryExpiredError)) throw error
      usedFallback = true
    }
  } else {
    usedFallback = true
  }

  if (usedFallback) {
    // Scope-constrained even here. An expired cursor must never widen what
    // we are allowed to see.
    const query = buildScopeQuery(
      account.scopeMode,
      account.scopeValue,
      opts.fallbackAfterDate,
    )
    const walked = await collectQueryIds(client, query, cap)
    messageIds = walked.ids
    hasMore = walked.hasMore

    // Re-anchor on the mailbox's current historyId so the NEXT run is
    // incremental again.
    historyId = (await client.getProfile()).historyId
  }

  // `hasMore` catches the exact-cap boundary (a page landed precisely on
  // `cap` with a page token still pointing at more results); the length
  // check catches the case a single oversized page pushed us past `cap` in
  // one shot. Neither alone is sufficient — see sync.test.ts for the
  // boundary case this guards against.
  const truncated = hasMore || messageIds.length > cap
  const selected = messageIds.slice(0, cap)

  const messages: ParsedMessage[] = []
  let fetchFailures = 0
  for (const id of selected) {
    let parsed: ParsedMessage
    try {
      parsed = parseGmailMessage(await client.getMessage(id))
    } catch (error) {
      // An auth failure means every subsequent fetch will fail too — let it
      // propagate rather than burning through the rest of the batch.
      if (error instanceof MailboxAuthError) throw error

      // Anything else (most commonly a 404 — the message was deleted
      // between listing and fetching) is a per-message problem, not a
      // batch-ending one. Skip it and keep going so one poison message
      // can't permanently block this mailbox's sync. Log only the Gmail
      // message id (an opaque identifier) — never the body, subject, or
      // any address.
      fetchFailures++
      console.error(
        `mailbox sync: skipping unfetchable message ${id}`,
        error instanceof Error ? error.message : String(error),
      )
      continue
    }

    if (isInScope(parsed, account.scopeMode, account.scopeValue)) {
      messages.push(parsed)
    }
  }

  // On a truncated HISTORY run, hold the cursor — the next run re-walks
  // from the same point and picks up the remainder.
  //
  // On a truncated FALLBACK run we cannot hold it: the cursor is null or
  // stale, so holding it would re-fetch the same newest N forever and
  // never advance. The cursor moves to the mailbox's current historyId and
  // the caller must trigger a backfill, which paginates properly with page
  // tokens, to cover what the cap dropped.
  //
  // Trade-off this hold accepts: if a mailbox's first `cap` history events
  // are ALL out-of-scope, a capped HISTORY run holds the same cursor every
  // time and re-walks the identical window forever without advancing.
  // Changing the hold rule to dodge that would risk skipping mail on a
  // normal capped run, which is worse than wasted work, so it stays as-is.
  // The mitigation lives one level up, in the caller: trigger a backfill on
  // ANY truncated run (history OR fallback), not only a fallback one. The
  // backfill paginates properly with page tokens and is idempotent against
  // inbox_messages' unique index, so it makes forward progress even in the
  // all-out-of-scope stall case the incremental walk cannot resolve on its
  // own. See Task 15 (the sync job) for where this gets wired up.
  const holdCursor = truncated && !usedFallback

  let nextCursor: string
  if (holdCursor) {
    nextCursor = account.syncCursor as string
  } else {
    const resolved = historyId ?? account.syncCursor
    if (!resolved) {
      // Neither a fresh historyId nor a previous cursor is available to
      // persist. This should be unreachable in practice (the history path
      // requires a truthy syncCursor to start, and the fallback path always
      // re-anchors from getProfile()), but silently emitting '' here would
      // look like "no cursor" to the next run and force an unnecessary full
      // bootstrap. Fail loudly instead of masking a state that should be
      // impossible.
      throw new Error(
        `syncMailbox: unable to determine a next cursor for mailbox ${account.id}`,
      )
    }
    nextCursor = resolved
  }

  return { messages, nextCursor, usedFallback, truncated, fetchFailures }
}
