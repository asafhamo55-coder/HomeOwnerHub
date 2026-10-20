/**
 * BL-101 A8 — the pure half of "Save to documents" on an inbox attachment
 * (the action is lib/inbox/attachment-file.ts).
 *
 * Provenance column: `hoa_documents.source_inbox_attachment_id` (plan item
 * B5) is in migration 0067 (not 0065, which never included inbox Phase B)
 * and is written only once M3_APPLIED. Independently of it:
 *   - the "from email, <date>" provenance goes in the document NAME, the
 *     only free-text field the table has;
 *   - the copy lands at a path derived from the attachment id, so filing
 *     the same attachment twice collides in storage and is refused, rather
 *     than quietly making a second copy.
 *
 * Pure, unit-tested.
 */

import { INBOX_CONFIRMED_GOVERNING_SEGMENT, INBOX_FILED_SEGMENT } from '@/lib/documents-rules'

const SEGMENT = /^[A-Za-z0-9._-]+$/

/**
 * True only for the exact path shape the attachments job mints
 * (packages/jobs/src/mailbox-attachments.ts):
 *   `<orgId>/inbox/<threadId>/<messageId>/<attachmentId>/<safeName>`
 * where safeName is `[A-Za-z0-9._-]` only. Anything else — another org's
 * prefix, a dot segment, a `%`, `#`, `?` or `\` that a URL parser would
 * rewrite — is refused before any storage call, so the copy can only ever
 * read this attachment's own object.
 */
export function inboxAttachmentPathOk(
  path: string,
  expected: { orgId: string; threadId: string; attachmentId: string },
): boolean {
  const segments = path.split('/')
  if (segments.length !== 6) return false
  if (segments.some((s) => !SEGMENT.test(s) || s === '.' || s === '..')) return false
  const [org, literal, thread, , attachment] = segments
  return (
    org === expected.orgId &&
    literal === 'inbox' &&
    thread === expected.threadId &&
    attachment === expected.attachmentId
  )
}

/**
 * Where the library copy goes. One attachment, one possible copy of each
 * kind: a board-confirmed governing document is stored one level deeper
 * (`…/governing/<name>`), which is what lets AI retrieval tell it apart
 * from any other file a sender emailed in (M-3, isAiEligibleDocumentPath).
 */
export function filedStoragePath(
  orgId: string,
  attachmentId: string,
  sourcePath: string,
  options: { confirmedGoverning?: boolean } = {},
): string {
  const name = sourcePath.split('/').pop() || attachmentId
  const base = `${orgId}/${INBOX_FILED_SEGMENT}/${attachmentId}`
  return options.confirmedGoverning ? `${base}/${INBOX_CONFIRMED_GOVERNING_SEGMENT}/${name}` : `${base}/${name}`
}

/**
 * M-3: filing from the inbox defaults to "Other". A governing type (CC&R,
 * bylaws, rules) is published to every resident and cited by the AI, so it
 * needs the board's explicit confirmation that this is the association's
 * official governing document.
 */
export const GOVERNING_CONFIRM_LABEL = 'I confirm this is our official governing document'
export const GOVERNING_CONFIRM_REQUIRED = 'Confirm this is your official governing document, or file it as Other.'

export const MAX_DOCUMENT_NAME = 200

/**
 * "Insurance certificate (from email, 2026-10-20)". The date is the day
 * the email arrived (UTC calendar day), or nothing when it is unknown.
 */
export function filedDocumentName(name: string, receivedAt: string | null): string {
  const day = receivedAt && /^\d{4}-\d{2}-\d{2}/.test(receivedAt) ? receivedAt.slice(0, 10) : null
  const suffix = day ? ` (from email, ${day})` : ' (from email)'
  return `${name.trim().slice(0, MAX_DOCUMENT_NAME - suffix.length)}${suffix}`
}

/** The display name the dialog suggests: the file name without its extension. */
export function suggestedDocumentName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim()
}

/** Storage's "already exists" answer to a copy onto an occupied path. */
export function isAlreadyExistsError(error: { message?: string; statusCode?: string | number } | null): boolean {
  if (!error) return false
  return String(error.statusCode ?? '') === '409' || /already exists|duplicate/i.test(error.message ?? '')
}
