/**
 * BL-130: the "State law check" run before the board levies a fine on a
 * violation or approves (and prints) a collections letter. Pure,
 * client-safe, no clock: the caller passes the association's today.
 *
 * Each finding names the section and carries a quote that is verbatim
 * from the statute text kept in the repo (scripts/fixtures/state-law),
 * which statute-drift.test.ts checks word for word. Where the text is not
 * loaded, there is no rule — the gap is listed in NOT_LOADED instead of
 * being filled from memory.
 *
 *   block — the step looks barred by the statute as the app sees the
 *           record. It goes ahead only with an explicit board override
 *           reason per finding (a code from OVERRIDE_REASONS), which the
 *           caller records in audit_log (ids and codes only).
 *   warn  — a requirement the app cannot see in its records (a mailing
 *           method, a cure). Shown, never blocking.
 *
 * BL-140: in FL and CA a fine hearing the record does not show (no record,
 * too little notice, a panel that doesn't qualify, no outcome) is a block,
 * not a warning, once hearings are on (M4_APPLIED). Its only override is
 * "attorney advised", audited like every other.
 *
 * Sources:
 *   CA — ca-civ-davis-stirling-2026.txt: Civ. Code §§ 5850 and 5855 as
 *        amended by AB 130 (Stats. 2025, ch. 22, effective June 30, 2025).
 *   FL — flsenate-ch720-2026.html: Fla. Stat. §§ 720.305(2) and
 *        720.3085(3)(d) (2026).
 *   TX — tx-prop-209-2026.txt (§ 209.0064), tx-prop-209-0062-2026.txt
 *        (§ 209.0062, added for BL-130 from the Texas Legislative
 *        Council's chapter file, retrieved 2026-10-20), and
 *        tcss-pr209-2026-excerpt.htm (§ 209.006).
 *   GA — ga-ocga-44-3-art6-2026.txt: O.C.G.A. §§ 44-3-223 and 44-3-232(b)–(c)
 *        (the text in force until January 1, 2027), and Ga. L. 2026,
 *        SB 406 § 7 (attorney's fees; in force July 1, 2026).
 *        ga-sb406-2026-2027-text.txt (BL-154): SB 406 as passed, the text in
 *        force from January 1, 2027 — § 5's § 44-3-232(c) (60 days, the new
 *        foreclosure threshold, six years) and § 2's § 43-17A-1(10) and
 *        § 43-17A-8 (the order payments are applied in). Each GA rule picks
 *        its text by the letter date.
 *        ga-sb406-2026-registration.txt: O.C.G.A. § 43-17A-2(a)(2)(A) and
 *        (B)(ii), and SB 406 § 9(a) (BL-149, the registration bar: a
 *        warning before Jan 1, 2027, a block from that day, on fines,
 *        letters that list fines or fees, and liens).
 *
 * No `@/` imports: the collections letter payload (proposal.ts), which the
 * approvals inbox loads under tests/integration, reads the override codes.
 * (../ga-condo/law is relative and import-free, so that still holds.)
 */

import { GA_CONDO_FORECLOSURE_NOTICE } from '../ga-condo/law'

// ─── citations ───────────────────────────────────────────────────────

export interface DriftCitation {
  /** As printed, e.g. "Cal. Civ. Code § 5850(c)". */
  cite: string
  /** Verbatim from the fixture. */
  quote: string
  /** The fixture the quote is checked against. */
  fixture: string
}

const CA_FILE = 'ca-civ-davis-stirling-2026.txt'
const FL_FILE = 'flsenate-ch720-2026.html'
const TX_0064_FILE = 'tx-prop-209-2026.txt'
const TX_0062_FILE = 'tx-prop-209-0062-2026.txt'
const TX_006_FILE = 'tcss-pr209-2026-excerpt.htm'
const GA_FILE = 'ga-ocga-44-3-art6-2026.txt'
/** SB 406's enacted text in force from 2027-01-01 (BL-154). */
export const GA_SB406_2027_FILE = 'ga-sb406-2026-2027-text.txt'
const GA_SB406_FILE = 'ga-sb406-2026-registration.txt'

export const CA_5850_CAP: DriftCitation = {
  cite: 'Cal. Civ. Code § 5850(c)',
  quote: 'A monetary penalty for a violation of the governing documents shall not exceed the lesser of the following:',
  fixture: CA_FILE,
}
export const CA_5850_CAP_100: DriftCitation = {
  cite: 'Cal. Civ. Code § 5850(c)(2)',
  quote: 'One hundred dollars ($100) per violation.',
  fixture: CA_FILE,
}
export const CA_5850_SCHEDULE: DriftCitation = {
  cite: 'Cal. Civ. Code § 5850(c)(1)',
  quote: 'The monetary penalty stated in the schedule of monetary penalties or supplement that is in effect at the time of the violation.',
  fixture: CA_FILE,
}
export const CA_5850_FINDING: DriftCitation = {
  cite: 'Cal. Civ. Code § 5850(d)(2)',
  quote:
    'Before imposing a penalty on a violation pursuant to this subdivision, the board shall make a written finding specifying the adverse health or safety impact in a board meeting open to the members.',
  fixture: CA_FILE,
}
export const CA_5850_NO_LATE_CHARGE: DriftCitation = {
  cite: 'Cal. Civ. Code § 5850(e)',
  quote: 'A late charge or interest shall not be charged to a member for a monetary penalty.',
  fixture: CA_FILE,
}
export const CA_5855_EFFECTIVE: DriftCitation = {
  cite: 'Cal. Civ. Code § 5855(g)',
  quote:
    'A disciplinary action or the imposition of a monetary charge for damage to the common area shall not be effective against a member unless the board fulfills the requirements of this section.',
  fixture: CA_FILE,
}

export const FL_305_CAP: DriftCitation = {
  cite: 'Fla. Stat. § 720.305(2)',
  quote:
    'A fine may not exceed $100 per violation against any member or any member’s tenant, guest, or invitee for the failure of the owner of the parcel or its occupant, licensee, or invitee to comply with any provision of the declaration, the association bylaws, or reasonable rules of the association unless otherwise provided in the governing documents.',
  fixture: FL_FILE,
}
export const FL_305_AGGREGATE: DriftCitation = {
  cite: 'Fla. Stat. § 720.305(2)',
  quote:
    'A fine may be levied by the board for each day of a continuing violation, with a single notice and opportunity for hearing, except that the fine may not exceed $1,000 in the aggregate unless otherwise provided in the governing documents.',
  fixture: FL_FILE,
}
export const FL_305_COMMITTEE: DriftCitation = {
  cite: 'Fla. Stat. § 720.305(2)(b)',
  quote:
    'Such hearing must be held within 90 days after issuance of the notice before a committee of at least three members appointed by the board who are not officers, directors, or employees of the association, or the spouse, parent, child, brother, or sister of an officer, director, or employee.',
  fixture: FL_FILE,
}
export const FL_305_VOTE: DriftCitation = {
  cite: 'Fla. Stat. § 720.305(2)(c)',
  quote: 'If the committee, by majority vote, does not approve a proposed fine or suspension, the proposed fine or suspension may not be imposed.',
  fixture: FL_FILE,
}
export const FL_3085_LATE_NOTICE: DriftCitation = {
  cite: 'Fla. Stat. § 720.3085(3)(d)',
  quote:
    'An association may not require payment of attorney fees related to a past due assessment without first delivering a written notice of late assessment to the parcel owner which specifies the amount owed the association and provides the parcel owner an opportunity to pay the amount owed without the assessment of attorney fees.',
  fixture: FL_FILE,
}

