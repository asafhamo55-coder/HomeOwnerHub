/**
 * BL-155: the Georgia Condominium Act (O.C.G.A. Title 44, Ch. 3, Art. 3,
 * §§ 44-3-70 to 44-3-117) for Georgia associations whose type is 'condo'.
 * Pure and client-safe: compliance, the statement of amounts due
 * (estoppel), collections letters, meeting notices and the insurance check
 * all quote from here.
 *
 * THE RULE. Every quote is copied word for word from
 * scripts/fixtures/state-law/ga-ocga-44-3-art3-2026.txt (release 86 of the
 * State's O.C.G.A., with Ga. L. 2024 HB 220 applied), and law.test.ts checks
 * each one inside the section its citation names. A provision that isn't in
 * the fixture is never paraphrased or cited.
 *
 * WHO GETS IT. A Georgia association with associations.type = 'condo'. The
 * Property Owners' Association Act says it does not govern Article 3
 * associations (§ 44-3-235(b)), so a condo association never gets Article 6
 * text, and an HOA (or co-op) keeps exactly what it had. A board whose
 * condominium isn't actually submitted to the Act (no recorded declaration
 * under Art. 3) still has to check its documents: every surface says the
 * rule covers property submitted to the Act (§ 44-3-71(7)).
 *
 * The § 44-3-109(d) statement is due in FIVE business days (release 86
 * text: "within five business days from the receipt of such request"); no
 * later act changed it. A secondary source's "10 days" is wrong.
 *
 * SB 406 (2026) amends Article 6 and adds Title 43 Ch. 17A; it does not
 * amend Article 3, so the § 44-3-109(c) text stays in force on and after
 * January 1, 2027. (Ch. 17A's registration rules apply to condominium
 * associations too; those live in lib/compliance/law.ts.)
 */

export interface CondoQuote {
  /** As printed under the quote. */
  cite: string
  /** Word for word from the fixture (law.test.ts). */
  quote: string
  /** The file under scripts/fixtures/state-law the quote comes from. */
  fixture: string
}

export const GA_CONDO_FIXTURE = 'ga-ocga-44-3-art3-2026.txt'
const F = GA_CONDO_FIXTURE

/** The type value that selects the Condominium Act (associations.type). */
export const CONDO_TYPE = 'condo'

/** A Georgia association whose type is 'condo'. Anything else (HOA, co-op, unknown) is not. */
export function isGaCondo(state: string | null | undefined, type: string | null | undefined): boolean {
  const st = (state ?? '').trim().toUpperCase()
  return (st === 'GA' || st === 'GEORGIA') && (type ?? '').trim().toLowerCase() === CONDO_TYPE
}

export const GA_CONDO_ACT_NAME = 'Georgia Condominium Act'

/** Who a condo rule covers, printed under it. */
export const GA_CONDO_APPLIES =
  'Condominiums created under the Georgia Condominium Act (your recorded declaration submits the property to it). If yours isn’t, check your governing documents.'

// ─── Scope ──────────────────────────────────────────────────────────

export const GA_CONDO_SCOPE: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-71(7)',
  quote: '“Condominium” means the property lawfully submitted to this article by the recordation of condominium instruments pursuant to this article.',
  fixture: F,
}

// ─── Meetings, § 44-3-102 ───────────────────────────────────────────

export const GA_CONDO_ANNUAL_MEETING: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-102',
  quote:
    'Meetings of the members of the association shall be held in accordance with the provisions of the association’s bylaws and in any event shall be called not less frequently than annually.',
  fixture: F,
}

export const GA_CONDO_OWNER_CALL: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-102',
  quote:
    'A condominium instrument recorded on or after July 1, 1990, shall also provide for the calling of a meeting upon the written request of at least 15 percent of the unit owners.',
  fixture: F,
}

export const GA_CONDO_MEETING_NOTICE: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-102',
  quote:
    'Notice shall be given to each unit owner at least 21 days in advance of any annual or regularly scheduled meeting and at least seven days in advance of any other meeting and shall state the time, place, and purpose of such meeting.',
  fixture: F,
}

export const GA_CONDO_ANNUAL_REPORT: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-102',
  quote:
    'At the annual meeting, comprehensive reports of the affairs, finances, and budget projections of the association shall be made to the unit owners.',
  fixture: F,
}

