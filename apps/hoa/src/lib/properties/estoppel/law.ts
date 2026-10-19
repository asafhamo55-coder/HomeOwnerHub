/**
 * What the estoppel / resale certificate says about the law, per state
 * (BL-087). Citations as text, never legal advice. Pure and client-safe.
 *
 * FLORIDA — checked against the official 2026 chapter 720 text
 * (scripts/fixtures/state-law/flsenate-ch720-2026.html, the Florida
 * Senate's "2026 Florida Statutes"; history: s. 7, ch. 2008-240; s. 3,
 * ch. 2017-93):
 *   - § 720.30851 (intro): issue "within 10 business days after receiving
 *     a written or electronic request"; delivered by hand, regular mail or
 *     e-mail on the date of issuance.
 *   - § 720.30851(1)(a)–(h): the items the certificate must contain,
 *     "substantially in the following form" (12 numbered questions).
 *   - § 720.30851(2): hand-delivered or electronic = 30-day effective
 *     period; regular mail = 35 days.
 *   - § 720.30851(4): no fee may be charged if it is not delivered within
 *     10 business days.
 *   - § 720.30851(6): fee may not exceed $250 when nothing is delinquent;
 *     an additional $100 if requested expedited and delivered within 3
 *     business days; if a delinquent amount is owed, an additional fee
 *     that "may not exceed $150". (The BL-087 brief said $100 for the
 *     delinquent add-on; the statute says $150.)
 *   - § 720.30851(9): the fees are adjusted every 5 years by CPI and DBPR
 *     publishes the adjusted amounts on its website — so the figures here
 *     are the statute's base caps, and the page says to check DBPR.
 *
 * CALIFORNIA — checked against the official Civil Code text from the
 * Legislative Counsel's bulk data (pubinfo_2025.zip, LAW_SECTION_TBL rows
 * dated 2026-10-02; the same text as leginfo.legislature.ca.gov), recorded
 * in scripts/fixtures/state-law/ca-civ-davis-stirling-2026.txt:
 *   - § 4525(a)(1)–(11) (amended Stats. 2025, ch. 516, eff. 2026-01-01):
 *     the documents the seller must give a prospective purchaser. Only the
 *     (a)(4) statement of assessments, fees and unpaid amounts and the
 *     (a)(5) summary of unresolved violation notices are generated here.
 *   - § 4530(a)(1): the association provides the documents within 10 days
 *     of the mailing or delivery of the request (calendar days: the
 *     section says "days", not "business days").
 *   - § 4530(b)(1): a reasonable fee based on actual cost — no dollar cap.
 *   - § 4528: the fee disclosure form.
 */

export const VERIFY_DISCLAIMER =
  'This is general information, not legal advice. Verify every figure against your books and the current statute, and ask your association’s attorney before relying on it.'

// ─── Florida § 720.30851 ─────────────────────────────────────────────

export const FL_CITATION = 'Fla. Stat. § 720.30851'
export const FL_STATUTE_URL = 'https://www.flsenate.gov/Laws/Statutes/2026/720.30851'

/** § 720.30851 (intro) and (4). */
export const FL_RESPONSE_BUSINESS_DAYS = 10
/** § 720.30851(6): expedited = delivered within 3 business days. */
export const FL_EXPEDITED_BUSINESS_DAYS = 3

export type FlDelivery = 'electronic' | 'hand' | 'mail'

export const FL_DELIVERY_LABELS: Record<FlDelivery, string> = {
  electronic: 'E-mail',
  hand: 'Hand delivery',
  mail: 'Regular mail',
}

/** § 720.30851(2): 30 days by hand or e-mail, 35 by regular mail. */
export function flEffectiveDays(delivery: FlDelivery): 30 | 35 {
  return delivery === 'mail' ? 35 : 30
}

/** § 720.30851(6), base amounts before any DBPR CPI adjustment (§ 720.30851(9)). */
export const FL_FEE_CAPS_CENTS = {
  base: 25_000,
  expedited: 10_000,
  delinquent: 15_000,
} as const

