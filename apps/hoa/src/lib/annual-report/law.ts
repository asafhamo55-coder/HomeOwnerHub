/**
 * BL-153: what the statute text in the repo says about the report owners
 * get at the annual meeting. Pure and client-safe. Citations as text,
 * never legal advice.
 *
 * Only statute text kept in scripts/fixtures/state-law is quoted, and
 * law.test.ts checks every quote word for word against it.
 *
 * GEORGIA (launch state) — ga-ocga-44-3-art6-2026.txt, the Property
 *   Owners' Association Act (snapshot valid until 2027-01-01):
 *   - § 44-3-230(a), last sentence: at the annual meeting, "comprehensive
 *     reports of the affairs, finances, and budget projections of the
 *     association shall be made to the lot owners".
 *   - § 44-3-235(a): the Act applies only to property submitted to it, so
 *     the report says so rather than assuming every Georgia HOA is covered.
 *   The Georgia Condominium Act (§ 44-3-102, BL-155) is NOT loaded.
 * EVERY OTHER STATE: the same report, with no statute quoted. What has to
 *   be reported, and when, is in the governing documents.
 */

export interface AnnualReportQuote {
  /** As printed under the quote. */
  cite: string
  /** Word for word from `fixture` (law.test.ts). */
  quote: string
  /** The file under scripts/fixtures/state-law the quote comes from. */
  fixture: string
}

const GA_FIXTURE = 'ga-ocga-44-3-art6-2026.txt'

export const GA_ANNUAL_REPORT: AnnualReportQuote = {
  cite: 'O.C.G.A. § 44-3-230(a)',
  quote:
    'At the annual meeting, comprehensive reports of the affairs, finances, and budget projections of the association shall be made to the lot owners.',
  fixture: GA_FIXTURE,
}

export const GA_ACT_APPLIES: AnnualReportQuote = {
  cite: 'O.C.G.A. § 44-3-235(a)',
  quote: 'This article shall apply to all property which is submitted to this article.',
  fixture: GA_FIXTURE,
}

export const ALL_ANNUAL_REPORT_QUOTES: readonly AnnualReportQuote[] = [GA_ANNUAL_REPORT, GA_ACT_APPLIES]

export type AnnualReportJurisdiction = 'GA' | 'other'

export function annualReportJurisdiction(state: string | null | undefined): AnnualReportJurisdiction {
  return (state ?? '').trim().toUpperCase() === 'GA' ? 'GA' : 'other'
}

/** The quotes shown for a jurisdiction: Georgia's, or none. */
export function annualReportQuotes(j: AnnualReportJurisdiction): readonly AnnualReportQuote[] {
  return j === 'GA' ? ALL_ANNUAL_REPORT_QUOTES : []
}

/** Plain words under the quotes (or in their place, outside Georgia). */
export function annualReportLawNote(j: AnnualReportJurisdiction): string {
  return j === 'GA'
    ? 'Georgia’s Property Owners’ Association Act asks for this report at every annual meeting of an association whose property is submitted to the Act. Your declaration and bylaws may ask for more.'
    : 'Your governing documents say what the board reports to owners at the annual meeting, and when. This report is a starting point.'
}

export const ANNUAL_REPORT_NOT_LEGAL_ADVICE = 'General information from the statute text, not legal advice.'
