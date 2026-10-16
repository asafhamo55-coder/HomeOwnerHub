/**
 * Fla. Stat. § 720.303 — the record categories and notice rules the
 * /legal/compliance check looks for (BL-015).
 *
 * Every `quote` below is a verbatim excerpt of § 720.303 and carries the
 * subsection it comes from. rules.test.ts checks each one against the
 * official text recorded from flsenate.gov (the same source and parser the
 * W30 Florida ingestion uses), so a typo or a paraphrase fails the suite.
 * At runtime the page re-validates each quote against the statute text
 * stored in state_statutes and never shows a quote that is not in it.
 *
 * The matchers and staleness windows are NOT statute: they are this
 * product's heuristic for "which uploaded document is probably this
 * record", and the page says so. Pure module — no I/O.
 */

/** state_statutes.code_citation of the section every line cites. */
export const FL_RECORDS_CODE_CITATION = 'Fla. Stat. § 720.303'

/** Short display form. */
export const FL_RECORDS_SECTION = '§ 720.303'

export interface StatuteQuote {
  /** Subsection within § 720.303, e.g. "(4)(b)1.a". */
  subsection: string
  /** Verbatim excerpt of that subsection. */
  quote: string
}

export interface CategoryMatcher {
  /** hoa_documents.type values that are this record. */
  hoaTypes: readonly string[]
  /** governing_documents.type values that are this record. */
  govTypes: readonly string[]
  /** Title patterns, for documents filed as "other" / "policy" / "amendment". */
  titlePatterns: readonly RegExp[]
}

export interface RecordCategory {
  id: string
  label: string
  citation: StatuteQuote
  match: CategoryMatcher
  /**
   * The statute asks for the *current* version. When the newest matching
   * document is older than this many months it is shown as stale. null =
   * the record does not expire by age (it changes only by amendment).
   * Product heuristic, not a statutory deadline.
   */
  staleAfterMonths: number | null
  /** Why this window — shown beside a stale line. */
  staleReason?: string
  /**
   * Required only when such a record exists (e.g. conflict-of-interest
   * contracts). With nothing on file the line reads "none on file", not
   * "missing".
   */
  conditional: boolean
}

/** Who the website-posting list applies to. */
export const APPLICABILITY: StatuteQuote = {
  subsection: '(4)(b)1',
  quote:
    'By January 1, 2025, an association that has 100 or more parcels shall post the following documents on its website or make available such documents through an application that can be downloaded on a mobile device',
}

/** The owner-only protected area. */
export const OWNER_ONLY_AREA: StatuteQuote = {
  subsection: '(4)(b)2',
  quote:
    'must contain a subpage, web portal, or other protected electronic location that is inaccessible to the general public and accessible only to parcel owners and employees of the association',
}

/** Parcel count at which (4)(b)1 applies. */
export const POSTING_PARCEL_THRESHOLD = 100

