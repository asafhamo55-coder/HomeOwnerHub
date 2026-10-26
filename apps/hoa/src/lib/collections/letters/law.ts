/**
 * What the collections letters say about the law, per state (BL-089).
 * Citations and the statutory form wording as text, never legal advice.
 * Pure and client-safe.
 *
 * FLORIDA — checked against the official 2026 chapter 720 text
 * (scripts/fixtures/state-law/flsenate-ch720-2026.html, the Florida
 * Senate's "2026 Florida Statutes"; § 720.3085 history ends "s. 10,
 * ch. 2024-221", which is 2024's HB 1203):
 *   - § 720.3085(3)(d) — the NOTICE OF LATE ASSESSMENT. The BL-089 brief
 *     called this (3)(a); in the current text (3)(a) is the late-fee cap
 *     and the notice is (3)(d), the paragraph HB 1203 added together with
 *     the (3)(c) invoice-delivery rules. No attorney fees on a past-due
 *     assessment until this notice is delivered. First-class mail to the
 *     owner's last address and, if different, to the parcel address. The
 *     owner gets 30 days "after the date of this letter".
 *   - § 720.3085(4) — the NOTICE OF INTENT TO RECORD A CLAIM OF LIEN: 45
 *     days "following the date the notice is deposited in the mail" (the
 *     form says "after your receipt of this letter"), by registered or
 *     certified mail, return receipt requested, AND first-class mail.
 *   - § 720.3085(3) — interest at the declaration's rate, or 18% a year
 *     simple if it sets none; (3)(a) late fee up to the greater of $25 or
 *     5% of the installment.
 *   - The statute does not itself order the two notices. The waiting rule
 *     here (no intent-to-lien letter until 30 days after the late notice)
 *     comes from the late notice's own words: it is notice "to proceed
 *     with further collection action against your property no sooner than
 *     30 days after the date of this letter".
 *
 * CALIFORNIA — the official Civil Code text from the Legislative
 * Counsel's bulk data (pubinfo_2025.zip, LAW_SECTION_TBL rows dated
 * 2026-10-02), added to scripts/fixtures/state-law/ca-civ-davis-stirling-2026.txt:
 *   - § 5660 — at least 30 days before recording a lien, notice by
 *     certified mail with the contents (a)–(f).
 *   - § 5650(b) — assessments are delinquent 15 days after they are due;
 *     late charge up to the greater of 10% or $10; interest up to 12% a
 *     year, starting 30 days after the due date.
 *   - § 5665 — the owner may ask in writing to meet the board about a
 *     payment plan; if mailed within 15 days of the notice's postmark the
 *     board meets within 45 days of the request's postmark.
 *
 * TEXAS — Property Code § 209.0064 from the Texas Legislative Council's
 * official text (scripts/fixtures/state-law/tx-prop-209-2026.txt): before
 * an owner can be held liable for a collection agent's fees, written
 * notice by certified mail that (1) itemizes each delinquent amount and
 * the total, (2) describes payment-plan options where § 209.0062 or the
 * dedicatory instruments require one, and (3) gives at least 45 days to
 * cure.
 *
 * GEORGIA (BL-148) — the Property Owners' Association Act snapshot
 * (scripts/fixtures/state-law/ga-ocga-44-3-art6-2026.txt):
 *   - Ga. L. 2026, SB 406 § 7, new subsection (f) — in force July 1,
 *     2026: before collecting attorney's fees, (1) a written notice by
 *     certified mail or statutory overnight delivery identifying the
 *     outstanding fines or delinquent fees, (2) 30 days FROM RECEIPT to
 *     pay, (3) an itemized list of the attorney's fees claimed.
 *   - O.C.G.A. § 44-3-232(c), the text in force until January 1, 2027:
 *     notice by certified mail or statutory overnight delivery, return
 *     receipt requested, to the lot's address AND any address the owner
 *     designated in writing, not less than 30 days before foreclosure;
 *     the notice states the assessments due, the authorized late charges
 *     and the interest rate; no foreclosure under $2,000.00; the lien
 *     lapses four years after an assessment first became due.
 *   - § 44-3-232(b)(1)–(2): late charge up to the greater of $10.00 or 10%,
 *     interest up to 10% a year, each only to the extent the instrument
 *     provides.
 *   - BL-154: § 44-3-232(c) as SB 406 § 5 rewrites it from January 1, 2027
 *     (scripts/fixtures/state-law/ga-sb406-2026-2027-text.txt, the official
 *     bill with struck words removed): notice not less than 60 days before
 *     foreclosure, and it must state that paying the amount before the
 *     sixtieth day after receipt eliminates the right of foreclosure; no
 *     foreclosure unless the lien is at least the lesser of $4,000.00 or 12
 *     months of regular assessments, but not less than $2,000.00, counting
 *     no specific assessment (§ 43-17A-1(10): late charges, fines, damage
 *     charges) and no other fine or fee; the lien lapses after six years.
 *     Every GA pre-foreclosure rule picks its text by the letter date
 *     (gaForeclosureLaw): before 2027 nothing changes.
 *   Georgia sets no statutory form wording, so the letters carry what the
 *   statute requires in plain words and quote the statute verbatim
 *   (GA_FEE_NOTICE_QUOTES, GA_PRE_FORECLOSURE_QUOTES and
 *   GA_PRE_FORECLOSURE_QUOTES_2027; law.test.ts checks every quote against
 *   its fixture).
 *
 * GEORGIA CONDOMINIUMS (BL-155) — a Georgia association whose type is
 * 'condo' gets the Georgia Condominium Act instead
 * (scripts/fixtures/state-law/ga-ocga-44-3-art3-2026.txt, quotes in
 * lib/ga-condo/law.ts):
 *   - O.C.G.A. § 44-3-109(c): the same notice (certified mail or statutory
 *     overnight delivery, return receipt requested, to the unit's address
 *     AND any address the owner designated in writing, not less than 30
 *     days before foreclosure; the assessments due, authorized late
 *     charges and the interest rate), the same $2,000.00 floor and the
 *     same four-year lapse;
 *   - § 44-3-109(b)(1)–(2): the same late-charge and 10% interest caps.
 *   SB 406 does NOT amend Article 3, so this notice is NOT cut off on
 *   January 1, 2027. SB 406 § 7 (attorney's-fee prerequisites) is added to
 *   an Article 6 section, and Article 6 does not govern condominium
 *   associations (§ 44-3-235(b)), so a condo gets no § 7 fee notice. The
 *   SB 406 registration bar (Title 43 Ch. 17A) does cover condominiums and
 *   is checked as for any Georgia association.
 *
 * Every other state gets a plain past-due letter with no statutory claims.
 */

