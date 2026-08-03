/**
 * Gmail send over plain fetch — same rationale as client.ts: no googleapis
 * SDK, no MIME library. `packages/mailbox` has zero dependencies and this
 * file must not change that.
 */

import { randomBytes } from 'node:crypto'
import { MailboxAuthError, type OutboundAttachment } from './types'

const GMAIL_UPLOAD_SEND_URL =
  'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart'

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

/**
 * A filename is interpolated into two header parameters below
 * (`name=` and `filename=`), so it is exactly as dangerous as any other
 * header value — see assertNoHeaderInjection's docstring. A double quote
 * would terminate the quoted-string early and let the rest of the filename
 * be read as further parameters, so it is REJECTED rather than escaped:
 * escaping is easy to get subtly wrong, and no legitimate HOA document is
 * named with a quote in it.
 */
function assertSafeFileName(name: string): void {
  assertNoHeaderInjection('fileName', name)
  if (name.includes('"')) {
    throw new Error('buildMimeMessage: fileName must not contain a double quote')
  }
  if (name.trim() === '') {
    throw new Error('buildMimeMessage: fileName must not be empty')
  }
}

/**
 * Random per message. The `-` and `_` characters cannot appear in standard
 * base64 output, so an attachment part can never contain the delimiter; the
 * BODY still can, which is what the assertion in buildMimeMessage covers.
 */
function makeBoundary(): string {
  return `----=_HH_${randomBytes(16).toString('hex')}`
}

function base64Lines(bytes: Buffer): string {
  return (bytes.toString('base64').match(/.{1,76}/g) ?? []).join('\r\n')
}

/**
 * A part containing the delimiter would forge MIME structure — a crafted
 * reply could append an arbitrary extra part. The boundary carries 16 random
 * bytes, so this is astronomically unlikely and unreachable from outside;
 * it is asserted rather than trusted because the failure mode is message
 * forgery, not a rendering glitch.
 *
 * Exported ONLY so the unreachable branch can be tested directly. An
 * untested throw is a throw nobody knows is broken.
 */
export function assertNoBoundaryCollision(parts: string[], boundary: string): void {
  for (const part of parts) {
    if (part.includes(`--${boundary}`)) {
      throw new Error('buildMimeMessage: boundary collision in message content')
    }
  }
}

export function buildMimeMessage(opts: {
  from: string
  to: string[]
  cc?: string[]
  subject: string
  body: string
  inReplyTo: string | null
  references: string[]
  attachments?: OutboundAttachment[]
}): string {
  const cc = opts.cc ?? []

  assertNoHeaderInjection('subject', opts.subject)
  assertNoHeaderInjection('from', opts.from)
  for (const to of opts.to) assertNoHeaderInjection('to', to)
  for (const address of cc) assertNoHeaderInjection('cc', address)
  if (opts.inReplyTo) assertNoHeaderInjection('inReplyTo', opts.inReplyTo)
  for (const ref of opts.references) assertNoHeaderInjection('references', ref)

  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(', ')}`,
  ]
  // Omitted entirely when empty — an empty `Cc:` header is not useful and
  // some relays treat a bare header as malformed.
  if (cc.length > 0) headers.push(`Cc: ${cc.join(', ')}`)
  headers.push(
    `Subject: ${encodeHeader(opts.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  )

  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`)
  if (opts.references.length > 0) headers.push(`References: ${opts.references.join(' ')}`)

  const attachments = opts.attachments ?? []
  for (const file of attachments) assertSafeFileName(file.fileName)

  // No attachments — emit the single-part message unchanged, byte for byte.
  // A golden test pins this: ordinary replies are the overwhelming majority
  // of outbound mail and must not shift because attachments became possible.
  if (attachments.length === 0) {
    return `${headers.join('\r\n')}\r\n\r\n${opts.body}`
  }

  const boundary = makeBoundary()

  const parts = [
    [
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      opts.body,
    ].join('\r\n'),
    ...attachments.map((file) =>
      [
        `Content-Type: ${file.contentType ?? 'application/octet-stream'}; name="${encodeHeader(file.fileName)}"`,
        `Content-Disposition: attachment; filename="${encodeHeader(file.fileName)}"`,
        'Content-Transfer-Encoding: base64',
        '',
        base64Lines(file.bytes),
      ].join('\r\n'),
    ),
  ]

  assertNoBoundaryCollision(parts, boundary)

  // Swap the single-part content headers for the multipart declaration. The
  // 8bit transfer encoding moves onto the body PART; a multipart container
  // must not declare one.
  const multipartHeaders = headers.filter(
    (h) =>
      !h.startsWith('Content-Type: text/plain') &&
      !h.startsWith('Content-Transfer-Encoding:'),
  )
  multipartHeaders.splice(
    multipartHeaders.findIndex((h) => h === 'MIME-Version: 1.0') + 1,
    0,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  )

  const bodyBlock = `--${boundary}\r\n${parts.join(`\r\n--${boundary}\r\n`)}\r\n--${boundary}--`
  return `${multipartHeaders.join('\r\n')}\r\n\r\n${bodyBlock}`
}

/**
 * Send via the Gmail API's UPLOAD endpoint.
 *
 * The plain `messages/send` endpoint takes the message base64url-encoded in
 * a JSON field, which caps the whole request near 5MB — less than a single
 * phone photo. `uploadType=multipart` takes a JSON metadata part plus a
 * `message/rfc822` part and allows 35MB.
 *
 * `threadId` files the message into the same conversation on the HOA's side;
 * In-Reply-To/References (already in `mime` from buildMimeMessage) do the
 * same on the resident's side. Both are needed. `null` omits it, which is
 * what a brand-new conversation requires.
 *
 * Deliberately no retry, unchanged from before: this call is not idempotent,
 * and retrying after an ambiguous failure (a timeout where the send may have
 * already succeeded) risks sending a resident the same reply twice. The
 * caller records the failure and a human decides whether to resend.
 */
export async function sendReply(
  accessToken: string,
  threadId: string | null,
  mime: string,
): Promise<{ messageId: string; threadId: string | null }> {
  const boundary = makeBoundary()
  const metadata = JSON.stringify(threadId ? { threadId } : {})

  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: message/rfc822',
    '',
    mime,
    `--${boundary}--`,
  ].join('\r\n')

  const response = await fetch(GMAIL_UPLOAD_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  // Same mapping as GmailClient: dead credentials must surface distinctly so
  // the caller can mark the mailbox as needing reconnection rather than
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
