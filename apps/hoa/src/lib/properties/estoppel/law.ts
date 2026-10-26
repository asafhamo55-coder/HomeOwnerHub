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
 *
 * TEXAS — checked against the Texas Legislative Council's official
 * Property Code chapter 207 (the text statutes.capitol.texas.gov shows),
 * recorded in scripts/fixtures/state-law/tx-prop-207-2026.txt:
 *   - § 207.001(5): a resale certificate is "issued, signed, and dated by
 *     an officer or authorized agent" and contains the § 207.003(b) items.
 *   - § 207.002: the chapter applies to a subdivision whose association
 *     may levy assessments, and not to condominiums (chapters 81, 82).
 *   - § 207.003(a): deliver "not later than the 10th business day" after
 *     the written request (and any (a-1) evidence of authority) is
 *     received and verified: the restrictions, the bylaws and rules, and a
 *     resale certificate "prepared not earlier than the 60th day before
 *     the date the certificate is delivered".
 *   - § 207.003(b)(1)–(16): what the certificate must contain.
 *   - § 207.003(c): a reasonable and necessary fee "not to exceed $375";
 *     an update under (f) "not to exceed $75".
 *   - § 207.003(c-1): payment may be required first but not processed
 *     until the certificate is available; no fee if the certificate is not
 *     provided in the time (a) prescribes.
 *   - § 207.003(f)–(g): updates within 7 business days, requested within
 *     180 days by the original requester (not generated here).
 *   There is no § 207.0035: the chapter is §§ 207.001–207.006.
 *
 * GEORGIA — there is no Georgia estoppel statute like Florida's. The
 * Georgia Property Owners' Association Act gives a statement of amounts
 * due, O.C.G.A. § 44-3-232(d), recorded (with its sources) in
 * scripts/fixtures/state-law/ga-ocga-44-3-232-2026.txt:
 *   - on a written request delivered to the association's registered
 *     office, a statement of "the amount of assessments past due and
 *     unpaid together with late charges and interest";
 *   - within "five business days from the receipt", regarding amounts due
 *     at the end of that five-day period; failing that, the assessment
 *     lien is extinguished as to the purchaser's or lender's interest;
 *   - the statement binds the association and every lot owner;
 *   - "a fee not exceeding $10.00" only "if the instrument so provides".
 *   It applies to associations submitted to the Act (§ 44-3-235(a)), which
 *   the board confirms. HB 1222 (2026), which would have added a
 *   § 44-3-232.2 statement of account with a $250 cap, was not enacted;
 *   SB 406 (2026, Act 715) changed § 44-3-232(c) only.
 *
 * GEORGIA CONDOMINIUMS (BL-155) — an association whose type is 'condo'
 * gets the Georgia Condominium Act instead, O.C.G.A. § 44-3-109(d),
 * quoted from scripts/fixtures/state-law/ga-ocga-44-3-art3-2026.txt (the
 * State's release 86 text; no later act amends § 44-3-109) via
 * lib/ga-condo/law.ts:
 *   - the same written request to the registered office, stating an
 *     address, for "the amount of assessments past due and unpaid together
 *     with late charges and interest";
 *   - due "within five business days from the receipt of such request"
 *     (BL-155's open question, five or ten, is settled by the official
 *     text: five business days); failing that, the lien is extinguished as
 *     to the purchaser's or lender's interest;
 *   - binding on the association and every unit owner;
 *   - "a fee not exceeding $10.00" only "if the condominium instruments so
 *     provided".
 *   It applies to property submitted to the Condominium Act, which the
 *   board confirms. The POA Act does not apply to condominium associations
 *   (§ 44-3-235(b)), so a condo statement never cites § 44-3-232(d).
 */

import { GA_CONDO_STATEMENT_BUSINESS_DAYS, GA_CONDO_STATEMENT_FEE_CAP_CENTS } from '@/lib/ga-condo/law'

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

// ─── Texas § 207.003 ─────────────────────────────────────────────────

export const TX_CITATION = 'Tex. Prop. Code § 207.003'
export const TX_STATUTE_URL = 'https://statutes.capitol.texas.gov/Docs/PR/htm/PR.207.htm'
/** § 207.003(a): not later than the 10th business day after the request is received (and verified). */
export const TX_RESPONSE_BUSINESS_DAYS = 10
/** § 207.003(a)(3): prepared not earlier than the 60th day before delivery. */
export const TX_PREPARED_WITHIN_DAYS = 60
/** § 207.003(c). */
export const TX_FEE_CAP_CENTS = 37_500
export const TX_UPDATE_FEE_CAP_CENTS = 7_500
/** § 207.003(f). */
export const TX_UPDATE_BUSINESS_DAYS = 7
export const TX_PARTIAL_LABEL = 'Partial — § 207.003(a) also requires documents not generated here'

export function txFeeCap(): FeeCap {
  return { totalCents: TX_FEE_CAP_CENTS, lines: [{ label: 'Assemble, copy and deliver the information (§ 207.003(c))', cents: TX_FEE_CAP_CENTS }] }
}

/** § 207.003 items this page does NOT produce; the board attaches them. */
export const TX_DOCUMENTS_NOT_GENERATED: { cite: string; text: string }[] = [
  { cite: '§ 207.003(a)(1)', text: 'A current copy of the restrictions applying to the subdivision.' },
  { cite: '§ 207.003(a)(2)', text: 'A current copy of the bylaws and rules of the association.' },
  { cite: '§ 207.003(b)(7)', text: 'The association’s current operating budget and balance sheet.' },
  { cite: '§ 207.003(b)(10)', text: 'A copy of a certificate of insurance showing the association’s property and liability insurance for the common areas and common facilities.' },
]

export const TX_NOTES = [
  'Deliver within 10 business days after the written request — and any evidence of the requestor’s authority the association asks for under § 207.003(a-1) — is received and verified (§ 207.003(a)). A request that doesn’t name who and where to send it to is not effective (§ 207.003(d)).',
  'The certificate must be prepared no earlier than 60 days before it is delivered (§ 207.003(a)(3)), and is issued, signed and dated by an officer or authorized agent (§ 207.001(5)).',
  'Chapter 207 does not apply to condominiums (§ 207.002(b)).',
  'If the association misses the deadline, the requester may send a second request; missing the 5th business day after that exposes the association to a court order, up to $5,000, costs and attorney’s fees (§ 207.004). The association can’t later deny any statement in the certificate, and its lien for amounts left out ends (§ 207.005(a)).',
]

export const TX_FEE_NOTES = [
  'A reasonable and necessary fee, not more than $375 to assemble, copy and deliver the information, and not more than $75 for an update under § 207.003(f) (§ 207.003(c)). This page doesn’t prepare updates.',
  'The association may require payment first, but may not process it until the certificate is available for delivery, and may not charge a fee if the certificate isn’t provided within the 10 business days (§ 207.003(c-1)).',
]

// ─── Georgia § 44-3-232(d) ───────────────────────────────────────────

export const GA_CITATION = 'O.C.G.A. § 44-3-232(d)'
/** § 44-3-232(d): within five business days from the receipt of the request. */
export const GA_RESPONSE_BUSINESS_DAYS = 5
/** § 44-3-232(d): "a fee not exceeding $10.00 … if the instrument so provides". */
export const GA_FEE_CAP_CENTS = 1_000

export function gaFeeCap(): FeeCap {
  return { totalCents: GA_FEE_CAP_CENTS, lines: [{ label: 'Statement fee, only if the declaration provides for one (§ 44-3-232(d))', cents: GA_FEE_CAP_CENTS }] }
}

export const GA_NOTES = [
  'Georgia has no estoppel-certificate statute like Florida’s. This is the statement of amounts due under the Georgia Property Owners’ Association Act, § 44-3-232(d): the assessments past due and unpaid, with late charges and interest. The other figures here are from the association’s records.',
  'The request must be in writing, delivered to the association’s registered office, and give an address for the statement (§ 44-3-232(d)).',
  'If the statement isn’t mailed or furnished within five business days of receiving the request, the assessment lien is extinguished as to the purchaser’s or lender’s interest in that transaction (§ 44-3-232(d)).',
  'The statement binds the association and every lot owner (§ 44-3-232(d)).',
]

export const GA_FEE_NOTES = [
  'A fee of not more than $10.00 may be required before the statement is issued, and only if the declaration provides for it (§ 44-3-232(d)). If it doesn’t, enter $0.',
]

// ─── Georgia condominiums § 44-3-109(d) (BL-155) ─────────────────────

export const GA_CONDO_CITATION = 'O.C.G.A. § 44-3-109(d)'
/** § 44-3-109(d): within five business days from the receipt of the request. */
export const GA_CONDO_RESPONSE_BUSINESS_DAYS = GA_CONDO_STATEMENT_BUSINESS_DAYS

export function gaCondoFeeCap(): FeeCap {
  return {
    totalCents: GA_CONDO_STATEMENT_FEE_CAP_CENTS,
    lines: [{ label: 'Statement fee, only if the condominium instruments provide for one (§ 44-3-109(d))', cents: GA_CONDO_STATEMENT_FEE_CAP_CENTS }],
  }
}

export const GA_CONDO_NOTES = [
  'This is the statement of amounts due under the Georgia Condominium Act, § 44-3-109(d): the assessments past due and unpaid, with late charges and interest. The other figures here are from the association’s records.',
  'The request must be in writing, delivered to the association’s registered office, and give an address for the statement (§ 44-3-109(d)).',
  'If the statement isn’t mailed or furnished within five business days of receiving the request, the assessment lien is extinguished as to the purchaser’s or lender’s interest in that transaction (§ 44-3-109(d)).',
  'The statement binds the association and every unit owner (§ 44-3-109(d)).',
]

export const GA_CONDO_FEE_NOTES = [
  'A fee of not more than $10.00 may be required before the statement is issued, and only if the condominium instruments provide for it (§ 44-3-109(d)). If they don’t, enter $0.',
]