import {
  GA_17A1_SPECIFIC,
  GA_232C_2027_CONTENTS,
  GA_232C_2027_LAPSE,
  GA_232C_2027_MINIMUM,
  GA_232C_2027_NOTICE,
  GA_232C_CONTENTS,
  GA_232C_LAPSE,
  GA_232C_MINIMUM,
  GA_232C_NOTICE,
  GA_232_INTEREST,
  GA_SB406_FEES,
  GA_SB406_ITEMIZED,
  GA_SB406_NOTICE,
  GA_SB406_RECEIPT,
  type DriftCitation,
} from '../../compliance/statute-drift'
import {
  GA_CONDO_FORECLOSURE_FLOOR,
  GA_CONDO_FORECLOSURE_NOTICE,
  GA_CONDO_INTEREST,
  GA_CONDO_LIEN_LAPSE,
  GA_CONDO_NOTICE_CONTENTS,
} from '../../ga-condo/law'

export const LETTER_DISCLAIMER =
  'This is general information, not legal advice. Check every figure against your books and the current statute, and ask your association’s attorney before sending a notice that leads to a lien.'

// ─── Florida § 720.3085 ──────────────────────────────────────────────

export const FL_LATE_NOTICE_CITATION = 'Fla. Stat. § 720.3085(3)(d)'
export const FL_INTENT_CITATION = 'Fla. Stat. § 720.3085(4)'
export const FL_STATUTE_URL = 'https://www.flsenate.gov/Laws/Statutes/2026/720.3085'

/** § 720.3085(3)(d): "must be paid within 30 days after the date of this letter". */
export const FL_LATE_NOTICE_DAYS = 30
/** § 720.3085(4)(a): "45 days following the date the notice is deposited in the mail". */
export const FL_INTENT_DAYS = 45
/** § 720.3085(3): 18% a year simple when the declaration and bylaws set no rate. */
export const FL_DEFAULT_INTEREST_PERCENT = 18

export const FL_LATE_NOTICE_BODY = (association: string) =>
  `The following amounts are currently due on your account to ${association}, and must be paid within 30 days after the date of this letter. This letter shall serve as the association’s notice to proceed with further collection action against your property no sooner than 30 days after the date of this letter, unless you pay in full the amounts set forth below:`