export const TX_0064_NOTICE: DriftCitation = {
  cite: 'Tex. Prop. Code § 209.0064(b)',
  quote:
    "A property owners' association may not hold an owner liable for fees of a collection agent retained by the association unless the association first provides written notice to the owner by certified mail that:",
  fixture: TX_0064_FILE,
}
export const TX_0064_CURE: DriftCitation = {
  cite: 'Tex. Prop. Code § 209.0064(b)(3)',
  quote: 'provides a period of at least 45 days for the owner to cure the delinquency before further collection action is taken.',
  fixture: TX_0064_FILE,
}
export const TX_0064_PLAN: DriftCitation = {
  cite: 'Tex. Prop. Code § 209.0064(b)(2)',
  quote:
    "if the association is subject to Section 209.0062 or the association's dedicatory instruments contain a requirement to offer a payment plan, describes the options the owner has to avoid having the account turned over to a collection agent, including information regarding availability of a payment plan through the association;",
  fixture: TX_0064_FILE,
}
export const TX_0062_PLAN: DriftCitation = {
  cite: 'Tex. Prop. Code § 209.0062(a)',
  quote:
    "A property owners' association composed of more than 14 lots shall adopt reasonable guidelines to establish an alternative payment schedule by which an owner may make partial payments to the property owners' association for delinquent regular or special assessments or any other amount owed to the association without accruing additional monetary penalties.",
  fixture: TX_0062_FILE,
}
export const TX_006_NOTICE: DriftCitation = {
  cite: 'Tex. Prop. Code § 209.006(a)',
  quote:
    'levy a fine for a violation of the restrictions or bylaws or rules of the association, or report any delinquency of an owner to a credit reporting service, the association or its agent must give written notice to the owner by certified mail.',
  fixture: TX_006_FILE,
}
export const TX_006_CURE: DriftCitation = {
  cite: 'Tex. Prop. Code § 209.006(e)',
  quote: 'If the owner cures the violation before the expiration of the period for cure described by Subsection (c), a fine may not be assessed for the violation.',
  fixture: TX_006_FILE,
}

export const GA_223_FINES: DriftCitation = {
  cite: 'O.C.G.A. § 44-3-223',
  quote: 'If and to the extent provided in the instrument, the association shall be empowered to impose and assess fines',
  fixture: GA_FILE,
}
export const GA_SB406_FEES: DriftCitation = {
  cite: 'Ga. L. 2026, SB 406 § 7 (new subsection (f))',
  quote:
    'Except under circumstances necessitated by emergency conditions involving public safety or the preservation of property by the association, before an association may collect or be awarded attorney’s fees, it shall provide:',
  fixture: GA_FILE,
}
export const GA_SB406_NOTICE: DriftCitation = {
  cite: 'Ga. L. 2026, SB 406 § 7 (new subsection (f)(1)–(3))',
  quote:
    'An initial written notice by certified mail or statutory overnight delivery to the lot owner from the association or its agent identifying any outstanding fines or delinquent fees;',
  fixture: GA_FILE,
}
export const GA_SB406_ITEMIZED: DriftCitation = {
  cite: 'Ga. L. 2026, SB 406 § 7 (new subsection (f)(3))',
  quote: 'An itemized list of reasonable attorney’s fees claimed.',
  fixture: GA_FILE,
}
/** BL-148: the 30 days run from RECEIPT, which the app does not record. */
export const GA_SB406_RECEIPT: DriftCitation = {
  cite: 'Ga. L. 2026, SB 406 § 7 (new subsection (f)(2))',
  quote: 'Lot owners with 30 days from the receipt of the notice required under paragraph (1) of this subsection to pay such outstanding fines or delinquent fees; and',
  fixture: GA_FILE,
}
/** BL-148: § 44-3-232(b)(2), the interest cap a GA letter's rate is checked against. */
export const GA_232_INTEREST: DriftCitation = {
  cite: 'O.C.G.A. § 44-3-232(b)(2)',
  quote:
    'At a rate not in excess of 10 percent per annum, interest on each assessment or installment thereof and any delinquency or late charge pertaining thereto from the date the same was first due and payable;',
  fixture: GA_FILE,
}
/** BL-148: § 44-3-232(c) as in force until January 1, 2027 (SB 406 § 5 replaces it then; that text is not loaded). */
export const GA_232C_NOTICE: DriftCitation = {
  cite: 'O.C.G.A. § 44-3-232(c)',
  quote:
    'Not less than 30 days after notice is sent by certified mail or statutory overnight delivery, return receipt requested, to the lot owner both at the address of the lot and at any other address or addresses which the lot owner may have designated to the association in writing, the lien may be foreclosed by the association by an action, judgment, and court order for foreclosure in the same manner as other liens for the improvement of real property',
  fixture: GA_FILE,
}
export const GA_232C_CONTENTS: DriftCitation = {
  cite: 'O.C.G.A. § 44-3-232(c)',
  quote:
    'The notice provided for in this subsection shall specify the amount of the assessments then due and payable together with authorized late charges and the rate of interest accruing thereon.',
  fixture: GA_FILE,
}
export const GA_232C_MINIMUM: DriftCitation = {
  cite: 'O.C.G.A. § 44-3-232(c)',
  quote: 'No foreclosure action against a lien arising out of this subsection shall be permitted unless the amount of the lien is at least $2,000.00.',
  fixture: GA_FILE,
}
export const GA_232C_LAPSE: DriftCitation = {
  cite: 'O.C.G.A. § 44-3-232(c)',
  quote:
    'The lien for assessments shall lapse and be of no further effect, as to assessments or installments thereof, together with late charges and interest applicable thereto, four years after the assessment or installment first became due and payable.',
  fixture: GA_FILE,
}