export interface FeeCap {
  totalCents: number
  lines: { label: string; cents: number }[]
}

export function flFeeCap(opts: { delinquent: boolean; expedited: boolean }): FeeCap {
  const lines: FeeCap['lines'] = [{ label: 'Preparation and delivery (§ 720.30851(6))', cents: FL_FEE_CAPS_CENTS.base }]
  if (opts.delinquent) lines.push({ label: 'Additional fee, a delinquent amount is owed', cents: FL_FEE_CAPS_CENTS.delinquent })
  if (opts.expedited) lines.push({ label: 'Expedited, delivered within 3 business days', cents: FL_FEE_CAPS_CENTS.expedited })
  return { totalCents: lines.reduce((t, l) => t + l.cents, 0), lines }
}

export const FL_FEE_NOTES = [
  'These are the caps written in § 720.30851(6). Subsection (9) adjusts them every 5 years for inflation, and the Department of Business and Professional Regulation publishes the adjusted amounts. Check DBPR before charging the full cap.',
  'A fee may be charged only if a board resolution or a management contract authorizes it (§ 720.30851(8)).',
  'No fee may be charged if the certificate is not delivered within 10 business days of the request (§ 720.30851(4)), and none for an amended certificate (§ 720.30851(2)).',
]

// ─── California § 4525 / § 4530 ──────────────────────────────────────

export const CA_CITATION = 'Cal. Civ. Code §§ 4525, 4530'
export const CA_RESPONSE_DAYS = 10
export const CA_PARTIAL_LABEL = 'Partial — the §4525 packet requires documents not generated here'

/** § 4525(a) items this page does NOT produce; the board attaches them. */
export const CA_DOCUMENTS_NOT_GENERATED: { cite: string; text: string }[] = [
  { cite: '§ 4525(a)(1)', text: 'All governing documents: articles of incorporation (or a statement that the association is not incorporated), CC&Rs, bylaws and operating rules.' },
  { cite: '§ 4525(a)(2)', text: 'If the governing documents restrict occupancy by age differently from § 51.3, the statement § 4525(a)(2) requires.' },
  { cite: '§ 4525(a)(3)', text: 'The most recent annual disclosures distributed under § 5300 et seq.: budget report or summary with reserve study, financial statement review, assessment and reserve funding disclosure, enforcement policy and insurance summary.' },
  { cite: '§ 4525(a)(6)', text: 'The initial list of construction defects given under § 6000, with the statement that its accuracy has not been finally determined, unless the matter was settled.' },
  { cite: '§ 4525(a)(7)', text: 'The latest information provided under § 6100 (settlement of construction defect claims).' },
  { cite: '§ 4525(a)(9)', text: 'If the governing documents prohibit renting or leasing, a statement describing the prohibition.' },
  { cite: '§ 4525(a)(10)', text: 'If the buyer asks: approved minutes of board meetings (not executive session) from the last 12 months.' },
  { cite: '§ 4525(a)(11)', text: 'The report from the most recent inspection of exterior elevated elements under § 5551.' },
  { cite: '§ 4528', text: 'The “Charges for documents provided as required by Section 4525” fee disclosure form.' },
]

export const CA_NOTES = [
  'This statement covers § 4525(a)(4) — current regular and special assessments and fees, unpaid assessments, and unpaid fines, late charges, interest and collection costs — and a summary of unresolved violation notices for § 4525(a)(5). Approved changes to assessments not yet due (§ 4525(a)(8)) are entered by the board below.',
  'The association must provide the requested documents within 10 days of the mailing or delivery of the request (§ 4530(a)(1)).',
  'The fee is a reasonable fee based on the association’s actual cost (§ 4530(b)(1)). No extra fee may be charged for electronic delivery, and fees must be itemized and billed separately from other charges (§ 4530(b)(4)).',
]
