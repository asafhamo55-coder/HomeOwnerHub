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

  // bare a@b.com
  if (trimmed.includes('@')) {
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

export function parseGmailMessage(raw: GmailApiMessage): ParsedMessage {
  const headers = raw.payload?.headers
  const state: WalkState = { bodyText: null, bodyHtml: null, attachments: [] }
  walk(raw.payload, state)

  const from = parseAddress(header(headers, 'From') ?? '')

  const referencesRaw = header(headers, 'References') ?? ''
  const references = referencesRaw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')

  const internal = raw.internalDate ? Number.parseInt(raw.internalDate, 10) : NaN

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
    bodyText: state.bodyText,
    bodyHtml: state.bodyHtml,
    strippedText: null, // filled by stripQuotedReply — see Task 8

    attachments: state.attachments,
    sentAt: Number.isFinite(internal) ? new Date(internal).toISOString() : null,
    labelIds: raw.labelIds ?? [],
  }
}
