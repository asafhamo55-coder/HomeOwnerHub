/**
 * BL-145: every statute sentence the /compliance page, the monthly board
 * report and the board packet quote. Pure and client-safe; the only imports
 * are quotes other kits already test (budget adoption, the election
 * planner), re-checked here against the same fixtures.
 *
 * THE RULE. A quote here is copied word for word from the statute text kept
 * under scripts/fixtures/state-law, and law.test.ts checks each one against
 * that file. A provision we don't hold is never paraphrased or cited: the
 * page says "check your governing documents" instead (CHECK_GOVERNING_DOCS).
 *
 * GEORGIA (the launch state, the fullest treatment):
 *   ga-sb406-2026-registration.txt  SB 406 (Act 715) § 2, new O.C.G.A.
 *     § 43-17A-2 (a)(2)(A), (a)(2)(B)(ii), (a)(3), (a)(3)(A), (a)(3)(B),
 *     (b), (c), (d), (e); § 9(a). (a)(3)(A) and (b) are quoted by the
 *     BL-149 registration kit.
 *   ga-ocga-44-3-art6-2026.txt  the Property Owners' Association Act:
 *     § 44-3-230(a) (annual meeting, 21-day notice, annual report),
 *     § 44-3-230(b) (5% of the voting power may call a missed annual
 *     meeting, BL-150), § 44-3-231(d) (minutes, financial records),
 *     § 44-3-235(a) (which associations the Act covers).
 *   ga-ocga-44-3-232-2026.txt  § 44-3-232(d), the statement of amounts due
 *     (the current text, as the General Assembly reproduces it).
 *   ga-ocga-14-3-2026.txt  the Nonprofit Corporation Code (BL-152):
 *     § 14-3-1622(a), (c), (d) (the corporation's annual registration,
 *     Jan 1 – Apr 1) and § 14-3-1420 opening and (2) (administrative
 *     dissolution 60 days after it is due).
 * TEXAS  tx-prop-209-004-2026.txt  § 209.004(a), (b-1).
 * FLORIDA  flsenate-ch720-2026.html  § 720.3033(1)(a), (1)(b).
 * CALIFORNIA  ca-civ-davis-stirling-2026.txt  § 5300(a) (shared with the
 *   BL-138 budget adoption kit, which checks it too); § 5120(b), results
 *   within 15 days (shared with the BL-141 election planner, BL-151).
 *
 * The Georgia Condominium Act (Art. 3) rows a 'condo' association gets
 * (BL-155) quote lib/ga-condo/law.ts, checked word for word against
 * ga-ocga-44-3-art3-2026.txt by lib/ga-condo/law.test.ts; they are not
 * repeated here (several match the POA Act's wording exactly).
 *
 * Not loaded, so never quoted: everything else not listed above. Election
 * rules beyond these two live in the election planner (lib/elections/law.ts).
 */

import { CA_BUDGET_REPORT } from '@/lib/budget-adoption/law'
import { CA_RESULTS_NOTICE, GA_MISSED_ANNUAL as ELECTION_GA_MISSED_ANNUAL } from '@/lib/elections/law'

export interface StatuteQuote {
  /** As printed under the quote. */
  cite: string
  /** Word for word from `fixture` (law.test.ts). */
  quote: string
  /** The file under scripts/fixtures/state-law the quote comes from. */
  fixture: string
}

const GA_SB406 = 'ga-sb406-2026-registration.txt'
const GA_ART6 = 'ga-ocga-44-3-art6-2026.txt'
const GA_232 = 'ga-ocga-44-3-232-2026.txt'
const GA_14_3 = 'ga-ocga-14-3-2026.txt'
const TX_209_004 = 'tx-prop-209-004-2026.txt'
const FL_720 = 'flsenate-ch720-2026.html'
const CA_DAVIS_STIRLING = 'ca-civ-davis-stirling-2026.txt'

// ─── Georgia: Secretary of State registration (SB 406) ───────────────

export const GA_REGISTRATION_BAR: StatuteQuote = {
  cite: 'O.C.G.A. § 43-17A-2(a)(2)(A) (Ga. L. 2026, SB 406 § 2)',
  quote:
    "Subject to subparagraph (B) of this paragraph, no owners' association or its agent shall collect fines or fees against any owner, or file or record liens or initiate foreclosure proceedings against any lot unless such owners' association is registered pursuant to this Code section.",
  fixture: GA_SB406,
}

