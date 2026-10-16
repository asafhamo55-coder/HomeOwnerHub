/**
 * Which association documents a resident may see (BL-049).
 *
 * Neither document table has a visibility column (hoa_documents: id,
 * org_id, name, type, storage_path, …; governing_documents: type, title,
 * effective_date, superseded_at, ai_generated, …), and RLS cannot tell the
 * two apart: 0063 makes both tables — and their storage objects — readable
 * by every member of the org, residents included. So the rule lives here,
 * as an explicit allowlist of document TYPES, and it is default-deny:
 *
 *   hoa_documents        ccr, bylaws, rules
 *   governing_documents  declaration, bylaws, rules, amendment, policy
 *                        (current only — superseded_at IS NULL — and not
 *                        ai_generated, which would be an unreviewed draft)
 *
 * Everything else is hidden, including any type added later:
 *   - hoa "other" is the catch-all a board files anything under — legal
 *     correspondence, collection letters, contracts — so it never shows;
 *   - "minutes" (both tables) carry no approved/draft flag, so they could
 *     be a draft; meetings have their own surface;
 *   - "state_statute" is not an association document.
 *
 * Consequence: an official record filed as "other" (budget, insurance,
 * contracts list …) is NOT posted for owners. Posting those needs a
 * board-set visibility flag, i.e. a migration — out of scope here.
 *
 * Pure module, relative imports only (the integration suite imports it).
 */

export type DocSource = 'hoa' | 'governing'

export const RESIDENT_VISIBLE_TYPES: Readonly<Record<DocSource, readonly string[]>> = {
  hoa: ['ccr', 'bylaws', 'rules'],
  governing: ['declaration', 'bylaws', 'rules', 'amendment', 'policy'],
}

export interface VisibilityInput {
  source: DocSource
  type: string
  /** governing_documents.ai_generated. */
  aiGenerated?: boolean | null
  /** governing_documents.superseded_at IS NOT NULL. */
  superseded?: boolean
}

export function isResidentVisible(doc: VisibilityInput): boolean {
  if (doc.superseded === true) return false
  if (doc.aiGenerated === true) return false
  const allowed = Object.prototype.hasOwnProperty.call(RESIDENT_VISIBLE_TYPES, doc.source)
    ? RESIDENT_VISIBLE_TYPES[doc.source]
    : []
  return allowed.includes(doc.type)
}

/** Visible AND there is a stored file to open. */
export function canResidentOpen(doc: VisibilityInput & { storagePath: string | null | undefined }): boolean {
  return isResidentVisible(doc) && typeof doc.storagePath === 'string' && doc.storagePath.trim() !== ''
}

/** Storage bucket per source table. */
export const DOCUMENT_BUCKET: Readonly<Record<DocSource, string>> = {
  hoa: 'hoa-documents',
  governing: 'governing-docs',
}

/** The owner-facing link for one document (route handler under /resident/documents). */
export function residentDocumentHref(doc: { source: DocSource; id: string }): string {
  return `/resident/documents/${doc.source}/${doc.id}`
}