/** BL-149: the registration bar (Ga. L. 2026, SB 406 § 2, new O.C.G.A. ch. 43-17A). */
export const GA_SB406_REGISTRATION_BAR: DriftCitation = {
  cite: 'O.C.G.A. § 43-17A-2(a)(2)(A) (Ga. L. 2026, SB 406 § 2)',
  quote:
    "Subject to subparagraph (B) of this paragraph, no owners' association or its agent shall collect fines or fees against any owner, or file or record liens or initiate foreclosure proceedings against any lot unless such owners' association is registered pursuant to this Code section.",
  fixture: GA_SB406_FILE,
}
export const GA_SB406_OPT_OUT_BAR: DriftCitation = {
  cite: 'O.C.G.A. § 43-17A-2(a)(2)(B)(ii) (Ga. L. 2026, SB 406 § 2)',
  quote: "No nonregistered owners' association or its agent shall assess or collect fines or fees or accelerated assessments against any owner.",
  fixture: GA_SB406_FILE,
}
export const GA_SB406_IN_FORCE: DriftCitation = {
  cite: 'Ga. L. 2026, SB 406 § 9(a)',
  quote: 'Except as provided in subsection (b) of this section, this Act shall become effective on January 1, 2027.',
  fixture: GA_SB406_FILE,
}

/** BL-154: § 44-3-232(c) as SB 406 § 5 revises it, in force January 1, 2027. */
export const GA_232C_2027_NOTICE: DriftCitation = {
  cite: 'O.C.G.A. § 44-3-232(c) (as revised by SB 406 § 5, from January 1, 2027)',
  quote:
    'Not less than 60 days after notice is sent by certified mail or statutory overnight delivery, return receipt requested, to the lot owner both at the address of the lot and at any other address or addresses which the lot owner may have designated to the association in writing, the lien may be foreclosed by the association by an action, judgment, and court order for foreclosure in the same manner as other liens for the improvement of real property',
  fixture: GA_SB406_2027_FILE,
}
export const GA_232C_2027_CONTENTS: DriftCitation = {
  cite: 'O.C.G.A. § 44-3-232(c) (as revised by SB 406 § 5, from January 1, 2027)',
  quote:
    'The notice provided for in this subsection shall specify the amount of the assessments then due and payable together with authorized late charges and the rate of interest accruing thereon and shall state that payment of such amount prior to the sixtieth day following receipt of the notice will eliminate the right of foreclosure.',
  fixture: GA_SB406_2027_FILE,
}
export const GA_232C_2027_MINIMUM: DriftCitation = {
  cite: 'O.C.G.A. § 44-3-232(c) (as revised by SB 406 § 5, from January 1, 2027)',
  quote:
    'No foreclosure action against a lien arising out of this subsection shall be permitted unless the amount of the lien is at least the lesser of $4,000.00 or an amount equal to 12 months of regular assessments, as such term is defined in Code Section 43-17A-1, in arrears but not less than $2,000.00; provided, however, that no specific assessment, as such term is defined in Code Section 43-17A-1, or other fine or fee shall be included in the calculation of the amount of such lien.',
  fixture: GA_SB406_2027_FILE,
}
export const GA_232C_2027_LAPSE: DriftCitation = {
  cite: 'O.C.G.A. § 44-3-232(c) (as revised by SB 406 § 5, from January 1, 2027)',
  quote:
    'The lien for assessments shall lapse and be of no further effect, as to assessments or installments thereof, together with late charges and interest applicable thereto, six years after the assessment or installment first became due and payable.',
  fixture: GA_SB406_2027_FILE,
}
/** BL-154: why late charges and fines don't count toward the 2027 threshold. */
export const GA_17A1_SPECIFIC: DriftCitation = {
  cite: 'O.C.G.A. § 43-17A-1(10) (Ga. L. 2026, SB 406 § 2, from January 1, 2027)',
  quote:
    "'Specific assessments' means an assessment imposed on an owner for: (A) Costs incurred by the owners' association to repair or remediate damage caused by such owner to the owners' association, which may include, but shall not be limited to, damage to common areas; or (B) Fees or fines for nonpayment, insufficient payment, or untimely payment of any assessment or for violation of a covenant of the owners' association.",
  fixture: GA_SB406_2027_FILE,
}
/** BL-154: the order every payment must be applied in, from January 1, 2027. */
export const GA_17A8_ORDER: DriftCitation = {
  cite: 'O.C.G.A. § 43-17A-8(a) (Ga. L. 2026, SB 406 § 2, from January 1, 2027)',
  quote:
    "All funds remitted by an owner to an owners' association shall be applied by such owners' association to the following expenses by ranking of highest to lowest priority as follows: (1) Regular assessments or dues until current; (2) Special assessments until current; (3) Specific assessments until current; and (4) Other fees and fines.",
  fixture: GA_SB406_2027_FILE,
}
export const GA_17A8_NO_REFUSAL: DriftCitation = {
  cite: 'O.C.G.A. § 43-17A-8(b) (Ga. L. 2026, SB 406 § 2, from January 1, 2027)',
  quote:
    "No owners' association shall: (1) Refuse to accept payment from an owner in any amount for any assessment; or (2) Assess or collect accelerated assessments against any owner.",
  fixture: GA_SB406_2027_FILE,
}

/** Every quote this module can show — what statute-drift.test.ts checks against the fixtures. */
export const ALL_DRIFT_CITATIONS: readonly DriftCitation[] = [
  CA_5850_CAP,
  CA_5850_CAP_100,
  CA_5850_SCHEDULE,
  CA_5850_FINDING,
  CA_5850_NO_LATE_CHARGE,
  CA_5855_EFFECTIVE,
  FL_305_CAP,
  FL_305_AGGREGATE,
  FL_305_COMMITTEE,
  FL_305_VOTE,
  FL_3085_LATE_NOTICE,
  TX_0064_NOTICE,
  TX_0064_CURE,
  TX_0064_PLAN,
  TX_0062_PLAN,
  TX_006_NOTICE,
  TX_006_CURE,
  GA_223_FINES,
  GA_SB406_FEES,
  GA_SB406_NOTICE,
  GA_SB406_ITEMIZED,
  GA_SB406_REGISTRATION_BAR,
  GA_SB406_OPT_OUT_BAR,
  GA_SB406_IN_FORCE,
  GA_SB406_RECEIPT,
  GA_232_INTEREST,
  GA_232C_NOTICE,
  GA_232C_CONTENTS,
  GA_232C_MINIMUM,
  GA_232C_LAPSE,
  GA_232C_2027_NOTICE,
  GA_232C_2027_CONTENTS,
  GA_232C_2027_MINIMUM,
  GA_232C_2027_LAPSE,
  GA_17A1_SPECIFIC,
  GA_17A8_ORDER,
  GA_17A8_NO_REFUSAL,
]