export const RECORD_CATEGORIES: readonly RecordCategory[] = [
  {
    id: 'articles',
    label: 'Articles of incorporation and amendments',
    citation: {
      subsection: '(4)(b)1.a',
      quote: 'The articles of incorporation of the association and each amendment thereto.',
    },
    match: { hoaTypes: [], govTypes: [], titlePatterns: [/\barticles\s+of\s+(?:incorporation|organization)\b/i] },
    staleAfterMonths: null,
    conditional: false,
  },
  {
    id: 'bylaws',
    label: 'Recorded bylaws and amendments',
    citation: {
      subsection: '(4)(b)1.b',
      quote: 'The recorded bylaws of the association and each amendment thereto.',
    },
    match: { hoaTypes: ['bylaws'], govTypes: ['bylaws'], titlePatterns: [/\bby-?\s?laws?\b/i] },
    staleAfterMonths: null,
    conditional: false,
  },
  {
    id: 'declaration',
    label: 'Declaration of covenants and amendments',
    citation: {
      subsection: '(4)(b)1.c',
      quote: 'The declaration of covenants and a copy of each amendment thereto.',
    },
    match: {
      hoaTypes: ['ccr'],
      govTypes: ['declaration'],
      titlePatterns: [/\bdeclaration\b/i, /\bcc\s?&\s?rs?\b/i, /\bcovenants\b/i],
    },
    staleAfterMonths: null,
    conditional: false,
  },
  {
    id: 'rules',
    label: 'Current rules',
    citation: { subsection: '(4)(b)1.d', quote: 'The current rules of the association.' },
    match: { hoaTypes: ['rules'], govTypes: ['rules'], titlePatterns: [/\brules\b/i, /\bregulations\b/i] },
    staleAfterMonths: null,
    conditional: false,
  },
  {
    id: 'contracts',
    label: 'List of current contracts and bids received in the past year',
    citation: {
      subsection: '(4)(b)1.e',
      quote:
        'A list of all current executory contracts or documents to which the association is a party or under which the association or the parcel owners have an obligation or responsibility',
    },
    match: { hoaTypes: [], govTypes: [], titlePatterns: [/\bcontracts?\b/i, /\bbids?\b/i] },
    staleAfterMonths: 12,
    staleReason: 'The list must be current and cover bids from the past year.',
    conditional: false,
  },
  {
    id: 'budget',
    label: 'Annual budget',
    citation: {
      subsection: '(4)(b)1.f',
      quote: 'The annual budget required by subsection (6) and any proposed budget to be considered at the annual meeting.',
    },
    match: { hoaTypes: [], govTypes: [], titlePatterns: [/\bbudget\b/i] },
    staleAfterMonths: 13,
    staleReason: 'A budget is adopted every year.',
    conditional: false,
  },
  {
    id: 'financial_report',
    label: 'Annual financial report',
    citation: {
      subsection: '(4)(b)1.g',
      quote:
        'The financial report required by subsection (7) and any monthly income or expense statement to be considered at a meeting.',
    },
    match: {
      hoaTypes: [],
      govTypes: [],
      titlePatterns: [/\bfinancial\s+(?:report|statements?)\b/i, /\baudit(?:ed)?\b/i, /\bincome\s+(?:and|&)\s+expense\b/i],
    },
    staleAfterMonths: 15,
    staleReason: 'The financial report is prepared every fiscal year.',
    conditional: false,
  },
  {
    id: 'insurance',
    label: 'Current insurance policies',
    citation: { subsection: '(4)(b)1.h', quote: 'The association’s current insurance policies.' },
    match: { hoaTypes: [], govTypes: [], titlePatterns: [/\binsurance\b/i] },
    staleAfterMonths: 12,
    staleReason: 'Policies usually renew every year.',
    conditional: false,
  },
  {
    id: 'director_certification',
    label: 'Director certifications',
    citation: {
      subsection: '(4)(b)1.i',
      quote: 'The certification of each director as required by s. 720.3033(1)(a).',
    },
    match: {
      hoaTypes: [],
      govTypes: [],
      titlePatterns: [/\bdirectors?\b.*\bcertific/i, /\bcertific\w*\b.*\bdirectors?\b/i],
    },
    staleAfterMonths: null,
    conditional: false,
  },
  {
    id: 'director_contracts',
    label: 'Contracts with directors, officers or their firms',
    citation: {
      subsection: '(4)(b)1.j',
      quote:
        'All contracts or transactions between the association and any director, officer, corporation, firm, or association that is not an affiliated homeowners’ association',
    },
    match: {
      hoaTypes: [],
      govTypes: [],
      titlePatterns: [/\brelated[-\s]party\b/i, /\b(?:director|officer)\s+(?:contracts?|transactions?)\b/i],
    },
    staleAfterMonths: null,
    conditional: true,
  },
  {
    id: 'conflict_of_interest',
    label: 'Conflict-of-interest contracts and documents',
    citation: {
      subsection: '(4)(b)1.k',
      quote: 'Any contract or document regarding a conflict of interest or possible conflict of interest',
    },
    match: { hoaTypes: [], govTypes: [], titlePatterns: [/\bconflicts?\s+of\s+interest\b/i] },
    staleAfterMonths: null,
    conditional: true,
  },
  {
    id: 'retention_rules',
    label: 'Records retention rules',
    citation: {
      subsection: '(4)(c)',
      quote:
        'The association shall adopt written rules governing the method or policy by which the official records of the association are to be retained',
    },
    match: { hoaTypes: [], govTypes: [], titlePatterns: [/\bretention\b/i, /\brecords?\s+(?:policy|rules)\b/i] },
    staleAfterMonths: null,
    conditional: false,
  },
]

