/**
 * Ask Gmail what is *currently* in the mailbox, so HomeownerHub can stop
 * showing mail the board already filed away.
 *
 * Why a snapshot rather than history events: Gmail's history stream does
 * carry `labelAdded`/`labelRemoved`, and consuming it would be the
 * cheapest possible incremental update. But it inherits every failure mode
 * of a cursor — it expires after ~7 days, it has to be paginated under a
 * cap, and `sync.ts` already documents the stall that cap can produce (a
 * window whose events are all irrelevant re-walks forever without
 * advancing). A mass cleanup — a board finally filing two thousand old
 * emails, which is precisely when this feature matters most — is exactly
 * the input that triggers that stall. So label state is derived from two
 * stateless list queries instead. There is no cursor to expire, nothing to
 * resume, and a run that fails simply produces no snapshot and changes
 * nothing; the next run starts clean.
 *
 * THE FAIL-SAFE. `complete` is the whole safety story of this module.
 * Deriving "archived" means deriving it from ABSENCE — a stored message
 * that does not appear in the inbox set is treated as filed away. Absence
 * is only meaningful if the set is whole, so a snapshot that hit its page
 * cap, or whose second query failed after the first succeeded, sets
 * `complete: false` and callers MUST NOT apply it. Applying a truncated
 * snapshot would mark every message past the cap as archived and hide a
 * board's entire live inbox in one run. Never relax this into a "best
 * effort" partial apply.
 *
 * Known limitation, deliberately not solved here: a message PERMANENTLY
 * deleted from Gmail (trash emptied) is absent from both queries and is
 * therefore classified `archived`, not `deleted`. Telling those apart
 * needs a third full pass over `in:anywhere` — doubling the quota cost of
 * every run to distinguish two states that both hide the thread and both
 * keep the row. The `deleted` state stays in the model because a targeted
 * re-fetch CAN establish it (a 404 is unambiguous), and because conflating
 * the two in the schema would make that unrecoverable later.
 */

import type { GmailClient } from './client'
import { buildScopeQuery } from './scope'
import type { ObservedGmailMessageState } from './labels'
import type { MailboxAccount } from './types'

/**
 * Gmail's own per-page maximum for `messages.list`. Requested explicitly
 * rather than left to the API default (100 today, but not contractually)
 * so `maxPages` below means a predictable number of messages.
 */
const PAGE_SIZE = 100

/**
 * Ceiling on pages per query — 50 × 100 = 5,000 messages in the Gmail
 * inbox before this gives up and reports the snapshot incomplete.
 *
 * Chosen as "far past any mailbox this feature can help". The whole
 * premise is a board that files its mail; a mailbox sitting on more than
 * five thousand un-filed inbox messages has a different problem, and
 * scanning it every run would burn quota for a divergence it does not
 * have. Hitting this is reported loudly rather than silently degrading —
 * see the caller, which records it on `sync_error`.
 */
const DEFAULT_MAX_PAGES = 50

export interface ReconcileOptions {
  /** Page ceiling per query. See DEFAULT_MAX_PAGES for why one exists. */
  maxPages?: number
}

export interface GmailStateSnapshot {
  /** Gmail message ids currently carrying INBOX, within the account's scope. */
  inboxIds: Set<string>
  /** Gmail message ids currently in Trash, within the account's scope. */
  trashIds: Set<string>
  /**
   * False when either query was cut short. A caller that applies an
   * incomplete snapshot will archive live mail — see the module comment.
   */
  complete: boolean
  /** Total pages fetched across both queries, for cost logging. */
  pagesFetched: number
}

async function collectIds(
  client: GmailClient,
  query: string,
  maxPages: number,
): Promise<{ ids: Set<string>; complete: boolean; pages: number }> {
  const ids = new Set<string>()
  let pageToken: string | undefined
  let pages = 0

  do {
    const page = await client.listMessages(query, pageToken, PAGE_SIZE)
    for (const id of page.messageIds) ids.add(id)
    pageToken = page.nextPageToken ?? undefined
    pages++
  } while (pageToken && pages < maxPages)

  // A page token still in hand means the walk stopped at the cap with
  // results outstanding — the set is a prefix, not the whole truth.
  return { ids, complete: !pageToken, pages }
}

/**
 * Read the account's current Gmail inbox and trash membership.
 *
 * Both queries carry the account's scope clause. That is not an
 * optimization — an unscoped query would return mail this HOA is not
 * permitted to see (see scope.ts: shared board mailboxes frequently live
 * inside somebody's personal Gmail), and the ids alone would leak which
 * personal messages exist.
 */
export async function fetchGmailStateSnapshot(
  client: GmailClient,
  account: Pick<MailboxAccount, 'scopeMode' | 'scopeValue'>,
  opts: ReconcileOptions = {},
): Promise<GmailStateSnapshot> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES
  const scope = buildScopeQuery(account.scopeMode, account.scopeValue)

  // `in:inbox` / `in:trash` rather than `label:INBOX` — Gmail excludes
  // trash and spam from ordinary searches, so the trash side needs the
  // explicit `in:` operator to return anything at all.
  const inboxQuery = scope ? `${scope} in:inbox` : 'in:inbox'
  const trashQuery = scope ? `${scope} in:trash` : 'in:trash'

  const inbox = await collectIds(client, inboxQuery, maxPages)
  const trash = await collectIds(client, trashQuery, maxPages)

  return {
    inboxIds: inbox.ids,
    trashIds: trash.ids,
    // Both halves must be whole. A complete inbox set paired with a
    // truncated trash set would misclassify trashed mail as archived —
    // less catastrophic than the reverse, but still a wrong answer
    // derived from a known-partial read.
    complete: inbox.complete && trash.complete,
    pagesFetched: inbox.pages + trash.pages,
  }
}

/**
 * Classify one stored message against a snapshot.
 *
 * Callers must check `snapshot.complete` first — this function cannot,
 * because it has no way to signal refusal for a single id, and returning
 * a plausible-looking `archived` from a truncated snapshot is exactly the
 * failure the flag exists to prevent.
 */
export function resolveMessageState(
  gmailMessageId: string,
  snapshot: GmailStateSnapshot,
): ObservedGmailMessageState {
  if (snapshot.inboxIds.has(gmailMessageId)) return 'inbox'
  if (snapshot.trashIds.has(gmailMessageId)) return 'trashed'
  return 'archived'
}
