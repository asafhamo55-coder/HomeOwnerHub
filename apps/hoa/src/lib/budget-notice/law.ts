/**
 * What the owner budget notice says about the law, per state (BL-091).
 * Citations as text, never legal advice. Pure and client-safe.
 *
 * FLORIDA — checked against the official 2026 chapter 720 text
 * (scripts/fixtures/state-law/flsenate-ch720-2026.html, the Florida
 * Senate's "2026 Florida Statutes"):
 *   - § 720.303(6)(a): the association prepares an annual budget that sets
 *     out the annual operating expenses; it must reflect the estimated
 *     revenues and expenses for that year and the estimated surplus or
 *     deficit as of the end of the current year; it must set out
 *     separately all fees or charges the association pays for
 *     recreational amenities. The association "shall provide each member
 *     with a copy of the annual budget or a written notice that a copy of
 *     the budget is available upon request at no charge to the member",
 *     within the time limits of subsection (5) (10 business days after a
 *     written request, § 720.303(5)(a)).
 *   - § 720.303(6)(b)–(i): the budget MAY include reserve accounts; once
 *     the members establish them under (d) they are funded or waived as
 *     the subsection says. The app has no reserve module, so every
 *     reserve figure is a BLANK the board fills in.
 *   - § 720.308(1)(a) (communities created after 1995-10-01):
 *     assessments are levied in each member's
 *     proportional share as the governing documents describe, so an
 *     equal-share figure is only a starting point the board confirms.
 *
 * CALIFORNIA — checked against the official Civil Code text from the
 * Legislative Counsel's bulk data (pubinfo_2025.zip, LAW_SECTION_TBL rows
 * dated 2026-10-02), recorded in
 * scripts/fixtures/state-law/ca-civ-davis-stirling-2026.txt:
 *   - § 5300(a): distribute an annual budget report 30 to 90 days before
 *     the end of the fiscal year.
 *   - § 5300(b)(1)–(12): what the report must include. Only (b)(1), the
 *     pro forma operating budget, is generated here; (b)(4), (b)(5),
 *     (b)(6) and (b)(8) are statements the board writes into BLANKs; the
 *     rest are listed as not generated. Hence "Partial".
 *   - § 5300(e): the § 5570 Assessment and Reserve Funding Disclosure
 *     Summary must accompany the report — not generated here.
 *   - § 5320(a): deliver the full report, or a summary with how to request
 *     the full copy at no cost, to all members by individual delivery
 *     (§ 4040).
 */

export const VERIFY_DISCLAIMER =
  'This is general information, not legal advice. Check every figure against your books and governing documents, and ask your association’s attorney before relying on it.'

// ─── Florida § 720.303(6) ────────────────────────────────────────────

export const FL_CITATION = 'Fla. Stat. § 720.303(6)'
export const FL_STATUTE_URL = 'https://www.flsenate.gov/Laws/Statutes/2026/720.303'
/** § 720.303(5)(a), which (6)(a) points to for providing a copy. */
export const FL_COPY_BUSINESS_DAYS = 10

export const FL_COPY_AVAILABLE_LINE =
  'A copy of the annual budget is available to any member on request at no charge (Fla. Stat. § 720.303(6)(a)).'

export const FL_NOTES = [
  '§ 720.303(6)(a) lets the association give each member either a copy of the budget or a written notice that a copy is available on request at no charge. This notice is the copy.',
  'A requested copy must be provided within the time limits of § 720.303(5): 10 business days after the written request.',
  'For a community created after October 1, 1995, assessments are levied in each member’s proportional share as the governing documents describe (§ 720.308(1)(a)). Check the per-home figure against your declaration.',
]

// ─── California § 5300 / § 5320 ──────────────────────────────────────

export const CA_CITATION = 'Cal. Civ. Code § 5300'
export const CA_PARTIAL_LABEL = 'Partial — §5300 requires items not generated here'
/** § 5300(a): 30 to 90 days before the end of the fiscal year. */
export const CA_WINDOW_DAYS = { earliest: 90, latest: 30 } as const

/** § 5300 items this notice does NOT produce; the board attaches them. */
export const CA_ITEMS_NOT_GENERATED: { cite: string; text: string }[] = [
  { cite: '§ 5300(b)(2)', text: 'A summary of the association’s reserves, prepared under § 5565.' },
  { cite: '§ 5300(b)(3)', text: 'A summary of the reserve funding plan adopted by the board (§ 5550(b)(5)), with notice that the full reserve study plan is available on request.' },
  { cite: '§ 5300(b)(7)', text: 'A general statement of the procedures used to calculate and establish reserves, including calculations using the § 5570(b)(4) formula.' },
  { cite: '§ 5300(b)(9)', text: 'A summary of the property, general liability, earthquake, flood and fidelity insurance policies (insurer, type, limit, deductible), with the statement in 10-point boldface type that § 5300(b)(9) requires.' },
  { cite: '§ 5300(b)(10)', text: 'For a condominium project, the FHA-approval statement, on a separate piece of paper in the form the section sets out.' },
  { cite: '§ 5300(b)(11)', text: 'For a condominium project, the VA-approval statement, on a separate piece of paper in the form the section sets out.' },
  { cite: '§ 5300(b)(12)', text: 'A copy of the completed “Charges For Documents Provided” disclosure (§ 4528).' },
  { cite: '§ 5300(e)', text: 'The Assessment and Reserve Funding Disclosure Summary form (§ 5570), which must accompany the report or its summary.' },
]

export const CA_NOTES = [
  'This notice covers the pro forma operating budget of § 5300(b)(1): the estimated revenue and expenses as adopted. Confirm they are on an accrual basis, as that paragraph requires.',
  'The annual budget report is distributed 30 to 90 days before the end of the fiscal year (§ 5300(a)).',
  'Deliver the full report, or a summary that says on its first page how to request the full report at no cost, to every member by individual delivery (§§ 5320, 4040).',
]
