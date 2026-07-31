/**
 * Transport-level types. Deliberately free of HOA concepts — no unit,
 * no property, no organization. Mapping to those happens in
 * apps/hoa/src/lib/inbox/.
 */

export interface ParsedAttachment {
  gmailAttachmentId: string | null
  fileName: string
  contentType: string | null
  sizeBytes: number | null
  isInline: boolean
}

export interface ParsedMessage {
  gmailMessageId: string
  gmailThreadId: string
  rfc822MessageId: string | null
  inReplyTo: string | null
  references: string[]

  fromEmail: string | null
  fromName: string | null
  toEmails: string[]
  ccEmails: string[]
  deliveredTo: string[]

  subject: string | null
  bodyText: string | null
  bodyHtml: string | null
  /** bodyText with quoted history removed — what a model should read. */
  strippedText: string | null

  attachments: ParsedAttachment[]
  sentAt: string | null
  labelIds: string[]
}

export type ScopeMode = 'address' | 'label' | 'all'

export interface MailboxAccount {
  id: string
  emailAddress: string
  scopeMode: ScopeMode
  scopeValue: string | null
  syncCursor: string | null
}

export interface SyncResult {
  messages: ParsedMessage[]
  nextCursor: string
  /** True when historyId expired and a date-ranged re-sync was used. */
  usedFallback: boolean
  /**
   * True when maxMessages capped the run. On the history path the cursor is
   * held so the remainder is picked up next time. On the FALLBACK path the
   * cursor must advance (there is no resumable history position), so the
   * caller has to trigger a backfill or the capped-off messages are lost.
   */
  truncated: boolean
  /**
   * Count of selected messages whose fetch/parse failed and were skipped
   * rather than aborting the whole run (e.g. a 404 from a message deleted
   * between listing and fetching). A non-zero value means some messages were
   * permanently skipped, which the caller should surface rather than ignore.
   * Note: differs from `truncated` — truncated means "more mail exists that
   * this run did not fetch", while fetchFailures means "specific messages
   * could not be fetched at all".
   */
  fetchFailures: number
}

export interface OAuthTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: string
  scope: string
}

export class MailboxAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MailboxAuthError'
  }
}

export class MailboxHistoryExpiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MailboxHistoryExpiredError'
  }
}