export const FL_INTENT_BODY = (association: string) =>
  `The following amounts are currently due on your account to ${association}, and must be paid within 45 days after your receipt of this letter. This letter shall serve as the association’s notice of intent to record a Claim of Lien against your property no sooner than 45 days after your receipt of this letter, unless you pay in full the amounts set forth below:`

export const FL_LATE_NOTICE_MAILING =
  'Send by first-class United States mail to the owner’s last address in the association’s records and, if that is not the parcel address, also to the parcel address (§ 720.3085(3)(d)). A sworn affidavit of mailing by a board member, officer, agent or licensed manager creates a presumption that it was mailed.'

export const FL_INTENT_MAILING =
  'Send by registered or certified mail, return receipt requested, and by first-class United States mail, to the owner’s last address in the association’s records and, if that is not the parcel address, also to the parcel address (§ 720.3085(4)(b)). A claim of lien may not be recorded until 45 days after the notice is deposited in the mail.'

export const FL_FINE_NOTE =
  'Fines are not listed. These notices are for assessments, and under § 720.305 a fine of less than $1,000 may not become a lien.'

// ─── California § 5660 ───────────────────────────────────────────────

export const CA_CITATION = 'Cal. Civ. Code § 5660'
/** § 5660: "At least 30 days prior to recording a lien". */
export const CA_PRE_LIEN_DAYS = 30
/** § 5650(b): "delinquent 15 days after they become due". */
export const CA_DELINQUENT_AFTER_DAYS = 15
/** § 5650(b)(3): interest may not exceed 12 percent a year. */
export const CA_MAX_INTEREST_PERCENT = 12

export const CA_IMPORTANT_NOTICE =
  'IMPORTANT NOTICE: IF YOUR SEPARATE INTEREST IS PLACED IN FORECLOSURE BECAUSE YOU ARE BEHIND IN YOUR ASSESSMENTS, IT MAY BE SOLD WITHOUT COURT ACTION.'

/** § 5660(a) inspection, (c)–(f): the statements the notice must carry, in plain words. */
export const CA_RIGHTS: { cite: string; text: string }[] = [
  { cite: '§ 5660(a)', text: 'You have the right to inspect the association’s records under Civil Code § 5205.' },
  { cite: '§ 5660(c)', text: 'You are not liable to pay the charges, interest and costs of collection if it is determined that the assessment was paid on time to the association.' },
  {
    cite: '§ 5660(d)',
    text: 'You have the right to request a meeting with the board under Civil Code § 5665 to discuss a payment plan. If your written request is mailed within 15 days of the postmark of this notice, the board will meet with you in executive session within 45 days of the postmark of your request.',
  },
  { cite: '§ 5660(e)', text: 'You have the right to dispute the assessment debt by submitting a written request for dispute resolution under the association’s “meet and confer” program (Civil Code § 5900 and following).' },
  {
    cite: '§ 5660(f)',
    text: 'You have the right to request alternative dispute resolution with a neutral third party (Civil Code § 5925 and following) before the association may initiate foreclosure against your separate interest, except that binding arbitration is not available if the association intends to initiate a judicial foreclosure.',
  },
]

export const CA_MAILING =
  'Send by certified mail to the owner of record (§ 5660). A lien may not be recorded until at least 30 days after this notice.'

export const CA_FINE_NOTE = 'Fines are not listed. This notice is for the assessment debt described in § 5650.'

// ─── Texas § 209.0064 ────────────────────────────────────────────────

export const TX_CITATION = 'Tex. Prop. Code § 209.0064'
/** § 209.0064(b)(3): "a period of at least 45 days for the owner to cure". */
export const TX_CURE_DAYS = 45

export const TX_MAILING =
  'Send by certified mail (§ 209.0064(b)). Without this notice the owner cannot be held liable for a collection agent’s fees.'

// ─── Georgia SB 406 § 7 and § 44-3-232(c) (BL-148) ──────────────────

export const GA_FEE_NOTICE_CITATION = 'Ga. L. 2026, SB 406 § 7 (new subsection (f))'
export const GA_PRE_FORECLOSURE_CITATION = 'O.C.G.A. § 44-3-232(c)'