export const GA_REGISTRATION_OPT_OUT: StatuteQuote = {
  cite: 'O.C.G.A. § 43-17A-2(a)(2)(B)(ii)',
  quote: "No nonregistered owners' association or its agent shall assess or collect fines or fees or accelerated assessments against any owner.",
  fixture: GA_SB406,
}

export const GA_REGISTRATION_FILING: StatuteQuote = {
  cite: 'O.C.G.A. § 43-17A-2(a)(3)',
  quote:
    "Each owners' association shall file with the Secretary of State a copy of the governing documents of the owners' association with a registration statement on a form as prescribed by the Secretary of State that shall be signed by the applicant, who shall be an authorized officer or representative of the owners' association.",
  fixture: GA_SB406,
}

/** BL-149: what the Secretary of State's form must at least ask for (the registration kit's fill-in sheet). */
export const GA_REGISTRATION_FORM_MINIMUM: StatuteQuote = {
  cite: 'O.C.G.A. § 43-17A-2(a)(3)(A)',
  quote: "The name, address, and officers of the owners' association",
  fixture: GA_SB406,
}

/** BL-149: a registration statement takes effect on the day it is filed. */
export const GA_REGISTRATION_EFFECTIVE_ON_FILING: StatuteQuote = {
  cite: 'O.C.G.A. § 43-17A-2(b)',
  quote: 'The date of such filing shall constitute the effective date of the registration statement.',
  fixture: GA_SB406,
}

export const GA_REGISTRATION_FINANCIALS: StatuteQuote = {
  cite: 'O.C.G.A. § 43-17A-2(a)(3)(B)',
  quote: "That each registration statement include a financial statement of the owners' association dated no more than one year prior to filing.",
  fixture: GA_SB406,
}

export const GA_REGISTRATION_RENEWAL: StatuteQuote = {
  cite: 'O.C.G.A. § 43-17A-2(c)',
  quote:
    "Each registration statement issued pursuant to this Code section shall expire on December 31 of each year and each owners' association shall annually submit to the Secretary of State by such date a renewal application containing the information required for a registration statement in subsection (a) of this Code section.",
  fixture: GA_SB406,
}

export const GA_REGISTRATION_AMENDMENT: StatuteQuote = {
  cite: 'O.C.G.A. § 43-17A-2(d)',
  quote:
    "In the event of a change in name, address, officers, or other change which materially affects the business and control of an owners' association, the owners' association shall within 30 days file an amended registration statement with the Secretary of State.",
  fixture: GA_SB406,
}

export const GA_REGISTRATION_FEE: StatuteQuote = {
  cite: 'O.C.G.A. § 43-17A-2(e)',
  quote: "The fee for filing of an owners' association's initial registration statement and each annual renewal shall be $100.00.",
  fixture: GA_SB406,
}

export const GA_SB406_EFFECTIVE: StatuteQuote = {
  cite: 'Ga. L. 2026, SB 406 § 9(a)',
  quote: 'Except as provided in subsection (b) of this section, this Act shall become effective on January 1, 2027.',
  fixture: GA_SB406,
}

// ─── Georgia: Property Owners' Association Act (O.C.G.A. § 44-3) ─────

export const GA_POA_ACT_SCOPE: StatuteQuote = {
  cite: 'O.C.G.A. § 44-3-235(a)',
  quote: 'This article shall apply to all property which is submitted to this article.',
  fixture: GA_ART6,
}

export const GA_ANNUAL_MEETING: StatuteQuote = {
  cite: 'O.C.G.A. § 44-3-230(a)',
  quote:
    'Meetings of the members of the association shall be held in accordance with the provisions of the association’s bylaws and in any event shall be called not less frequently than annually.',
  fixture: GA_ART6,
}

export const GA_MEETING_NOTICE: StatuteQuote = {
  cite: 'O.C.G.A. § 44-3-230(a)',
  quote:
    'Notice shall be given to each lot owner at least 21 days in advance of any annual or regularly scheduled meeting and at least seven days in advance of any other meeting and shall state the time, place, and, for any special meeting, purpose of such meeting.',
  fixture: GA_ART6,
}

export const GA_ANNUAL_REPORT: StatuteQuote = {
  cite: 'O.C.G.A. § 44-3-230(a)',
  quote:
    'At the annual meeting, comprehensive reports of the affairs, finances, and budget projections of the association shall be made to the lot owners.',
  fixture: GA_ART6,
}

