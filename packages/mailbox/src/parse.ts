/**
 * Gmail payload → ParsedMessage.
 *
 * messages.get?format=full returns an ALREADY-PARSED MIME tree: each part
 * carries a mimeType, headers, and either base64url body.data (inline
 * content) or body.attachmentId (fetch separately). So this is a tree
 * walk, not a MIME parser.
 *
 * Body selection: first text/plain wins for bodyText, first text/html for
 * bodyHtml. "First" is depth-first, which matches how mail clients order
 * multipart/alternative (simplest representation first).
 */

import type { ParsedAttachment, ParsedMessage } from './types'
import { htmlToText } from './html'
import { stripQuotedReply } from './quote'

export interface GmailHeader {
  name: string
  value: string
}

export interface GmailPart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: GmailPart[]
}

export interface GmailApiMessage {
  id: string
  threadId: string
  labelIds?: string[]
  internalDate?: string
  payload?: GmailPart
}

export function decodeBase64Url(data: string): string {
  if (!data) return ''
  return Buffer.from(data, 'base64url').toString('utf8')
}

function header(headers: GmailHeader[] | undefined, name: string): string | null {
  const hit = headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
  return hit?.value ?? null
}

/** All values for a header that may legitimately repeat (Delivered-To). */
function headerAll(headers: GmailHeader[] | undefined, name: string): string[] {
  return (headers ?? [])
    .filter((h) => h.name.toLowerCase() === name.toLowerCase())
    .map((h) => h.value)
}

/**
 * Split an address list on commas that are NOT inside double quotes.
 * `"Chen, Mei" <m@x.com>, other@y.com` must yield two addresses, not three.
 */
function splitAddressList(raw: string | null): string[] {
  if (!raw) return []
  const out: string[] = []
  let current = ''
  let inQuotes = false

  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes
    if (ch === ',' && !inQuotes) {
      out.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  out.push(current)

  return out.map((s) => s.trim()).filter((s) => s !== '')
}

export function parseAddress(raw: string): { email: string | null; name: string | null } {
  const trimmed = raw.trim()

  // "Display Name" <a@b.com>  |  Display Name <a@b.com>
  const angled = trimmed.match(/^(.*?)<([^>]+)>\s*$/)
  if (angled) {
    const name = angled[1].trim().replace(/^"(.*)"$/, '$1').trim()
    return { email: angled[2].trim().toLowerCase(), name: name === '' ? null : name }
  }

  // bare a@b.com — but only if it's actually a plausible address. A
  // malformed angle-bracket form like `Name <a@b.com` (no closing `>`)
  // falls through here too; without this check the whole raw string
  // (display name and all) would be returned as `email`.
  if (/^[^\s<>]+@[^\s<>]+$/.test(trimmed)) {
    return { email: trimmed.toLowerCase(), name: null }
  }
  return { email: null, name: trimmed === '' ? null : trimmed }
}

function addressEmails(raw: string | null): string[] {
  return splitAddressList(raw)
    .map((entry) => parseAddress(entry).email)
    .filter((e): e is string => e !== null)
}

function isInlinePart(part: GmailPart): boolean {
  const disposition = header(part.headers, 'Content-Disposition') ?? ''
  if (disposition.toLowerCase().startsWith('inline')) return true
  // Some senders omit Content-Disposition but set Content-ID for cid: refs.
  return header(part.headers, 'Content-ID') !== null
}

interface WalkState {
  bodyText: string | null
  bodyHtml: string | null
  attachments: ParsedAttachment[]
}

function walk(part: GmailPart | undefined, state: WalkState): void {
  if (!part) return

  const mime = (part.mimeType ?? '').toLowerCase()
  const hasFilename = Boolean(part.filename && part.filename !== '')

  if (part.parts && part.parts.length > 0) {
    for (const child of part.parts) walk(child, state)
    return
  }

  if (hasFilename || part.body?.attachmentId) {
    state.attachments.push({
      gmailAttachmentId: part.body?.attachmentId ?? null,
      fileName: part.filename && part.filename !== '' ? part.filename : '(unnamed)',
      contentType: part.mimeType ?? null,
      sizeBytes: part.body?.size ?? null,
      isInline: isInlinePart(part),
    })
    return
  }

  if (mime === 'text/plain' && state.bodyText === null && part.body?.data) {
    state.bodyText = decodeBase64Url(part.body.data)
    return
  }
  if (mime === 'text/html' && state.bodyHtml === null && part.body?.data) {
    state.bodyHtml = decodeBase64Url(part.body.data)
  }
}

/**
 * The text/plain part when the sender provided one, otherwise the HTML
 * part converted to text.
 *
 * Apple Mail on iOS sends HTML-ONLY replies — no multipart/alternative
 * text branch at all. Leaving bodyText null for those loses the message
 * body everywhere downstream (thread view, reply drafter, property
 * matching), so a derived body is strictly better than none.
 *
 * A derived body that comes out empty stays null rather than becoming
 * '': an image-only marketing mail genuinely has no text, and "(no body)"
 * is the honest rendering for it.
 */
function resolveBodyText(state: WalkState): string | null {
  if (state.bodyText !== null) return state.bodyText
  if (state.bodyHtml === null) return null
  const derived = htmlToText(state.bodyHtml)
  return derived === '' ? null : derived
}

export function parseGmailMessage(raw: GmailApiMessage): ParsedMessage {
  const headers = raw.payload?.headers
  const state: WalkState = { bodyText: null, bodyHtml: null, attachments: [] }
  walk(raw.payload, state)

  const bodyText = resolveBodyText(state)

  const from = parseAddress(header(headers, 'From') ?? '')

  const referencesRaw = header(headers, 'References') ?? ''
  const references = referencesRaw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')

  // Date's valid range is ±8.64e15 ms from the epoch; Number.isFinite alone
  // lets larger-but-finite values through, and `new Date(n).toISOString()`
  // throws RangeError past that bound. A corrupt internalDate must degrade
  // to sentAt: null, not crash the whole sync run.
  const MAX_SAFE_DATE_MS = 8_640_000_000_000_000
  const internal = raw.internalDate ? Number.parseInt(raw.internalDate, 10) : NaN
  const sentAtMs =
    Number.isFinite(internal) && Math.abs(internal) <= MAX_SAFE_DATE_MS ? internal : null

  return {
    gmailMessageId: raw.id,
    gmailThreadId: raw.threadId,
    rfc822MessageId: header(headers, 'Message-ID'),
    inReplyTo: header(headers, 'In-Reply-To'),
    references,

    fromEmail: from.email,
    fromName: from.name,
    toEmails: addressEmails(header(headers, 'To')),
    ccEmails: addressEmails(header(headers, 'Cc')),
    deliveredTo: headerAll(headers, 'Delivered-To').flatMap((v) => addressEmails(v)),

    subject: header(headers, 'Subject'),
    bodyText,
    bodyHtml: state.bodyHtml,
    strippedText: stripQuotedReply(bodyText),

    attachments: state.attachments,
    sentAt: sentAtMs !== null ? new Date(sentAtMs).toISOString() : null,
    labelIds: raw.labelIds ?? [],
  }
}