// ─── Meeting notices ────────────────────────────────────────────────

/** Notice lead time the 14-day rules require. */
export const NOTICE_DAYS = 14

export type NoticeRuleId = 'members_14' | 'special_14' | 'board_48h' | 'emergency'

export interface NoticeRule {
  id: NoticeRuleId
  /** Minimum days ahead the notice must go up; null = exempt. */
  minDays: number | null
  /** Plain-English requirement shown on the line. */
  summary: string
  citations: readonly StatuteQuote[]
}

const MEMBERS_NOTICE: StatuteQuote = {
  subsection: '(4)(b)1.l',
  quote:
    'Notice of any scheduled meeting of members and the agenda for the meeting, as required by s. 720.306, at least 14 days before such meeting.',
}

const SPECIAL_ASSESSMENT_NOTICE: StatuteQuote = {
  subsection: '(2)(c)2',
  quote:
    'Written notice of any meeting at which special assessments will be considered or at which amendments to rules regarding parcel use will be considered must be mailed, delivered, or electronically transmitted to the members and parcel owners and posted conspicuously on the property or broadcast on closed-circuit cable television not less than 14 days before the meeting.',
}

const BOARD_NOTICE: StatuteQuote = {
  subsection: '(2)(c)1',
  quote:
    'must be posted in a conspicuous place in the community at least 48 hours in advance of a meeting, except in an emergency.',
}

/**
 * hoa_meeting_minutes.meeting_type → the notice rule that applies.
 * meeting_type does not record whether a special meeting is of the board or
 * the members, or what is on the agenda, so "special" (and an unknown type)
 * gets the stricter 14-day reading.
 */
export const NOTICE_RULES: Readonly<Record<NoticeRuleId, NoticeRule>> = {
  members_14: {
    id: 'members_14',
    minDays: NOTICE_DAYS,
    summary: 'Members’ meeting: notice and agenda posted at least 14 days ahead.',
    citations: [MEMBERS_NOTICE],
  },
  special_14: {
    id: 'special_14',
    minDays: NOTICE_DAYS,
    summary:
      'Special meeting: 14 days’ notice if it is a members’ meeting, or if special assessments or parcel-use rule changes will be considered.',
    citations: [MEMBERS_NOTICE, SPECIAL_ASSESSMENT_NOTICE],
  },
  board_48h: {
    id: 'board_48h',
    minDays: 2,
    summary:
      'Board meeting: notice posted at least 48 hours ahead — 14 days if special assessments or parcel-use rule changes will be considered.',
    citations: [BOARD_NOTICE, SPECIAL_ASSESSMENT_NOTICE],
  },
  emergency: {
    id: 'emergency',
    minDays: null,
    summary: 'Emergency meeting: the posting requirement does not apply in an emergency.',
    citations: [BOARD_NOTICE],
  },
}

export function noticeRuleFor(meetingType: string | null | undefined): NoticeRule {
  switch (meetingType) {
    case 'annual':
      return NOTICE_RULES.members_14
    case 'regular':
      return NOTICE_RULES.board_48h
    case 'emergency':
      return NOTICE_RULES.emergency
    default:
      return NOTICE_RULES.special_14
  }
}

/** Every quote the page can show — what rules.test.ts checks. */
export function allQuotes(): StatuteQuote[] {
  const seen = new Set<string>()
  const out: StatuteQuote[] = []
  const push = (q: StatuteQuote) => {
    const key = `${q.subsection}|${q.quote}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(q)
  }
  push(APPLICABILITY)
  push(OWNER_ONLY_AREA)
  for (const c of RECORD_CATEGORIES) push(c.citation)
  for (const r of Object.values(NOTICE_RULES)) r.citations.forEach(push)
  return out
}