/** SB 406 § 7(f)(2): "30 days from the receipt of the notice". */
export const GA_FEE_NOTICE_DAYS = 30
/** § 44-3-232(c): "Not less than 30 days after notice is sent". */
export const GA_PRE_FORECLOSURE_DAYS = 30
/** § 44-3-232(c): "unless the amount of the lien is at least $2,000.00". */
export const GA_FORECLOSURE_MIN_CENTS = 200_000
/** § 44-3-232(b)(2): "a rate not in excess of 10 percent per annum". */
export const GA_MAX_INTEREST_PERCENT = 10
/** § 44-3-232(c): the lien lapses "four years after the assessment or installment first became due and payable". */
export const GA_LIEN_LAPSE_YEARS = 4
/** Lines whose lien lapses within this many days of the letter date get a warning. */
export const GA_LAPSE_WARN_DAYS = 180
/** SB 406 § 5 replaces § 44-3-232(c) from this day (§ 9(a)); both texts are loaded (BL-154). */
export const GA_232C_REPLACED_ON = '2027-01-01'
/** § 44-3-232(c) from 2027: "Not less than 60 days after notice is sent". */
export const GA_PRE_FORECLOSURE_DAYS_2027 = 60
/** § 44-3-232(c) from 2027: the lien lapses "six years after the assessment or installment first became due". */
export const GA_LIEN_LAPSE_YEARS_2027 = 6
/** § 44-3-232(c) from 2027: "the lesser of $4,000.00 or an amount equal to 12 months of regular assessments". */
export const GA_FORECLOSURE_CAP_CENTS_2027 = 400_000
/** ... "but not less than $2,000.00": the floor stays GA_FORECLOSURE_MIN_CENTS. */
export const GA_FORECLOSURE_MONTHS_2027 = 12

/**
 * The 2027 foreclosure threshold: the lesser of $4,000.00 or 12 months of
 * regular assessments, but not less than $2,000.00.
 */
export function gaForeclosureThresholdCents(twelveMonthsCents: number): number {
  return Math.max(GA_FORECLOSURE_MIN_CENTS, Math.min(GA_FORECLOSURE_CAP_CENTS_2027, Math.max(0, twelveMonthsCents)))
}

/** Printed on the fee notice under "What the law requires", verbatim. */
export const GA_FEE_NOTICE_QUOTES: readonly DriftCitation[] = [GA_SB406_FEES, GA_SB406_NOTICE, GA_SB406_RECEIPT, GA_SB406_ITEMIZED]
/** Printed on the pre-foreclosure notice dated before January 1, 2027, verbatim. */
export const GA_PRE_FORECLOSURE_QUOTES: readonly DriftCitation[] = [GA_232C_NOTICE, GA_232C_CONTENTS, GA_232C_MINIMUM, GA_232C_LAPSE, GA_232_INTEREST]
/** Printed on the pre-foreclosure notice dated on or after January 1, 2027, verbatim (BL-154). */
export const GA_PRE_FORECLOSURE_QUOTES_2027: readonly DriftCitation[] = [
  GA_232C_2027_NOTICE,
  GA_232C_2027_CONTENTS,
  GA_232C_2027_MINIMUM,
  GA_17A1_SPECIFIC,
  GA_232C_2027_LAPSE,
  GA_232_INTEREST,
]

export const GA_FEE_NOTICE_BODY = (association: string) =>
  `This is the written notice from ${association} under Georgia law (Ga. L. 2026, SB 406 § 7) identifying the outstanding fines and delinquent fees on your account. They are listed below. You have 30 days from the day you receive this notice to pay them.`

export const GA_PRE_FORECLOSURE_BODY = (association: string) =>
  `This is notice from ${association} under O.C.G.A. § 44-3-232(c). The amounts below are owed on your lot and are secured by the association’s lien. The association may foreclose that lien by court action no sooner than 30 days after this notice is sent. To pay, or to discuss your account, contact the association.`

export const GA_FEE_NOTICE_MAILING =
  'Send by certified mail or statutory overnight delivery to the lot owner (SB 406 § 7(f)(1)). The 30 days to pay run from the day the owner receives it, so keep the receipt. HomeownerHub has no certified-mail tracking field: add the tracking number and delivery date as a note on the collections case.'

export const GA_PRE_FORECLOSURE_MAILING =
  'Send by certified mail or statutory overnight delivery, return receipt requested, to the owner both at the lot’s address and at every other address the owner designated to the association in writing (§ 44-3-232(c)). The lien may be foreclosed no sooner than 30 days after it is sent. HomeownerHub has no certified-mail tracking field: add the tracking numbers as a note on the collections case.'