/** § 44-3-102: days before an annual or regularly scheduled meeting. */
export const GA_CONDO_ANNUAL_NOTICE_DAYS = 21
/** § 44-3-102: days before any other meeting. */
export const GA_CONDO_OTHER_NOTICE_DAYS = 7

// ─── Records, § 44-3-106(d) ─────────────────────────────────────────

export const GA_CONDO_RECORDS_KEEP: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-106(d)',
  quote:
    'In addition to any other duties and responsibilities as this article or the condominium instruments may impose, the association shall keep:',
  fixture: F,
}

export const GA_CONDO_RECORDS_MINUTES: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-106(d)(1)',
  quote: 'Detailed minutes of all meetings of the members of the association and of the board of directors',
  fixture: F,
}

export const GA_CONDO_RECORDS_FINANCIAL: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-106(d)(2)',
  quote: 'Detailed and accurate financial records, including itemized records of all receipts and expenditures',
  fixture: F,
}

// ─── Insurance, § 44-3-107 ──────────────────────────────────────────

export const GA_CONDO_PROPERTY_INSURANCE: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-107(a)(1)',
  quote:
    'A property insurance policy or policies affording fire and extended coverage insurance for and in an amount consonant with the full insurable replacement cost, less deductibles, of all buildings and structures within the condominium.',
  fixture: F,
}

export const GA_CONDO_LIABILITY_INSURANCE: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-107(a)(2)',
  quote:
    'A commercial general liability insurance policy or policies affording coverage for bodily injury and property damage in an amount not less than $1 million for a single occurrence and $2 million aggregate.',
  fixture: F,
}

export const GA_CONDO_WATER_CERTIFICATE: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-107(c)(1)',
  quote:
    'An association, and upon written request by a unit owner to the association, the association or its designated agent shall, within five business days from the receipt of such request, provide to such owner a copy of the association’s certificate of insurance for all such insurance obtained by the association that may apply to such potential claim or submitted claim.',
  fixture: F,
}

export const GA_CONDO_WATER_OWNER_CERTIFICATE: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-107(c)(2)',
  quote:
    'A unit owner, and upon written request by an association or its designated agent to a unit owner, the unit owner shall, within five business days from the receipt of such request, provide to the association or its designated agent a copy of the unit owner’s certificate of insurance for all such insurance obtained by the unit owner that may apply to the potential claim or actual claim.',
  fixture: F,
}

/** § 44-3-107(a)(2): the liability floor per occurrence and aggregate. */
export const GA_CONDO_LIABILITY_OCCURRENCE_CENTS = 100_000_000
export const GA_CONDO_LIABILITY_AGGREGATE_CENTS = 200_000_000
/** § 44-3-107(c): the certificate exchange on a water claim. */
export const GA_CONDO_WATER_CERTIFICATE_BUSINESS_DAYS = 5

// ─── Lien, caps and foreclosure, § 44-3-109 ─────────────────────────

export const GA_CONDO_LATE_CHARGE: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-109(b)(1)',
  quote: 'A late or delinquency charge not in excess of the greater of $10.00 or 10 percent of the amount of each assessment or installment thereof not paid when due;',
  fixture: F,
}

export const GA_CONDO_INTEREST: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-109(b)(2)',
  quote:
    'At a rate not in excess of 10 percent per annum, interest on each assessment or installment thereof and any delinquency or late charge pertaining thereto from the date the same was first due and payable;',
  fixture: F,
}

export const GA_CONDO_FORECLOSURE_NOTICE: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-109(c)',
  quote:
    'Not less than 30 days after notice is sent by certified mail or statutory overnight delivery, return receipt requested, to the unit owner both at the address of the unit and at any other address or addresses which the unit owner may have designated to the association in writing, the lien may be foreclosed by the association by an action, judgment, and foreclosure in the same manner as other liens for the improvement of real property',
  fixture: F,
}

export const GA_CONDO_NOTICE_CONTENTS: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-109(c)',
  quote:
    'The notice provided for in this subsection shall specify the amount of the assessments then due and payable together with authorized late charges and the rate of interest accruing thereon.',
  fixture: F,
}

export const GA_CONDO_FORECLOSURE_FLOOR: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-109(c)',
  quote: 'No foreclosure action against a lien arising out of this subsection shall be permitted unless the amount of the lien is at least $2,000.00.',
  fixture: F,
}

