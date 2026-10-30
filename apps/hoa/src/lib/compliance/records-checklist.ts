/**
 * "Records your owners can see": the records a state's statute tells an
 * association to keep or post, and where each one stands in the document
 * library. Pure, no I/O, safe for client imports.
 *
 * Every category comes from statute text in scripts/fixtures/state-law
 * (records-checklist.test.ts checks each `quote` word for word). Nothing
 * else is invented: states without a list here get no checklist.
 *
 * Honesty rules:
 *  - "posted" means a library document of a matching category exists. The
 *    app cannot see whether the board also put it on a website.
 *  - A record the library has no category for (insurance, contracts,
 *    budgets, financial records, articles) is "untracked", never "missing".
 */

import type { ComplianceState } from './state'

export interface RecordCategory {
  id: string
  label: string
  /** The library category that satisfies it; null when the app has none for it. */
  docType: 'ccr' | 'bylaws' | 'rules' | 'minutes' | null
  /** Statute words, verbatim from `fixture`. */
  quote: string
  cite: string
  fixture: string
  /** Another fixture carrying the same words (the condominium article). */
  alsoIn?: string
}

export interface RecordsChecklist {
  state: ComplianceState
  /** One plain sentence on what the statute does and does not require. */
  intro: string
  categories: RecordCategory[]
}

const FL_FIXTURE = 'flsenate-ch720-2026.html'
const FL_POST = 'Fla. Stat. § 720.303(4)(b)1.'

const FL: RecordCategory[] = [
  {
    id: 'fl-articles',
    label: 'Articles of incorporation and amendments',
    docType: null,
    quote: 'The articles of incorporation of the association and each amendment thereto.',
    cite: `${FL_POST}a.`,
    fixture: FL_FIXTURE,
  },
  {
    id: 'fl-bylaws',
    label: 'Recorded bylaws and amendments',
    docType: 'bylaws',
    quote: 'The recorded bylaws of the association and each amendment thereto.',
    cite: `${FL_POST}b.`,
    fixture: FL_FIXTURE,
  },
  {
    id: 'fl-declaration',
    label: 'Declaration of covenants and amendments',
    docType: 'ccr',
    quote: 'The declaration of covenants and a copy of each amendment thereto.',
    cite: `${FL_POST}c.`,
    fixture: FL_FIXTURE,
  },
  {
    id: 'fl-rules',
    label: 'Current rules',
    docType: 'rules',
    quote: 'The current rules of the association.',
    cite: `${FL_POST}d.`,
    fixture: FL_FIXTURE,
  },
  {
    id: 'fl-contracts',
    label: 'List of current executory contracts and recent bids',
    docType: null,
    quote: 'A list of all current executory contracts or documents to which the association is a party',
    cite: `${FL_POST}e.`,
    fixture: FL_FIXTURE,
  },
  {
    id: 'fl-budget',
    label: 'Annual budget and any proposed budget',
    docType: null,
    quote: 'The annual budget required by subsection (6) and any proposed budget to be considered at the annual meeting.',
    cite: `${FL_POST}f.`,
    fixture: FL_FIXTURE,
  },
  {
    id: 'fl-financial-report',
    label: 'Financial report',
    docType: null,
    quote: 'The financial report required by subsection (7)',
    cite: `${FL_POST}g.`,
    fixture: FL_FIXTURE,
  },
  {
    id: 'fl-insurance',
    label: 'Current insurance policies',
    docType: null,
    quote: 'The association’s current insurance policies.',
    cite: `${FL_POST}h.`,
    fixture: FL_FIXTURE,
  },
  {
    id: 'fl-minutes',
    label: 'Minutes of board and member meetings',
    docType: 'minutes',
    quote: 'The minutes of all meetings of the board of directors and of the members.',
    cite: 'Fla. Stat. § 720.303(4)(a)6.',
    fixture: FL_FIXTURE,
  },
]

const GA_POA_FIXTURE = 'ga-ocga-44-3-art6-2026.txt'
const GA_CONDO_FIXTURE = 'ga-ocga-44-3-art3-2026.txt'
const GA_CORP_FIXTURE = 'ga-ocga-14-3-2026.txt'