/** SB 406 § 9(a): the registration bar is in force from this day (BL-149). */
export const GA_REGISTRATION_BAR_FROM = '2027-01-01'
/** Where the board records its registration (BL-149). */
export const GA_REGISTRATION_KIT = { href: '/compliance/ga-registration', label: 'Open the Georgia registration kit' } as const
/**
 * Ledger charge types that are fines or fees, not assessments (0047's
 * assessments_assessment_type_check). A letter that lists only 'regular',
 * 'special' or plan installments asks for assessments, which the
 * registration bar does not name.
 */
export const FINE_OR_FEE_TYPES = ['fine', 'late_fee', 'lien_filing', 'collection_legal', 'collection_letter', 'collection_processing'] as const

/** SB 406 § 9(b): § 7 is in force from this day. */
export const GA_SB406_FEES_FROM = '2026-07-01'
/** SB 406 § 9(a): §§ 2–6 are in force from this day (the 2027 text of § 44-3-232(c), ch. 43-17A). */
export const GA_SB406_2027_FROM = '2027-01-01'
/** § 720.305(2): $100 per violation, $1,000 in the aggregate. */
export const FL_FINE_CAP_CENTS = 10_000
export const FL_FINE_AGGREGATE_CENTS = 100_000
/** § 5850(c)(2): $100 per violation. */
export const CA_FINE_CAP_CENTS = 10_000
/** § 209.0064(b)(3): at least 45 days to cure. */
export const TX_NOTICE_CURE_DAYS = 45
/** § 720.3085(3)(d)'s form: further action no sooner than 30 days after the notice. */
export const FL_LATE_NOTICE_WAIT_DAYS = 30
/** SB 406 § 7(f)(2): 30 days from receipt of the (f)(1) notice. */
export const GA_FEE_NOTICE_DAYS = 30

// ─── overrides ───────────────────────────────────────────────────────

export const OVERRIDE_REASONS = {
  health_safety_finding:
    'The board made a written finding, at a board meeting open to members, that the violation may have an adverse health or safety impact on the common area or another member’s property, and the higher penalty is on the schedule.',
  governing_documents_allow: 'Our governing documents provide for a higher fine than the statute’s default.',
  notice_sent_outside_app: 'The notice the statute requires was sent outside HomeownerHub, by the required method, and its waiting period has run.',
  not_collection_agent_fees: 'These charges are not a collection agent’s fees.',
  not_subject_to_payment_plan: 'The association has 14 lots or fewer, and its dedicatory instruments do not require a payment plan offer.',
  payment_plan_exception: 'A § 209.0062(c) exception applies to this owner, so no payment plan has to be offered.',
  emergency_conditions: 'The fees arise from emergency conditions involving public safety or the preservation of property.',
  attorney_advised: 'The association’s attorney reviewed this and advised that it is permitted.',
} as const
export type OverrideReason = keyof typeof OVERRIDE_REASONS
export const OVERRIDE_REASON_CODES = Object.keys(OVERRIDE_REASONS) as OverrideReason[]

// ─── findings ────────────────────────────────────────────────────────

export const DRIFT_CODES = [
  'ca_fine_over_cap',
  'ca_fine_schedule',
  'ca_no_late_charge_on_fine',
  'ca_hearing_not_recorded',
  'fl_fine_over_cap',
  'fl_fine_aggregate',
  'fl_hearing_committee',
  'fl_hearing_no_fine',
  'ca_hearing_no_fine',
  'tx_fine_certified_notice',
  'tx_fine_cure_period',
  'ga_fine_instrument',
  'tx_collection_fees_without_notice',
  'tx_payment_plan_missing',
  'ga_attorney_fees_prerequisites',
  'fl_attorney_fees_without_late_notice',
  'ca_late_charge_with_fine',
  'ga_unregistered_fine',
  'ga_unregistered_fees',
  'ga_unregistered_lien',
  'ga_fee_notice_delivery',
  'ga_attorney_fees_receipt',
  'ga_foreclosure_notice_delivery',
  'ga_payment_order',
  'ga_condo_foreclosure_notice_delivery',
] as const
export type DriftCode = (typeof DRIFT_CODES)[number]

export type DriftSeverity = 'block' | 'warn'

export interface DriftFinding {
  code: DriftCode
  severity: DriftSeverity
  /** One plain sentence or two for the board. */
  message: string
  citations: DriftCitation[]
  /** For a block: the reasons the board may record to go ahead anyway. Empty for a warning. */
  overrideReasons: OverrideReason[]
  /** Where the board fixes it in HomeownerHub, when there is such a place (BL-149). */
  link?: { href: string; label: string }
}

export interface DriftCheck {
  /** Normalised two-letter state, or null when unknown. */
  state: string | null
  findings: DriftFinding[]
  /** Rules for this state the app has no loaded text for — "check with your attorney". */
  notLoaded: string[]
}

export const CHECK_WITH_ATTORNEY =
  'HomeownerHub has no loaded statute text for this step in your state. Check your governing documents and ask your association’s attorney.'

export const NOT_LEGAL_ADVICE = 'General information from the statute text, not legal advice.'

/**
 * BL-140: § 720.305(2)(b) bars "the spouse, parent, child, brother, or
 * sister of an officer, director, or employee" from the committee. The app
 * has no record of family ties, so the roster check is board membership
 * only, and it says so.
 */
export const FL_RELATIVES_NOT_CHECKED =
  'Whether a committee member is the spouse, parent, child, brother or sister of an officer, director or employee (§ 720.305(2)(b)): HomeownerHub checks the panel against the board roster by name only. It has no record of family ties, or of officers and employees who don’t have a board or admin login.'

/** What BL-130 does not check, by state, because the text is not loaded or the record does not exist yet. */
export const NOT_LOADED: Record<string, { fine: string[]; letter: string[] }> = {
  CA: {
    fine: ['Whether the owner cured before the hearing (§ 5855(c)): the hearing record does not say whether the violation was cured.'],
    letter: [],
  },
  FL: {
    fine: [
      'Whether the violation was cured before the hearing (§ 720.305(2)(e)): the hearing record does not say whether the violation was cured.',
      FL_RELATIVES_NOT_CHECKED,
    ],
    letter: [],
  },
  TX: {
    fine: [],
    letter: ['§ 209.0063 order of applying payments: the app does not check how payments were applied.'],
  },
  GA: {
    fine: [],
    letter: [
      'How this account’s payments were applied: from January 1, 2027, § 43-17A-8 (SB 406 § 2) sets the order, but HomeownerHub doesn’t check the order past payments were applied in.',
    ],
  },
}

