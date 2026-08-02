/**
 * Gmail send over plain fetch — same rationale as client.ts: no googleapis
 * SDK, no MIME library. `packages/mailbox` has zero dependencies and this
 * file must not change that.
 */

import { MailboxAuthError } from './types'

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

/**
 * Encode a header value as RFC 2047 when it contains non-ASCII, so a subject
 * like "Grünanlage" is not mangled or silently dropped by a relay. Left
 * alone when plain ASCII so the common case stays human-readable in the raw
 * message.
 */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

/**
 * Reject CR/LF in any header value.
 *
 * The subject originates from a language model and is then editable by a
 * human — untrusted twice over. Without this check, a crafted subject (or
 * any other interpolated header) could inject a `Bcc:` line and silently
 * copy an outbound reply — containing a resident's balance, violation
 * history, or ARC decision — to an arbitrary address. The HOA would never
 * know. Every header value interpolated below must go through this first.
 */
function assertNoHeaderInjection(field: string, value: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`buildRawMessage: ${field} must not contain CR or LF`)
  }
}

export function buildRawMessage(opts: {
  from: string
  to: string[]
  subject: string
  body: string
  inReplyTo: string | null
  references: string[]
}): string {
  assertNoHeaderInjection('subject', opts.subject)
  assertNoHeaderInjection('from', opts.from)
  for (const to of opts.to) assertNoHeaderInjection('to', to)
  if (opts.inReplyTo) assertNoHeaderInjection('inReplyTo', opts.inReplyTo)
  for (const ref of opts.references) assertNoHeaderInjection('references', ref)

  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(', ')}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ]

  // Omitted entirely when absent — an empty `In-Reply-To:` header is invalid
  // and some relays reject the whole message rather than just the header.
  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`)
  if (opts.references.length > 0) headers.push(`References: ${opts.references.join(' ')}`)

  const message = `${headers.join('\r\n')}\r\n\r\n${opts.body}`

  // Base64url, not base64: the Gmail API rejects `+`, `/`, and `=` in the
  // `raw` field.
  return Buffer.from(message, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Send via the Gmail API. `threadId` files the reply into the same
 * conversation on the HOA's side; In-Reply-To/References (already baked
 * into `raw` by buildRawMessage) do the same on the resident's side. Both
 * are needed — Gmail's threadId alone does not set the RFC headers that
 * other mail clients use to thread.
 *
 * Deliberately no retry, unlike GmailClient.request: this call is not
 * idempotent, and retrying after an ambiguous failure (e.g. a timeout where
 * the send may have already succeeded) risks sending a resident the same
 * reply twice. The caller records the failure and a human decides whether
 * to resend.
 */
export async function sendReply(
  accessToken: string,
  threadId: string,
  raw: string,
): Promise<{ messageId: string; threadId: string }> {
  const response = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw, threadId }),
  })

  // Same mapping as GmailClient: dead credentials must surface distinctly
  // so the caller can mark the mailbox as needing reconnection rather than
  // treating this as a transient blip.
  if (response.status === 401 || response.status === 403) {
    throw new MailboxAuthError(`Gmail rejected the send: ${response.status}`)
  }
  if (!response.ok) {
    throw new Error(`sendReply: Gmail returned ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as { id?: string; threadId?: string }
  if (!payload.id) {
    throw new Error('sendReply: Gmail response contained no message id')
  }
  return { messageId: payload.id, threadId: payload.threadId ?? threadId }
}