export const GA_CONDO_LIEN_LAPSE: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-109(c)',
  quote:
    'The lien for assessments shall lapse and be of no further effect, as to assessments or installments thereof, together with late charges and interest applicable thereto, four years after the assessment or installment first became due and payable.',
  fixture: F,
}

/** § 44-3-109(c): days between the notice and a foreclosure action. */
export const GA_CONDO_NOTICE_DAYS = 30
/** § 44-3-109(c): the lien must be at least this much to foreclose. */
export const GA_CONDO_FORECLOSURE_MIN_CENTS = 200_000
/** § 44-3-109(b)(2): the interest cap, percent per annum. */
export const GA_CONDO_MAX_INTEREST_PERCENT = 10
/** § 44-3-109(c): the lien lapses this many years after the charge was first due. */
export const GA_CONDO_LIEN_LAPSE_YEARS = 4

// ─── Statement of amounts due, § 44-3-109(d) ────────────────────────

export const GA_CONDO_STATEMENT_RIGHT: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-109(d)',
  quote:
    'Any unit owner, mortgagee of a unit, person having executed a contract for the purchase of a condominium unit, or lender considering the loan of funds to be secured by a condominium unit shall be entitled upon request to a statement from the association or its management agent setting forth the amount of assessments past due and unpaid together with late charges and interest applicable thereto against that condominium unit.',
  fixture: F,
}

export const GA_CONDO_STATEMENT_REQUEST: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-109(d)',
  quote:
    'Such request shall be in writing, shall be delivered to the registered office of the association, and shall state an address to which the statement is to be directed.',
  fixture: F,
}

export const GA_CONDO_STATEMENT_DEADLINE: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-109(d)',
  quote:
    'Failure on the part of the association to mail or otherwise furnish such statement regarding amounts due and payable at the expiration of such five-day period with respect to the condominium unit involved to such address as may be specified in the written request therefor within five business days from the receipt of such request shall cause the lien for assessments created by this Code section to be extinguished and of no further force or effect as to the title or interest acquired by the purchaser or lender, if any, as the case may be, and their respective successors and assigns, in the transaction contemplated in connection with such request.',
  fixture: F,
}

export const GA_CONDO_STATEMENT_BINDING: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-109(d)',
  quote: 'The information specified in such statement shall be binding upon the association and upon every unit owner.',
  fixture: F,
}

export const GA_CONDO_STATEMENT_FEE: CondoQuote = {
  cite: 'O.C.G.A. § 44-3-109(d)',
  quote:
    'Payment of a fee not exceeding $10.00 may be required as a prerequisite to the issuance of such a statement if the condominium instruments so provided.',
  fixture: F,
}

/** § 44-3-109(d): "within five business days from the receipt of such request". */
export const GA_CONDO_STATEMENT_BUSINESS_DAYS = 5
/** § 44-3-109(d): "a fee not exceeding $10.00". */
export const GA_CONDO_STATEMENT_FEE_CAP_CENTS = 1_000

/** Every quote above: what law.test.ts checks against the fixture. */
export const ALL_GA_CONDO_QUOTES: readonly CondoQuote[] = [
  GA_CONDO_SCOPE,
  GA_CONDO_ANNUAL_MEETING,
  GA_CONDO_OWNER_CALL,
  GA_CONDO_MEETING_NOTICE,
  GA_CONDO_ANNUAL_REPORT,
  GA_CONDO_RECORDS_KEEP,
  GA_CONDO_RECORDS_MINUTES,
  GA_CONDO_RECORDS_FINANCIAL,
  GA_CONDO_PROPERTY_INSURANCE,
  GA_CONDO_LIABILITY_INSURANCE,
  GA_CONDO_WATER_CERTIFICATE,
  GA_CONDO_WATER_OWNER_CERTIFICATE,
  GA_CONDO_LATE_CHARGE,
  GA_CONDO_INTEREST,
  GA_CONDO_FORECLOSURE_NOTICE,
  GA_CONDO_NOTICE_CONTENTS,
  GA_CONDO_FORECLOSURE_FLOOR,
  GA_CONDO_LIEN_LAPSE,
  GA_CONDO_STATEMENT_RIGHT,
  GA_CONDO_STATEMENT_REQUEST,
  GA_CONDO_STATEMENT_DEADLINE,
  GA_CONDO_STATEMENT_BINDING,
  GA_CONDO_STATEMENT_FEE,
]