/** BL-150: when no annual meeting is held by fiscal year end, 5% of the voting power may call it. */
export const GA_MISSED_ANNUAL_MEETING: StatuteQuote = { ...ELECTION_GA_MISSED_ANNUAL, fixture: GA_ART6 }

export const GA_RECORDS_MINUTES: StatuteQuote = {
  cite: 'O.C.G.A. § 44-3-231(d)(1)',
  quote: 'Detailed minutes of all meetings of the members of the association and of the board of directors',
  fixture: GA_ART6,
}

export const GA_RECORDS_FINANCIAL: StatuteQuote = {
  cite: 'O.C.G.A. § 44-3-231(d)(2)',
  quote: 'Detailed and accurate financial records, including itemized records of all receipts and expenditures',
  fixture: GA_ART6,
}

export const GA_STATEMENT_RIGHT: StatuteQuote = {
  cite: 'O.C.G.A. § 44-3-232(d)',
  quote:
    'Any lot owner, mortgagee of a lot, person having executed a contract for the purchase of a lot, or lender considering the loan of funds to be secured by a lot shall be entitled upon request to a statement from the association or its management agent setting forth the amount of assessments past due and unpaid together with late charges and interest applicable thereto against that lot.',
  fixture: GA_232,
}

export const GA_STATEMENT_DEADLINE: StatuteQuote = {
  cite: 'O.C.G.A. § 44-3-232(d)',
  quote:
    'Failure on the part of the association, within five business days from the receipt of such request, to mail or otherwise furnish such statement regarding amounts due and payable at the expiration of such five-day period with respect to the lot involved to such address as may be specified in the written request therefor shall cause the lien for assessments created by this Code section to be extinguished and of no further force or effect as to the title or interest acquired by the purchaser or lender, if any, as the case may be, and their respective successors and assigns, in the transaction contemplated in connection with such request.',
  fixture: GA_232,
}

// ─── Georgia: Nonprofit Corporation Code (O.C.G.A. § 14-3), BL-152 ───

export const GA_CORP_REGISTRATION_CONTENTS: StatuteQuote = {
  cite: 'O.C.G.A. § 14-3-1622(a)',
  quote:
    'Each domestic corporation and each foreign corporation authorized to transact business in this state shall deliver to the Secretary of State for filing an annual registration that sets forth:',
  fixture: GA_14_3,
}

export const GA_CORP_REGISTRATION_FIRST: StatuteQuote = {
  cite: 'O.C.G.A. § 14-3-1622(c)',
  quote:
    'The first annual registration must be delivered to the Secretary of State between January 1 and April 1, or such other date as the Secretary of State may specify by rules or regulations, of the year following the calendar year in which a domestic corporation was incorporated or a foreign corporation was authorized to transact business.',
  fixture: GA_14_3,
}

export const GA_CORP_REGISTRATION_WINDOW: StatuteQuote = {
  cite: 'O.C.G.A. § 14-3-1622(c)',
  quote:
    'Subsequent annual registrations must be delivered to the Secretary of State between January 1 and April 1, or such other date as the Secretary of State may specify by rules or regulations, of the following calendar years.',
  fixture: GA_14_3,
}

export const GA_CORP_REGISTRATION_INITIAL: StatuteQuote = {
  cite: 'O.C.G.A. § 14-3-1622(d)',
  quote:
    'The initial annual registration of a domestic corporation shall be filed within 90 days after the day its articles of incorporation are delivered to the Secretary of State for filing.',
  fixture: GA_14_3,
}

export const GA_CORP_DISSOLUTION: StatuteQuote = {
  cite: 'O.C.G.A. § 14-3-1420',
  quote: 'The Secretary of State may commence a proceeding under Code Section 14-3-1421 to dissolve a corporation administratively if:',
  fixture: GA_14_3,
}

export const GA_CORP_DISSOLUTION_LATE_REGISTRATION: StatuteQuote = {
  cite: 'O.C.G.A. § 14-3-1420(2)',
  quote:
    'The corporation does not deliver its annual registration to the Secretary of State, together with all required fees and penalties, within 60 days after it is due;',
  fixture: GA_14_3,
}

