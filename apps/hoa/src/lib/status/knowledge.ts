import type { StatusTone } from '@homeowner-portal/ui'

/**
 * One vocabulary for the knowledge area (documents, governing docs, state
 * law, Ask the Docs) so the same state reads the same on every page.
 * Feed these to `StatusBadge status tones labels` or `StatusPill`.
 */

// ─── Uploaded documents ───────────────────────────────────────────────

export type DocumentParseStatus = 'parsed' | 'needs_parsing'

export const DOCUMENT_PARSE_TONES: Record<DocumentParseStatus, StatusTone> = {
  parsed: 'success',
  needs_parsing: 'warning',
}

export const DOCUMENT_PARSE_LABELS: Record<DocumentParseStatus, string> = {
  parsed: 'Text ready',
  needs_parsing: 'Needs text',
}

export function documentParseStatus(parsedAt: string | null): DocumentParseStatus {
  return parsedAt ? 'parsed' : 'needs_parsing'
}

/** hoa_documents.type (CHECK: ccr, bylaws, rules, minutes, other). */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ccr: 'CC&Rs',
  bylaws: 'Bylaws',
  rules: 'Rules',
  minutes: 'Minutes',
  other: 'Other',
}

/** governing_documents.type. */
export const GOVERNING_TYPE_LABELS: Record<string, string> = {
  declaration: 'Declaration',
  bylaws: 'Bylaws',
  rules: 'Rules & regulations',
  amendment: 'Amendment',
  policy: 'Policy',
  minutes: 'Minutes',
  state_statute: 'State statute',
}

/** Governing docs: indexed into sections for Ask the Docs, or not yet. */
export type IndexStatus = 'indexed' | 'not_indexed'

export const INDEX_TONES: Record<IndexStatus, StatusTone> = {
  indexed: 'success',
  not_indexed: 'warning',
}

export const INDEX_LABELS: Record<IndexStatus, string> = {
  indexed: 'Indexed',
  not_indexed: 'Not indexed',
}

// ─── State law updates ────────────────────────────────────────────────

export type LawUpdateStatus = 'live' | 'archived'

export const LAW_UPDATE_TONES: Record<LawUpdateStatus, StatusTone> = {
  live: 'success',
  archived: 'neutral',
}

export const LAW_UPDATE_LABELS: Record<LawUpdateStatus, string> = {
  live: 'Live',
  archived: 'Archived',
}

export const LAW_CATEGORY_LABELS: Record<string, string> = {
  meetings: 'Meetings & elections',
  assessments: 'Assessments & dues',
  fines: 'Fines & enforcement',
  enforcement: 'Fines & enforcement',
  foreclosure: 'Liens & foreclosure',
  records: 'Records & access',
  architectural: 'Architectural review',
  fair_housing: 'Fair housing',
  amendments: 'Amendments & governance',
  uncategorized: 'Other',
}

export function lawCategoryLabel(category: string | null | undefined): string | null {
  if (!category) return null
  return LAW_CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ')
}

export type SupportedStateCode = 'GA' | 'FL' | 'CA' | 'TX'

export const STATE_NAMES: Record<SupportedStateCode, string> = {
  GA: 'Georgia',
  FL: 'Florida',
  CA: 'California',
  TX: 'Texas',
}

export const STATE_CODE_LABELS: Record<SupportedStateCode, string> = {
  GA: 'O.C.G.A. Title 44, Ch. 3 (POA / Condominium acts)',
  FL: 'Florida Statutes Ch. 720 (HOA Act) + Ch. 718 (Condominium Act)',
  CA: 'Davis-Stirling Common Interest Development Act (Civ. Code §§ 4000–6150)',
  TX: 'Texas Property Code Ch. 209 (Residential Property Owners Protection Act)',
}

// ─── AI answers ───────────────────────────────────────────────────────

export type AnswerConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

export const CONFIDENCE_TONES: Record<AnswerConfidence, StatusTone> = {
  HIGH: 'success',
  MEDIUM: 'warning',
  LOW: 'neutral',
}

export const CONFIDENCE_LABELS: Record<AnswerConfidence, string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Medium confidence',
  LOW: 'Low confidence',
}