const GA: RecordCategory[] = [
  {
    id: 'ga-minutes',
    label: 'Minutes of member and board meetings',
    docType: 'minutes',
    quote: 'Detailed minutes of all meetings of the members of the association and of the board of directors;',
    cite: 'O.C.G.A. § 44-3-231(d)(1) (property owners’ associations); § 44-3-106(d)(1) (condominiums)',
    fixture: GA_POA_FIXTURE,
    alsoIn: GA_CONDO_FIXTURE,
  },
  {
    id: 'ga-financial',
    label: 'Financial records, with itemized receipts and expenditures',
    docType: null,
    quote: 'Detailed and accurate financial records, including itemized records of all receipts and expenditures; and',
    cite: 'O.C.G.A. § 44-3-231(d)(2) (property owners’ associations); § 44-3-106(d)(2) (condominiums)',
    fixture: GA_POA_FIXTURE,
    alsoIn: GA_CONDO_FIXTURE,
  },
  {
    id: 'ga-bylaws',
    label: 'Bylaws and amendments (incorporated associations)',
    docType: 'bylaws',
    quote: 'Its bylaws or restated bylaws and all amendments to them currently in effect;',
    cite: 'O.C.G.A. § 14-3-1602(a)(2)',
    fixture: GA_CORP_FIXTURE,
  },
  {
    id: 'ga-articles',
    label: 'Articles of incorporation and amendments (incorporated associations)',
    docType: null,
    quote: 'Its articles or restated articles of incorporation and all amendments to them currently in effect;',
    cite: 'O.C.G.A. § 14-3-1602(a)(1)',
    fixture: GA_CORP_FIXTURE,
  },
]

export const GA_NO_POSTING_LIST = 'Georgia law sets owner records rights but no posting list; check your bylaws.'

export const RECORDS_CHECK_BYLAWS =
  'HomeownerHub has no records list for your state. Check your bylaws and your governing documents.'

/** The checklist for a state, or null when none is loaded (show RECORDS_CHECK_BYLAWS). */
export function recordsChecklistFor(state: ComplianceState | null): RecordsChecklist | null {
  if (state === 'FL') {
    return {
      state,
      intro:
        'Florida lists the records an association with 100 or more parcels must post on a website or app, and the minutes it keeps as official records.',
      categories: FL,
    }
  }
  if (state === 'GA') {
    return {
      state,
      intro: `Georgia requires these records be kept. ${GA_NO_POSTING_LIST}`,
      categories: GA,
    }
  }
  return null
}

export type RecordStatus = 'posted' | 'missing' | 'untracked'

export interface RecordRow {
  category: RecordCategory
  status: RecordStatus
  /** The newest matching library document, when posted. */
  document: { id: string; name: string } | null
}

export interface LibraryDoc {
  id: string
  name: string
  type: string
}

/**
 * Posted = at least one library document of the category's type. Documents
 * arrive newest first; the first match is shown. A document of type "other"
 * never counts.
 */
export function recordRows(checklist: RecordsChecklist, docs: readonly LibraryDoc[]): RecordRow[] {
  return checklist.categories.map((category) => {
    if (!category.docType) return { category, status: 'untracked' as const, document: null }
    const hit = docs.find((d) => d.type === category.docType)
    return hit
      ? { category, status: 'posted' as const, document: { id: hit.id, name: hit.name } }
      : { category, status: 'missing' as const, document: null }
  })
}

export function recordsProgress(rows: readonly RecordRow[]): { posted: number; trackable: number; untracked: number; line: string } {
  const posted = rows.filter((r) => r.status === 'posted').length
  const untracked = rows.filter((r) => r.status === 'untracked').length
  const trackable = rows.length - untracked
  const tail = untracked > 0 ? `; ${untracked} ${untracked === 1 ? 'is' : 'are'} not tracked in the app` : ''
  return { posted, trackable, untracked, line: `${posted} of ${trackable} trackable records in your library${tail}.` }
}
