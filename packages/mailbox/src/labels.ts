/**
 * Gmail label state — the path by which "I cleaned that up in Gmail"
 * reaches HomeownerHub.
 *
 * Before this module, the mailbox integration was append-only: sync
 * captured a message once and nothing ever reconciled what the board did
 * to it afterwards. `client.listHistory` deliberately asks Gmail for
 * `messageAdded` only, `parseGmailMessage` produced `labelIds` that
 * nothing persisted, and `buildScopeQuery` never constrained to
 * `in:inbox` — so archiving a thread, filing it into a folder, or
 * trashing it was invisible here, and the backfill would happily re-fetch
 * mail that had been filed away months earlier. A board that kept its
 * Gmail tidy saw a HomeownerHub inbox that only ever grew.
 *
 * Two derivations live here, both pure, because the states they produce
 * are written from three different places (live ingest, the reconcile
 * job, and the one-off backfill script) and must agree exactly. A
 * disagreement between them shows up as mail that reappears after being
 * hidden, or worse, mail that vanishes from the queue without the board
 * ever having filed it.
 */

/** Gmail's own reserved label ids. */
export const GMAIL_INBOX_LABEL = 'INBOX'
export const GMAIL_TRASH_LABEL = 'TRASH'
export const GMAIL_SPAM_LABEL = 'SPAM'

/**
 * Where one message currently sits in Gmail.
 *
 * `unknown` is the pre-observation state and is NOT a synonym for
 * `archived`. Every message ingested before this feature existed starts
 * here, and the whole UI treats `unknown` as visible — hiding mail whose
 * Gmail state we have never actually looked at would be inventing a
 * cleanup the board never performed. It is the fail-open default, on
 * purpose, and the backfill script exists to convert it into a real
 * observation rather than letting the app guess.
 *
 * `deleted` is distinct from `trashed`: Gmail reported the message
 * permanently gone (a `messagesDeleted` history record, or a 404 on
 * re-fetch), so there are no labels left to read. Both hide, but only one
 * of them is recoverable by the board emptying its own trash, and
 * collapsing them would make that undiagnosable.
 */
export type GmailMessageState = 'unknown' | 'inbox' | 'archived' | 'trashed' | 'deleted'

/** What a message state can be when Gmail actually returned labels for it. */
export type ObservedGmailMessageState = Extract<
  GmailMessageState,
  'inbox' | 'archived' | 'trashed'
>

/**
 * Where a whole thread sits, which is what the inbox list filters on.
 *
 * `active` rather than `inbox` deliberately: a thread is live when ANY of
 * its inbound mail is still in the Gmail inbox, which is a property of the
 * conversation, not of a single message.
 */
export type GmailThreadState = 'unknown' | 'active' | 'archived' | 'trashed'

/** Thread states that drop out of the working inbox. */
export const HIDDEN_GMAIL_THREAD_STATES: readonly GmailThreadState[] = ['archived', 'trashed']

/**
 * Classify one message from the labels Gmail last returned for it.
 *
 * TRASH and SPAM are checked BEFORE INBOX rather than after. In today's
 * Gmail a trashed message has already lost INBOX so the order is usually
 * moot, but SPAM is the case that isn't: mail auto-filed as spam can
 * still carry INBOX in the label set on some accounts, and reading that
 * as "live in the inbox" would push spam into a board's triage queue —
 * the exact opposite of what the board sees in Gmail. When the two
 * conflict, the more-hidden classification wins.
 */
export function messageStateFromLabels(labelIds: string[]): ObservedGmailMessageState {
  if (labelIds.includes(GMAIL_TRASH_LABEL) || labelIds.includes(GMAIL_SPAM_LABEL)) {
    return 'trashed'
  }
  if (labelIds.includes(GMAIL_INBOX_LABEL)) return 'inbox'

  // No INBOX and no TRASH: archived, or filed into a user folder. Gmail
  // does not distinguish those two — "move to folder" IS "add label +
  // remove INBOX" — so neither can this.
  return 'archived'
}

/** The per-message facts `threadStateFromMessages` reads. */
export interface ThreadMessageState {
  direction: 'inbound' | 'outbound'
  gmailState: GmailMessageState
}

/**
 * Roll a thread's messages up into the state the inbox list filters on.
 *
 * Only INBOUND messages count, and this is the subtle part. A message the
 * HOA sent carries SENT and never carries INBOX, so counting outbound mail
 * would classify every thread the HOA started — every vendor request, every
 * unanswered outbound reply — as `archived` the instant it was sent, and
 * hide it. That would silently gut the `awaiting_resident` filter, whose
 * entire population is threads whose newest message is outbound. Gmail
 * itself behaves this way: a sent thread with no reply is not in your
 * inbox either. The difference is that HomeownerHub's inbox is a work
 * queue, not a mail client, and work the board is waiting on must stay
 * visible.
 *
 * A thread with no OBSERVED inbound message is `unknown`, never
 * `archived`. That covers both a thread that predates this feature and an
 * outbound-only thread, and in both cases the honest answer is "we have
 * not looked", which the UI renders as visible.
 *
 * `trashed` requires EVERY observed inbound message to be trashed or
 * deleted. A thread where one message was trashed and another was merely
 * filed is `archived` — the weaker claim, because it is the one the
 * evidence supports.
 */
export function threadStateFromMessages(messages: ThreadMessageState[]): GmailThreadState {
  const observed = messages.filter(
    (message) => message.direction === 'inbound' && message.gmailState !== 'unknown',
  )
  if (observed.length === 0) return 'unknown'

  if (observed.some((message) => message.gmailState === 'inbox')) return 'active'

  if (
    observed.every(
      (message) => message.gmailState === 'trashed' || message.gmailState === 'deleted',
    )
  ) {
    return 'trashed'
  }

  return 'archived'
}