/** BL-154: the notice dated on or after January 1, 2027 (SB 406 § 5's text of § 44-3-232(c)). */
export const GA_PRE_FORECLOSURE_BODY_2027 = (association: string) =>
  `This is notice from ${association} under O.C.G.A. § 44-3-232(c). The assessments, authorized late charges and interest below are owed on your lot and are secured by the association’s lien. The association may foreclose that lien by court action no sooner than 60 days after this notice is sent. Payment of the amount below prior to the sixtieth day following your receipt of this notice will eliminate the right of foreclosure. To pay, or to discuss your account, contact the association.`

export const GA_PRE_FORECLOSURE_MAILING_2027 =
  'Send by certified mail or statutory overnight delivery, return receipt requested, to the owner both at the lot’s address and at every other address the owner designated to the association in writing (§ 44-3-232(c)). The lien may be foreclosed no sooner than 60 days after it is sent. HomeownerHub has no certified-mail tracking field: add the tracking numbers as a note on the collections case.'

/** BL-154: from 2027 fines and fees don't count toward the threshold and aren't part of the amount the notice states. */
export const GA_2027_FINE_NOTE =
  'Fines and other fees are not listed. Since January 1, 2027 no specific assessment (late charges, fines, damage charges) or other fine or fee counts toward the foreclosure threshold, and this notice states the assessments, authorized late charges and interest (§ 44-3-232(c), § 43-17A-1(10)).'

/** The text of § 44-3-232(c) a GA pre-foreclosure notice dated `letterDate` rests on. */
export interface GaForeclosureLaw {
  /** True from January 1, 2027 (SB 406 § 5). */
  sb406: boolean
  days: number
  lapseYears: number
  quotes: readonly DriftCitation[]
  body: (association: string) => string
  mailing: string
}

export function gaForeclosureLaw(letterDate: string): GaForeclosureLaw {
  return letterDate >= GA_232C_REPLACED_ON
    ? {
        sb406: true,
        days: GA_PRE_FORECLOSURE_DAYS_2027,
        lapseYears: GA_LIEN_LAPSE_YEARS_2027,
        quotes: GA_PRE_FORECLOSURE_QUOTES_2027,
        body: GA_PRE_FORECLOSURE_BODY_2027,
        mailing: GA_PRE_FORECLOSURE_MAILING_2027,
      }
    : {
        sb406: false,
        days: GA_PRE_FORECLOSURE_DAYS,
        lapseYears: GA_LIEN_LAPSE_YEARS,
        quotes: GA_PRE_FORECLOSURE_QUOTES,
        body: GA_PRE_FORECLOSURE_BODY,
        mailing: GA_PRE_FORECLOSURE_MAILING,
      }
}

export const GA_ATTORNEY_FEES_NOTE =
  'Attorney’s fees can’t be collected until the owner has had 30 days from receiving this notice, and the owner must also get an itemized list of the attorney’s fees claimed (SB 406 § 7(f)(3)). Enter that list below, or “None claimed”.'

// ─── Georgia condominiums § 44-3-109(c) (BL-155) ─────────────────────

export const GA_CONDO_PRE_FORECLOSURE_CITATION = 'O.C.G.A. § 44-3-109(c)'

/** Printed on the condominium pre-foreclosure notice, verbatim (lib/ga-condo/law.test.ts checks each). */
export const GA_CONDO_PRE_FORECLOSURE_QUOTES: readonly DriftCitation[] = [
  GA_CONDO_FORECLOSURE_NOTICE,
  GA_CONDO_NOTICE_CONTENTS,
  GA_CONDO_FORECLOSURE_FLOOR,
  GA_CONDO_LIEN_LAPSE,
  GA_CONDO_INTEREST,
]

export const GA_CONDO_PRE_FORECLOSURE_BODY = (association: string) =>
  `This is notice from ${association} under O.C.G.A. § 44-3-109(c), part of the Georgia Condominium Act. The amounts below are owed on your unit and are secured by the association’s lien. The association may foreclose that lien by court action no sooner than 30 days after this notice is sent. To pay, or to discuss your account, contact the association.`

export const GA_CONDO_PRE_FORECLOSURE_MAILING =
  'Send by certified mail or statutory overnight delivery, return receipt requested, to the unit owner both at the unit’s address and at every other address the owner designated to the association in writing (§ 44-3-109(c)). The lien may be foreclosed no sooner than 30 days after it is sent. HomeownerHub has no certified-mail tracking field: add the tracking numbers as a note on the collections case.'

// ─── generic ─────────────────────────────────────────────────────────

export const GENERIC_NOTE = 'A plain past-due letter. It makes no claim about any state statute; check your governing documents and state law before any lien or collection step.'
