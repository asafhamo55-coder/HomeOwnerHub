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

async function collectHistoryIds(
  client: GmailClient,
  startHistoryId: string,
  cap: number,
): Promise<{ ids: string[]; historyId: string | null }> {
  const ids: string[] = []
  let pageToken: string | undefined
  let historyId: string | null = null

  do {
    const page = await client.listHistory(startHistoryId, pageToken)
    ids.push(...page.messageIds)
    if (page.historyId) historyId = page.historyId
    pageToken = page.nextPageToken ?? undefined
  } while (pageToken && ids.length < cap)

  return { ids, historyId }
}

async function collectQueryIds(
  client: GmailClient,
  query: string,
  cap: number,
): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined

  do {
    const page = await client.listMessages(query, pageToken)
    ids.push(...page.messageIds)
    pageToken = page.nextPageToken ?? undefined
  } while (pageToken && ids.length < cap)

  return ids
}

export async function syncMailbox(
  client: GmailClient,
  account: MailboxAccount,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  const cap = opts.maxMessages ?? DEFAULT_MAX_MESSAGES

  let messageIds: string[] = []
  let historyId: string | null = null
  let usedFallback = false

  if (account.syncCursor) {
    try {
      const walked = await collectHistoryIds(client, account.syncCursor, cap)
      messageIds = walked.ids
      historyId = walked.historyId
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
    messageIds = await collectQueryIds(client, query, cap)

    // Re-anchor on the mailbox's current historyId so the NEXT run is
    // incremental again.
    historyId = (await client.getProfile()).historyId
  }

  const truncated = messageIds.length > cap
  const selected = messageIds.slice(0, cap)

  const messages: ParsedMessage[] = []
  for (const id of selected) {
    const parsed = parseGmailMessage(await client.getMessage(id))
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
  const holdCursor = truncated && !usedFallback

  const nextCursor = holdCursor
    ? (account.syncCursor as string)
    : (historyId ?? account.syncCursor ?? '')

  return { messages, nextCursor, usedFallback, truncated }
}