export function normaliseState(state: string | null | undefined): string | null {
  const s = (state ?? '').trim().toUpperCase()
  if (s === 'FLORIDA') return 'FL'
  if (s === 'CALIFORNIA') return 'CA'
  if (s === 'TEXAS') return 'TX'
  if (s === 'GEORGIA') return 'GA'
  return /^[A-Z]{2}$/.test(s) ? s : null
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
function dayMs(day: string): number | null {
  const m = DAY_RE.exec(day)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(ms) ? null : ms
}
/** Whole calendar days from `a` to `b`; null when either is unreadable. */
export function daysBetween(a: string, b: string): number | null {
  const x = dayMs(a)
  const y = dayMs(b)
  return x === null || y === null ? null : Math.round((y - x) / 86_400_000)
}

function finding(code: DriftCode, severity: DriftSeverity, message: string, citations: DriftCitation[], overrideReasons: OverrideReason[] = []): DriftFinding {
  return { code, severity, message, citations, overrideReasons: severity === 'block' ? [...overrideReasons, 'attorney_advised'] : [] }
}

function notLoadedFor(state: string | null, step: 'fine' | 'letter'): string[] {
  const own = state ? NOT_LOADED[state] : undefined
  if (!own) return [CHECK_WITH_ATTORNEY]
  return own[step]
}

// ─── Georgia registration (BL-149) ──────────────────────────────────

/**
 * The association's SB 406 registration as lib/ga-registration reads it
 * (signed, in compliance_settings), and the day it is checked on. Mirrors
 * GaRegistrationGateInput there; repeated so this file keeps no `@/`
 * imports. undefined = the caller didn't load it (nothing is checked).
 */
export interface GaRegistrationGate {
  status: 'registered' | 'lapsed' | 'not_registered' | 'opted_out' | 'unverified'
  /** YYYY-MM-DD: the association's today, or the letter date. */
  today: string
}

/**
 * A Georgia association not recorded as registered: a warning before
 * Jan 1, 2027, a block from that day (override: attorney advised only,
 * audited by the caller). `what` names the step in the message.
 */
function gaRegistrationFinding(
  code: 'ga_unregistered_fine' | 'ga_unregistered_fees' | 'ga_unregistered_lien',
  gate: GaRegistrationGate,
  what: string,
): DriftFinding | null {
  if (gate.status === 'registered') return null
  const live = gate.today >= GA_REGISTRATION_BAR_FROM
  const optedOut = gate.status === 'opted_out'
  const standing =
    gate.status === 'opted_out'
      ? 'The board recorded that this association opted out of registering with the Georgia Secretary of State.'
      : gate.status === 'lapsed'
        ? 'This association’s Georgia Secretary of State registration, as recorded in HomeownerHub, has lapsed (each registration expires on December 31).'
        : gate.status === 'unverified'
          ? 'The registration record in HomeownerHub can’t be verified, so this association counts as not registered with the Georgia Secretary of State.'
          : 'HomeownerHub has no record that this association is registered with the Georgia Secretary of State.'
  const rule = optedOut
    ? 'An association that opts out may not assess or collect fines, fees or accelerated assessments.'
    : 'An association that isn’t registered may not collect fines or fees, or file or record liens or start foreclosure.'
  const message = live
    ? `${standing} ${rule} Since January 1, 2027 this blocks ${what}. If the association is registered, record the filing in the registration kit; otherwise register first.`
    : `${standing} From January 1, 2027, ${rule.charAt(0).toLowerCase()}${rule.slice(1)} Record the registration in the registration kit before then, or this will block ${what}.`
  const citations = optedOut ? [GA_SB406_OPT_OUT_BAR, GA_SB406_IN_FORCE] : [GA_SB406_REGISTRATION_BAR, GA_SB406_IN_FORCE]
  return { ...finding(code, live ? 'block' : 'warn', message, citations), link: { ...GA_REGISTRATION_KIT } }
}

// ─── fines ───────────────────────────────────────────────────────────

/** hoa_violations.fine_amount (dollars, numeric — may arrive as a string) to cents; null when unset or unreadable. */
export function fineCents(amount: number | string | null | undefined): number | null {
  if (amount === null || amount === undefined || amount === '') return null
  const n = Number(amount)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/**
 * BL-133: the violation's hearing as the fine check needs it
 * (violation-hearings/rules.ts hearingFineFacts). Built only under
 * M4_APPLIED; without it the check reads exactly as before 0068.
 */
export interface FineHearingFacts {
  /** Held, with an outcome recorded. */
  held: boolean
  outcome: 'upheld' | 'reduced' | 'dismissed' | null
  /** Panel members marked as members (not on the board). */
  committeeMembers: number
  /** Panel members marked as on the board. */
  boardOnPanel: number
  /** Whole days from the notice to the hearing; null when either is unrecorded. */
  noticeDays: number | null
  /**
   * BL-140: panel members marked as owners whose name matches someone on
   * the board roster (org_members board/admin). undefined = not checked.
   */
  rosterConflicts?: number
}

export interface FineCheckInput {
  state: string | null | undefined
  /** The violation's fine (hoa_violations.fine_amount, dollars per day), in cents; null when none is set. */
  dailyFineCents: number | null
  /**
   * BL-133 (M4_APPLIED): the hearing record. undefined = hearings are not
   * on (the pre-0068 messages, unchanged); null = none recorded.
   */
  hearing?: FineHearingFacts | null
  /** BL-149: Georgia only. undefined = not loaded (nothing checked). */
  gaRegistration?: GaRegistrationGate
}

/** What a hearing record still lacks for the FL committee rule; [] = it meets it. */
function flHearingGaps(h: FineHearingFacts): string[] {
  const gaps: string[] = []
  if (h.noticeDays === null) gaps.push('the day the notice was sent and the hearing date')
  else if (h.noticeDays < 14) gaps.push(`at least 14 days’ notice (${h.noticeDays} recorded)`)
  else if (h.noticeDays > 90) gaps.push(`the hearing within 90 days of the notice (${h.noticeDays} recorded)`)
  if (h.boardOnPanel > 0) gaps.push('a committee with no officers, directors or employees on it')
  if ((h.rosterConflicts ?? 0) > 0) {
    const n = h.rosterConflicts!
    gaps.push(`a committee with no one from the board roster (${n} panel member${n === 1 ? '' : 's'} marked as owner${n === 1 ? '' : 's'} match${n === 1 ? 'es' : ''} a board member or admin by name)`)
  }
  if (h.committeeMembers < 3) gaps.push(`at least three committee members (${h.committeeMembers} recorded)`)
  if (!h.held) gaps.push('the hearing held, with the committee’s vote')
  return gaps
}

/** What a hearing record still lacks for CA § 5855; [] = it meets it. */
function caHearingGaps(h: FineHearingFacts): string[] {
  const gaps: string[] = []
  if (h.noticeDays === null) gaps.push('the day the notice was sent and the meeting date')
  else if (h.noticeDays < 10) gaps.push(`at least 10 days’ notice (${h.noticeDays} recorded)`)
  if (!h.held) gaps.push('the meeting held, with the board’s decision')
  return gaps
}

const listGaps = (g: string[]) => (g.length <= 1 ? g.join('') : `${g.slice(0, -1).join(', ')} and ${g[g.length - 1]}`)

/**
 * Before a violation moves to Fined. The app levies `fine_amount` per day
 * from the day it is fined; what the statute says about that amount, and
 * what it requires that the app has no record of.
 */
export function checkFine(input: FineCheckInput): DriftCheck {
  const state = normaliseState(input.state)
  const fine = input.dailyFineCents !== null && Number.isFinite(input.dailyFineCents) ? Math.max(0, Math.round(input.dailyFineCents)) : null
  const findings: DriftFinding[] = []

  if (state === 'CA') {
    if (fine !== null && fine > CA_FINE_CAP_CENTS) {
      findings.push(
        finding(
          'ca_fine_over_cap',
          'block',
          `The fine is ${usd(fine)} a day. A California fine may not exceed $100 per violation unless the violation may have an adverse health or safety impact and the board first made a written finding saying so at a board meeting open to members.`,
          [CA_5850_CAP, CA_5850_CAP_100, CA_5850_FINDING],
          ['health_safety_finding'],
        ),
      )
    }
    if (fine !== null && fine > 0) {
      findings.push(
        finding(
          'ca_fine_schedule',
          'warn',
          `The fine also may not exceed the penalty on the schedule in effect when the violation happened. Confirm ${usd(fine)} is on it, and how your schedule treats a violation that continues day after day.`,
          [CA_5850_CAP, CA_5850_SCHEDULE],
        ),
      )
    }
    findings.push(finding('ca_no_late_charge_on_fine', 'warn', 'Do not add a late charge or interest to this fine.', [CA_5850_NO_LATE_CHARGE]))
    const h = input.hearing
    if (h && h.held && h.outcome === 'dismissed') {
      findings.push(
        finding(
          'ca_hearing_no_fine',
          'block',
          'The hearing on record ended with no fine. A fine now would not follow the board’s own § 5855 decision.',
          [CA_5855_EFFECTIVE],
        ),
      )
    } else if (!h) {
      // null: hearings are on and none is recorded — a block (BL-140).
      // undefined: hearings are off — the pre-0068 warning, unchanged.
      findings.push(
        finding(
          'ca_hearing_not_recorded',
          h === null ? 'block' : 'warn',
          'HomeownerHub has no record of the § 5855 hearing (10 days’ written notice, the meeting, and the written decision within 14 days). The fine is not effective unless the board followed it.',
          [CA_5855_EFFECTIVE],
        ),
      )
    } else if (h) {
      const gaps = caHearingGaps(h)
      if (gaps.length > 0) {
        findings.push(
          finding(
            'ca_hearing_not_recorded',
            'block',
            `The hearing on record doesn’t yet show ${listGaps(gaps)}. The fine is not effective unless the board followed § 5855, including the written decision within 14 days.`,
            [CA_5855_EFFECTIVE],
          ),
        )
      }
    }
  } else if (state === 'FL') {
    if (fine !== null && fine > FL_FINE_CAP_CENTS) {
      findings.push(
        finding(
          'fl_fine_over_cap',
          'block',
          `The fine is ${usd(fine)} a day. A Florida fine may not exceed $100 per violation unless the governing documents provide otherwise.`,
          [FL_305_CAP],
          ['governing_documents_allow'],
        ),
      )
    }
    if (fine !== null && fine > 0) {
      const days = Math.ceil(FL_FINE_AGGREGATE_CENTS / fine)
      findings.push(
        finding(
          'fl_fine_aggregate',
          'warn',
          `A daily fine for a continuing violation may not exceed $1,000 in total unless the governing documents provide otherwise. At ${usd(fine)} a day that total is reached after ${days} day${days === 1 ? '' : 's'}; stop the fine there.`,
          [FL_305_AGGREGATE],
        ),
      )
    }
    const h = input.hearing
    if (h && h.held && h.outcome === 'dismissed') {
      findings.push(
        finding(
          'fl_hearing_no_fine',
          'block',
          'The hearing committee did not approve this fine. If the committee, by majority vote, does not approve a proposed fine, it may not be imposed.',
          [FL_305_VOTE],
        ),
      )
    } else if (!h) {
      // null: hearings are on and none is recorded — a block (BL-140).
      // undefined: hearings are off — the pre-0068 warning, unchanged.
      findings.push(
        finding(
          'fl_hearing_committee',
          h === null ? 'block' : 'warn',
          'HomeownerHub has no hearing record yet. A fine may not be imposed unless the owner got at least 14 days’ written notice of a hearing and a committee of at least three members who are not officers, directors or employees (or their relatives) approved it by majority vote.',
          [FL_305_COMMITTEE, FL_305_VOTE],
        ),
      )
    } else if (h) {
      const gaps = flHearingGaps(h)
      if (gaps.length > 0) {
        findings.push(
          finding(
            'fl_hearing_committee',
            'block',
            `The hearing on record doesn’t yet show ${listGaps(gaps)}. A fine may not be imposed unless the owner got at least 14 days’ written notice and a committee of at least three members who are not officers, directors or employees (or their relatives) approved it by majority vote.`,
            [FL_305_COMMITTEE, FL_305_VOTE],
          ),
        )
      }
    }
  } else if (state === 'TX') {
    findings.push(
      finding(
        'tx_fine_certified_notice',
        'warn',
        'Before levying a fine, the association must give the owner written notice by certified mail. HomeownerHub doesn’t record how the notice was mailed; confirm it went certified.',
        [TX_006_NOTICE],
      ),
    )
    findings.push(
      finding(
        'tx_fine_cure_period',
        'warn',
        'If the owner cured the violation within the cure period the notice gave, no fine may be assessed.',
        [TX_006_CURE],
      ),
    )
  } else if (state === 'GA') {
    const reg = input.gaRegistration ? gaRegistrationFinding('ga_unregistered_fine', input.gaRegistration, 'levying this fine') : null
    if (reg) findings.push(reg)
    findings.push(
      finding(
        'ga_fine_instrument',
        'warn',
        'A Georgia association may fine only if, and as far as, its instrument (the declaration) provides. Confirm the declaration authorizes this fine.',
        [GA_223_FINES],
      ),
    )
  }

  return { state, findings, notLoaded: notLoadedFor(state, 'fine') }
}

// ─── collections letters ─────────────────────────────────────────────

/** Ledger charge types that are attorney's fees or collection costs (migrations/0047). */
export const COLLECTION_FEE_TYPES = ['collection_legal', 'collection_processing'] as const
export const ATTORNEY_FEE_TYPES = ['collection_legal'] as const

export interface PrintedLetter {
  /** The letter kind (collections/letters LETTER_KINDS). */
  kind: string
  /** The association day it was first printed (YYYY-MM-DD). */
  printedOn: string
}

export interface LetterCheckInput {
  state: string | null | undefined
  /** collections/letters LETTER_KINDS. */
  kind: string
  /** The letter date, the association's today (YYYY-MM-DD). */
  letterDate: string
  /** The ledger charge types the letter lists (assessment_type, or 'plan_installment'). */
  listedChargeTypes: readonly string[]
  /** The board's BLANK entries (the payment-plan text on a TX notice). */
  values: Readonly<Record<string, string | undefined>>
  /** The case's recorded collections events. */
  events: readonly { eventType: string; occurredOn: string }[]
  /** Letters on this case already printed. */
  printed: readonly PrintedLetter[]
  /** BL-149: Georgia only, checked on the letter date. undefined = not loaded (nothing checked). */
  gaRegistration?: GaRegistrationStatusOnly
  /**
   * BL-155: a Georgia condominium association. The SB 406 § 7 attorney's-fee
   * rules are added to an Article 6 section, and Article 6 does not govern
   * condominium associations (§ 44-3-235(b)), so they are not checked; the
   * registration bar (Title 43 Ch. 17A) still is.
   */
  gaCondo?: boolean
}

/** The letter check reads the status only: the letter date is the day it is checked on. */
export type GaRegistrationStatusOnly = Pick<GaRegistrationGate, 'status'>

/** A payment-plan entry that offers nothing: blank, or "Not applicable" and the like. */
export function offersNoPlan(text: string | undefined): boolean {
  const t = (text ?? '').trim().toLowerCase().replace(/[.\s]+$/g, '')
  return t === '' || /^(n\/?a|none|no|not applicable|no payment plan|no plan|not offered)$/.test(t)
}

/**
 * Before a collections letter is saved to Approvals, and again before
 * the approved letter prints (the letter date can move).
 */
export function checkCollectionsLetter(input: LetterCheckInput): DriftCheck {
  const state = normaliseState(input.state)
  const types = new Set(input.listedChargeTypes)
  const has = (list: readonly string[]) => list.some((t) => types.has(t))
  const findings: DriftFinding[] = []
  const atLeast = (day: string, n: number) => {
    const d = daysBetween(day, input.letterDate)
    return d !== null && d >= n
  }

  if (state === 'TX') {
    if (has(COLLECTION_FEE_TYPES)) {
      const noticed = input.printed.some((p) => p.kind === 'tx_delinquency' && atLeast(p.printedOn, TX_NOTICE_CURE_DAYS))
      if (!noticed) {
        findings.push(
          finding(
            'tx_collection_fees_without_notice',
            'block',
            'This letter lists attorney or collection-processing fees. If they are a collection agent’s fees, the owner can’t be held liable for them unless a § 209.0064 notice went by certified mail at least 45 days earlier. No delinquency notice printed 45 or more days ago is recorded on this case.',
            [TX_0064_NOTICE, TX_0064_CURE],
            ['notice_sent_outside_app', 'not_collection_agent_fees'],
          ),
        )
      }
    }
    if (input.kind === 'tx_delinquency' && offersNoPlan(input.values.paymentPlan) && (input.values.paymentPlan ?? '').trim() !== '') {
      findings.push(
        finding(
          'tx_payment_plan_missing',
          'block',
          'The notice offers no payment plan. An association of more than 14 lots must have payment-plan guidelines, and then the notice must describe the plan.',
          [TX_0062_PLAN, TX_0064_PLAN],
          ['not_subject_to_payment_plan', 'payment_plan_exception'],
        ),
      )
    }
  } else if (state === 'GA') {
    // BL-149: the registration bar applies to every Georgia letter that asks
    // for fines or fees (the BL-148 § 7(f) notice included), and to the
    // notice before foreclosure (it starts foreclosure).
    if (input.gaRegistration && has(FINE_OR_FEE_TYPES)) {
      const reg = gaRegistrationFinding(
        'ga_unregistered_fees',
        { status: input.gaRegistration.status, today: input.letterDate },
        'a letter that asks for fines or fees',
      )
      if (reg) findings.push(reg)
    }
    if (input.gaRegistration && (input.kind === 'ga_pre_foreclosure' || input.kind === 'ga_condo_pre_foreclosure')) {
      const reg = gaRegistrationFinding(
        'ga_unregistered_lien',
        { status: input.gaRegistration.status, today: input.letterDate },
        'a notice before foreclosure',
      )
      if (reg) findings.push(reg)
    }
    // BL-148: the SB 406 § 7(f) notice is a letter kind of its own. On the
    // notice itself the fees it lists are what it gives 30 days to pay, so
    // nothing blocks; what the app can't see (the delivery method and the
    // day the owner received it) is a warning.
    if (input.gaCondo) {
      // BL-155: no SB 406 § 7 checks for a condominium (see LetterCheckInput.gaCondo).
    } else if (input.kind === 'ga_fee_notice') {
      findings.push(
        finding(
          'ga_fee_notice_delivery',
          'warn',
          'Send this notice by certified mail or statutory overnight delivery. The owner’s 30 days to pay run from the day they receive it. HomeownerHub doesn’t record how it was mailed or when it was received: keep the receipt, and add the tracking number and delivery date as a note on the collections case.',
          [GA_SB406_NOTICE, GA_SB406_RECEIPT],
        ),
      )
    } else if (has(ATTORNEY_FEE_TYPES) && input.letterDate >= GA_SB406_FEES_FROM) {
      const noticed = input.printed.some((p) => p.kind === 'ga_fee_notice' && atLeast(p.printedOn, GA_FEE_NOTICE_DAYS))
      if (noticed) {
        findings.push(
          finding(
            'ga_attorney_fees_receipt',
            'warn',
            'A Georgia notice before attorney’s fees was printed on this case at least 30 days ago. The 30 days run from the day the owner received it, which HomeownerHub doesn’t record. Confirm the receipt date, and that the owner was given an itemized list of the attorney’s fees claimed.',
            [GA_SB406_RECEIPT, GA_SB406_ITEMIZED],
          ),
        )
      } else {
        findings.push(
          finding(
            'ga_attorney_fees_prerequisites',
            'block',
            'This letter lists attorney’s fees. Since July 1, 2026, before collecting attorney’s fees the association must first send a written notice by certified mail or statutory overnight delivery identifying the outstanding fines or fees, give the owner 30 days from receipt to pay, and provide an itemized list of the fees claimed. No notice before attorney’s fees printed 30 or more days ago is recorded on this case.',
            [GA_SB406_FEES, GA_SB406_NOTICE, GA_SB406_ITEMIZED],
            ['notice_sent_outside_app', 'emergency_conditions'],
          ),
        )
      }
    }
    const sb406In2027 = input.letterDate >= GA_SB406_2027_FROM
    if (input.kind === 'ga_pre_foreclosure') {
      findings.push(
        finding(
          'ga_foreclosure_notice_delivery',
          'warn',
          `Send this notice by certified mail or statutory overnight delivery, return receipt requested, to the owner at the lot’s address and at every other address the owner gave the association in writing. The lien can be foreclosed no sooner than ${sb406In2027 ? 60 : 30} days after it is sent. HomeownerHub doesn’t record how it was mailed: keep the receipts, and add the tracking numbers as a note on the collections case.`,
          [sb406In2027 ? GA_232C_2027_NOTICE : GA_232C_NOTICE],
        ),
      )
    }
    // BL-154: from January 1, 2027 every payment is applied dues first
    // (§ 43-17A-8). The app can't see the order past payments were applied
    // in, and that order decides which charges are still unpaid.
    if (sb406In2027) {
      findings.push(
        finding(
          'ga_payment_order',
          'warn',
          'Since January 1, 2027, Georgia requires every payment to be applied to regular assessments (dues) first, then special assessments, then specific assessments, then other fees and fines, and an association may not refuse a payment in any amount for an assessment. HomeownerHub doesn’t check how this account’s payments were applied. Before sending, confirm they were applied in that order: it can change which charges are still unpaid.',
          [GA_17A8_ORDER, GA_17A8_NO_REFUSAL],
        ),
      )
    }
    if (input.kind === 'ga_condo_pre_foreclosure') {
      findings.push(
        finding(
          'ga_condo_foreclosure_notice_delivery',
          'warn',
          'Send this notice by certified mail or statutory overnight delivery, return receipt requested, to the unit owner at the unit’s address and at every other address the owner gave the association in writing. The lien can be foreclosed no sooner than 30 days after it is sent. HomeownerHub doesn’t record how it was mailed: keep the receipts, and add the tracking numbers as a note on the collections case.',
          [GA_CONDO_FORECLOSURE_NOTICE],
        ),
      )
    }
  } else if (state === 'FL') {
    if (has(ATTORNEY_FEE_TYPES)) {
      const noticed = input.events.some((e) => e.eventType === 'lien_warning_sent' && atLeast(e.occurredOn, FL_LATE_NOTICE_WAIT_DAYS))
      if (!noticed) {
        findings.push(
          finding(
            'fl_attorney_fees_without_late_notice',
            'block',
            'This letter lists attorney’s fees. Attorney fees on a past-due assessment can’t be required until a notice of late assessment is delivered and the owner has had the chance to pay without them. No notice of late assessment recorded 30 or more days ago is on this case.',
            [FL_3085_LATE_NOTICE],
            ['notice_sent_outside_app'],
          ),
        )
      }
    }
  } else if (state === 'CA') {
    if (types.has('fine') && types.has('late_fee')) {
      findings.push(
        finding(
          'ca_late_charge_with_fine',
          'warn',
          'This letter lists a fine and late charges. No late charge or interest may be charged on a fine: confirm none of the late charges is on the fine.',
          [CA_5850_NO_LATE_CHARGE],
        ),
      )
    }
  }

  return { state, findings, notLoaded: notLoadedFor(state, 'letter') }
}

// ─── liens (BL-149) ──────────────────────────────────────────────────

export interface LienCheckInput {
  state: string | null | undefined
  /** Georgia only. undefined = not loaded (nothing checked). */
  gaRegistration?: GaRegistrationGate
}

/**
 * Before the board records that a lien was filed on a collections case.
 * Today only Georgia's registration bar applies; other states' lien rules
 * live in the collections letters (FL, CA) and are not re-checked here.
 */
export function checkLien(input: LienCheckInput): DriftCheck {
  const state = normaliseState(input.state)
  const findings: DriftFinding[] = []
  if (state === 'GA' && input.gaRegistration) {
    const reg = gaRegistrationFinding('ga_unregistered_lien', input.gaRegistration, 'filing or recording a lien')
    if (reg) findings.push(reg)
  }
  return { state, findings, notLoaded: [] }
}

// ─── the board's override ────────────────────────────────────────────

export interface AppliedOverride {
  code: DriftCode
  reason: OverrideReason
}

export function blockingFindings(check: DriftCheck): DriftFinding[] {
  return check.findings.filter((f) => f.severity === 'block')
}

/**
 * Every blocking finding needs its own override reason, one the finding
 * allows. Never silently allowed: a missing or unknown reason refuses.
 */
export function resolveOverrides(
  check: DriftCheck,
  overrides: Readonly<Record<string, string>> | null | undefined,
): { ok: true; applied: AppliedOverride[] } | { ok: false; error: string; missing: DriftCode[] } {
  const applied: AppliedOverride[] = []
  const missing: DriftCode[] = []
  for (const f of blockingFindings(check)) {
    const reason = overrides?.[f.code]
    if (reason && (f.overrideReasons as string[]).includes(reason)) applied.push({ code: f.code, reason: reason as OverrideReason })
    else missing.push(f.code)
  }
  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      error: `The state law check found ${missing.length === 1 ? 'a problem' : `${missing.length} problems`} that block this step. Fix ${missing.length === 1 ? 'it' : 'them'}, or record the board’s reason for going ahead.`,
    }
  }
  return { ok: true, applied }
}

/** The audit_log row for an override: ids and codes only — never a name, an address or free text. */
export const STATUTE_OVERRIDE_ACTION = 'statute_check.override'

export function overrideAuditRow(args: {
  orgId: string
  userId: string
  entityType: 'hoa_violation' | 'collections_letter' | 'collection_case'
  entityId: string
  step: 'fine' | 'collections_letter' | 'lien'
  state: string | null
  applied: AppliedOverride[]
  extra?: Record<string, string | null>
}) {
  return {
    action: STATUTE_OVERRIDE_ACTION,
    org_id: args.orgId,
    user_id: args.userId,
    entity_type: args.entityType,
    entity_id: args.entityId,
    metadata: {
      step: args.step,
      state: args.state,
      overrides: args.applied.map((a) => ({ code: a.code, reason: a.reason })),
      ...(args.extra ?? {}),
    },
  }
}