/** § 14-3-1622(c): the window closes April 1 (law.test.ts checks the words). */
export const GA_CORP_REGISTRATION_DUE_MMDD = '04-01'
/** § 14-3-1420(2): days after the due date before administrative dissolution may start. */
export const GA_CORP_DISSOLUTION_DAYS = 60

/** § 44-3-230(a): days of notice before an annual or regularly scheduled meeting (law.test.ts checks the words). */
export const GA_ANNUAL_NOTICE_DAYS = 21

// ─── Texas ───────────────────────────────────────────────────────────

export const TX_CERTIFICATE_RECORD: StatuteQuote = {
  cite: 'Tex. Prop. Code § 209.004(a)',
  quote:
    "A property owners' association shall record in each county in which any portion of the residential subdivision is located a management certificate, signed and acknowledged by an officer or the managing agent of the association",
  fixture: TX_209_004,
}

export const TX_CERTIFICATE_TREC: StatuteQuote = {
  cite: 'Tex. Prop. Code § 209.004(b-1)',
  quote:
    "Not later than the seventh day after the date a property owners' association files a management certificate for recording under Subsection (a) or files an amended management certificate for recording under Subsection (b), the property owners' association shall electronically file the management certificate or amended management certificate with the Texas Real Estate Commission.",
  fixture: TX_209_004,
}

// ─── Florida ─────────────────────────────────────────────────────────

export const FL_DIRECTOR_CERTIFICATE: StatuteQuote = {
  cite: 'Fla. Stat. § 720.3033(1)(a)',
  quote:
    'Within 90 days after being elected or appointed to the board, each director must submit a certificate of having satisfactorily completed the educational curriculum administered by a department-approved education provider.',
  fixture: FL_720,
}

export const FL_DIRECTOR_SUSPENSION: StatuteQuote = {
  cite: 'Fla. Stat. § 720.3033(1)(b)',
  quote: 'A director who does not timely file the educational certificate is suspended from the board until he or she complies with the requirement.',
  fixture: FL_720,
}

// ─── California ──────────────────────────────────────────────────────

export const CA_ANNUAL_BUDGET_REPORT: StatuteQuote = { ...CA_BUDGET_REPORT, fixture: CA_DAVIS_STIRLING }

/** BL-151: the tabulated results go to every member within 15 days of the election. */
export const CA_ELECTION_RESULTS: StatuteQuote = { ...CA_RESULTS_NOTICE, fixture: CA_DAVIS_STIRLING }

/** Every quote the compliance surfaces can show: what law.test.ts checks. */
export const ALL_COMPLIANCE_QUOTES: readonly StatuteQuote[] = [
  GA_REGISTRATION_BAR,
  GA_REGISTRATION_OPT_OUT,
  GA_REGISTRATION_FILING,
  GA_REGISTRATION_FORM_MINIMUM,
  GA_REGISTRATION_EFFECTIVE_ON_FILING,
  GA_REGISTRATION_FINANCIALS,
  GA_REGISTRATION_RENEWAL,
  GA_REGISTRATION_AMENDMENT,
  GA_REGISTRATION_FEE,
  GA_SB406_EFFECTIVE,
  GA_POA_ACT_SCOPE,
  GA_ANNUAL_MEETING,
  GA_MEETING_NOTICE,
  GA_ANNUAL_REPORT,
  GA_MISSED_ANNUAL_MEETING,
  GA_RECORDS_MINUTES,
  GA_RECORDS_FINANCIAL,
  GA_STATEMENT_RIGHT,
  GA_STATEMENT_DEADLINE,
  GA_CORP_REGISTRATION_CONTENTS,
  GA_CORP_REGISTRATION_FIRST,
  GA_CORP_REGISTRATION_WINDOW,
  GA_CORP_REGISTRATION_INITIAL,
  GA_CORP_DISSOLUTION,
  GA_CORP_DISSOLUTION_LATE_REGISTRATION,
  TX_CERTIFICATE_RECORD,
  TX_CERTIFICATE_TREC,
  FL_DIRECTOR_CERTIFICATE,
  FL_DIRECTOR_SUSPENSION,
  CA_ANNUAL_BUDGET_REPORT,
  CA_ELECTION_RESULTS,
]

export const CHECK_GOVERNING_DOCS =
  'HomeownerHub doesn’t have this rule loaded for your state. Check your governing documents (and ask your association’s attorney).'

export const NOT_LEGAL_ADVICE = 'Statute text quoted for reference. General information, not legal advice.'
