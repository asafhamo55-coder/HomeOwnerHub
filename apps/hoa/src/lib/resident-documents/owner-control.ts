/**
 * BL-052 (M1): what the board sees for "Visible to owners" on one document.
 *
 *   'none'    M1 not applied — render nothing (today's page, unchanged)
 *   'always'  an allowlisted type: owners always see it, nothing to switch
 *   'switch'  the board may post it to owners or take it down
 *   'ai'      an AI-generated governing draft: owners never see it, so
 *             there is nothing to switch (0064 RLS excludes it too)
 *
 * With `m1` false the board-facing reads also leave visible_to_owners out
 * of their select (DOC_DETAIL_COLUMNS / GOVERNING_LIST_COLUMNS).
 *
 * Pure: relative imports only.
 */
import { RESIDENT_VISIBLE_TYPES, type DocSource } from './visibility'

export type OwnerControl = 'none' | 'always' | 'switch' | 'ai'

export function ownerVisibilityControl(
  source: DocSource,
  type: string,
  m1: boolean,
  opts: { aiGenerated?: boolean | null } = {},
): OwnerControl {
  if (!m1) return 'none'
  if (opts.aiGenerated === true) return 'ai'
  return RESIDENT_VISIBLE_TYPES[source].includes(type) ? 'always' : 'switch'
}

const DOC_DETAIL_BASE = 'id, name, type, storage_path, file_size, parsed_text, parsed_at, created_at'
const GOVERNING_LIST_BASE = 'id, title, type, effective_date, parsed_at'

/** hoa_documents columns for /documents/[id]. */
export function docDetailColumns(m1: boolean): string {
  return m1 ? `${DOC_DETAIL_BASE}, visible_to_owners` : DOC_DETAIL_BASE
}

/** governing_documents columns for /documents/governing. */
export function governingListColumns(m1: boolean): string {
  return m1 ? `${GOVERNING_LIST_BASE}, ai_generated, visible_to_owners` : GOVERNING_LIST_BASE
}
