// Statute quotes for the Georgia guides, each copied from a fixture in scripts/fixtures/state-law/ by
// extraction (not retyped). georgia-guides.test.ts checks every one word for word against its fixture.

export type QuoteFixture =
  | 'ga-sb406-2026-2027-text.txt'
  | 'ga-ocga-44-3-art6-2026.txt'
  | 'ga-ocga-44-3-art3-2026.txt'
  | 'ga-ocga-14-3-2026.txt'
  | 'flsenate-ch720-2026.html'
  | 'tx-prop-209-0062-2026.txt'
  | 'tx-prop-209-2026.txt'
  | 'tx-prop-209-004-2026.txt'
  | 'tx-prop-207-2026.txt'
| 'tcss-pr202-2026-excerpt.htm'
  | 'ca-civ-davis-stirling-2026.txt'

export interface StatuteQuote {
  cite: string
  fixture: QuoteFixture
  /** Verbatim from the fixture (whitespace aside). */
  quote: string
}

import { STATE_QUOTES } from './state-quotes'

export const QUOTES = {
  ...STATE_QUOTES,
  regRequired: {
    cite: "O.C.G.A. § 43-17A-2(a)(1) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "No person shall operate an owners' association in this state unless such person is registered under this chapter as an owners' association.",
  },
  regBar: {
    cite: "O.C.G.A. § 43-17A-2(a)(2)(A) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Subject to subparagraph (B) of this paragraph, no owners' association or its agent shall collect fines or fees against any owner, or file or record liens or initiate foreclosure proceedings against any lot unless such owners' association is registered pursuant to this Code section.",
  },
  optOut: {
    cite: "O.C.G.A. § 43-17A-2(a)(2)(B)(i) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "An entity that would otherwise constitute an owners' association may by written notice to the Secretary of State elect not to register under this chapter as an owners' association or otherwise to comply with this chapter and thereby shall be deemed a nonregistered owners' association.",
  },
  nonRegBar: {
    cite: "O.C.G.A. § 43-17A-2(a)(2)(B)(ii) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "No nonregistered owners' association or its agent shall assess or collect fines or fees or accelerated assessments against any owner.",
  },
  regFiling: {
    cite: "O.C.G.A. § 43-17A-2(a)(3) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Each owners' association shall file with the Secretary of State a copy of the governing documents of the owners' association with a registration statement on a form as prescribed by the Secretary of State that shall be signed by the applicant, who shall be an authorized officer or representative of the owners' association.",
  },
  regFinancial: {
    cite: "O.C.G.A. § 43-17A-2(a)(3)(B) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "That each registration statement include a financial statement of the owners' association dated no more than one year prior to filing.",
  },
  regRenewal: {
    cite: "O.C.G.A. § 43-17A-2(c) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Each registration statement issued pursuant to this Code section shall expire on December 31 of each year and each owners' association shall annually submit to the Secretary of State by such date a renewal application containing the information required for a registration statement in subsection (a) of this Code section.",
  },
  regAmend: {
    cite: "O.C.G.A. § 43-17A-2(d) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "In the event of a change in name, address, officers, or other change which materially affects the business and control of an owners' association, the owners' association shall within 30 days file an amended registration statement with the Secretary of State.",
  },
  regFee: {
    cite: "O.C.G.A. § 43-17A-2(e) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "The fee for filing of an owners' association's initial registration statement and each annual renewal shall be $100.00.",
  },
  regRecords: {
    cite: "O.C.G.A. § 43-17A-2(g) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "An owners' association shall maintain for not less than ten years at an office located in this state or, if it has no office in this state, its principal office all records, including electronic records and records in any other format, relating to any assessments, fines, fees, liens, and foreclosures.",
  },
  actEffective: {
    cite: "Ga. L. 2026, SB 406 § 9(a)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Except as provided in subsection (b) of this section, this Act shall become effective on January 1, 2027.",
  },
  actSection7: {
    cite: "Ga. L. 2026, SB 406 § 9(b)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Section 7 of this Act shall become effective on July 1, 2026, and shall apply to all actions filed on or after such date.",
  },
  assocDefinition: {
    cite: "O.C.G.A. § 43-17A-1(6) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "including, but not limited to, associations formed pursuant to Articles 3 and 6 of Chapter 3 of Title 44 and; provided, however, that such term shall not include nonregistered owners' associations.",
  },
  feeIntro: {
    cite: "Ga. L. 2026, SB 406 § 7, new subsection (f)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Except under circumstances necessitated by emergency conditions involving public safety or the preservation of property by the association, before an association may collect or be awarded attorney’s fees, it shall provide:",
  },
  feeNotice1: {
    cite: "Ga. L. 2026, SB 406 § 7, new subsection (f)(1)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "An initial written notice by certified mail or statutory overnight delivery to the lot owner from the association or its agent identifying any outstanding fines or delinquent fees;",
  },
  feeNotice2: {
    cite: "Ga. L. 2026, SB 406 § 7, new subsection (f)(2)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Lot owners with 30 days from the receipt of the notice required under paragraph (1) of this subsection to pay such outstanding fines or delinquent fees; and",
  },
  feeNotice3: {
    cite: "Ga. L. 2026, SB 406 § 7, new subsection (f)(3)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "An itemized list of reasonable attorney’s fees claimed.",
  },
  feeJudge: {
    cite: "Ga. L. 2026, SB 406 § 7, new subsection (g)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Judges conducting bench trials for an action to recover sums assessed against a lot owner shall review such claims of attorney’s fees for reasonableness and shall enter an order stating whether the attorney’s fees were reasonable before an association can be awarded such attorney’s fees.",
  },
  feeLien: {
    cite: "O.C.G.A. § 44-3-232(b)(3)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "The costs of collection, including court costs, the expenses required for the protection and preservation of the lot, and reasonable attorney’s fees actually incurred; and",
  },
  lateIntro: {
    cite: "O.C.G.A. § 44-3-232(b)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "To the extent that the instrument provides, the personal obligation of the lot owner and the lien for assessments shall also include:",
  },
  lateCharge: {
    cite: "O.C.G.A. § 44-3-232(b)(1)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "A late or delinquency charge not in excess of the greater of $10.00 or 10 percent of the amount of each assessment or installment thereof not paid when due;",
  },
  interest: {
    cite: "O.C.G.A. § 44-3-232(b)(2)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "At a rate not in excess of 10 percent per annum, interest on each assessment or installment thereof and any delinquency or late charge pertaining thereto from the date the same was first due and payable;",
  },
  foreclose60: {
    cite: "O.C.G.A. § 44-3-232(c), as revised by SB 406 § 5 (from Jan. 1, 2027)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Not less than 60 days after notice is sent by certified mail or statutory overnight delivery, return receipt requested, to the lot owner both at the address of the lot and at any other address or addresses which the lot owner may have designated to the association in writing, the lien may be foreclosed by the association by an action, judgment, and court order for foreclosure in the same manner as other liens for the improvement of real property",
  },
  noticeContents60: {
    cite: "O.C.G.A. § 44-3-232(c), as revised by SB 406 § 5 (from Jan. 1, 2027)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "The notice provided for in this subsection shall specify the amount of the assessments then due and payable together with authorized late charges and the rate of interest accruing thereon and shall state that payment of such amount prior to the sixtieth day following receipt of the notice will eliminate the right of foreclosure.",
  },
  threshold2027: {
    cite: "O.C.G.A. § 44-3-232(c), as revised by SB 406 § 5 (from Jan. 1, 2027)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "No foreclosure action against a lien arising out of this subsection shall be permitted unless the amount of the lien is at least the lesser of $4,000.00 or an amount equal to 12 months of regular assessments, as such term is defined in Code Section 43-17A-1, in arrears but not less than $2,000.00; provided, however, that no specific assessment, as such term is defined in Code Section 43-17A-1, or other fine or fee shall be included in the calculation of the amount of such lien.",
  },
  lapse2027: {
    cite: "O.C.G.A. § 44-3-232(c), as revised by SB 406 § 5 (from Jan. 1, 2027)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "The lien for assessments shall lapse and be of no further effect, as to assessments or installments thereof, together with late charges and interest applicable thereto, six years after the assessment or installment first became due and payable.",
  },
  foreclose30: {
    cite: "O.C.G.A. § 44-3-232(c), the text in force until Dec. 31, 2026",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Not less than 30 days after notice is sent by certified mail or statutory overnight delivery, return receipt requested, to the lot owner both at the address of the lot and at any other address or addresses which the lot owner may have designated to the association in writing, the lien may be foreclosed by the association by an action, judgment, and court order for foreclosure in the same manner as other liens for the improvement of real property",
  },
  threshold2026: {
    cite: "O.C.G.A. § 44-3-232(c), the text in force until Dec. 31, 2026",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "No foreclosure action against a lien arising out of this subsection shall be permitted unless the amount of the lien is at least $2,000.00.",
  },
  lapse2026: {
    cite: "O.C.G.A. § 44-3-232(c), the text in force until Dec. 31, 2026",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "The lien for assessments shall lapse and be of no further effect, as to assessments or installments thereof, together with late charges and interest applicable thereto, four years after the assessment or installment first became due and payable.",
  },
  regularDef: {
    cite: "O.C.G.A. § 43-17A-1(8) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "'Regular assessments' or 'dues' means assessments imposed on owners on a regular or recurring basis for the purpose of funding the owners' association's regular operating budget for costs which may include, but shall not be limited to, common area maintenance and routine repairs, utilities, landscaping, and reserve fund contributions.",
  },
  specificDef: {
    cite: "O.C.G.A. § 43-17A-1(10) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "'Specific assessments' means an assessment imposed on an owner for:",
  },
  specificDefB: {
    cite: "O.C.G.A. § 43-17A-1(10)(B) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Fees or fines for nonpayment, insufficient payment, or untimely payment of any assessment or for violation of a covenant of the owners' association.",
  },
  payOrderIntro: {
    cite: "O.C.G.A. § 43-17A-8(a) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "All funds remitted by an owner to an owners' association shall be applied by such owners' association to the following expenses by ranking of highest to lowest priority as follows:",
  },
  payOrder1: {
    cite: "O.C.G.A. § 43-17A-8(a)(1)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Regular assessments or dues until current;",
  },
  payOrder2: {
    cite: "O.C.G.A. § 43-17A-8(a)(2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Special assessments until current;",
  },
  payOrder3: {
    cite: "O.C.G.A. § 43-17A-8(a)(3)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Specific assessments until current; and",
  },
  payOrder4: {
    cite: "O.C.G.A. § 43-17A-8(a)(4)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Other fees and fines.",
  },
  noRefusalIntro: {
    cite: "O.C.G.A. § 43-17A-8(b)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "No owners' association shall:",
  },
  noRefuse: {
    cite: "O.C.G.A. § 43-17A-8(b)(1)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Refuse to accept payment from an owner in any amount for any assessment; or",
  },
  noAccel: {
    cite: "O.C.G.A. § 43-17A-8(b)(2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Assess or collect accelerated assessments against any owner.",
  },
  complaint: {
    cite: "O.C.G.A. § 43-17A-5(a)(1) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Any person residing in an owners' development claiming that he or she has been damaged by such owners' association's action or inaction may file a complaint with the Secretary of State, who shall appoint a hearing officer to conduct the proceedings.",
  },
  complaint180: {
    cite: "O.C.G.A. § 43-17A-5(a)(1) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Such complaint shall be a written statement of the facts constituting the complaint and shall be made within 180 days of the alleged action or inaction.",
  },
  complaintHearing: {
    cite: "O.C.G.A. § 43-17A-5(a)(2) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Immediately upon the conclusion of the hearing, the hearing officer shall report his or her findings and render conclusions upon the matter to the complainant and respondent in each case, who shall have 15 days thereafter in which to make effective and satisfy the hearing officer's conclusions.",
  },
  complaintEnforce: {
    cite: "O.C.G.A. § 43-17A-5(a)(3) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "If such settlement is not effected within the time frames set forth in paragraph (2) of this subsection, the hearing officer, the complainant, or the respondent may bring an action to enforce the claim.",
  },
  complaintFalse: {
    cite: "O.C.G.A. § 43-17A-5(b) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "It shall be unlawful in connection with any hearing under this Code section for any person to knowingly make or cause to be made to the Secretary of State, the hearing officer, or anyone acting on their behalf any false or misleading written or oral statement of material fact or any statement which omits a material fact.",
  },
  stay: {
    cite: "O.C.G.A. § 43-17A-5(c) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "The filing of a complaint under this subsection shall act as an automatic stay prohibiting the respondent from collecting or attempting to collect from the complainant any fines or fees that are the subject of the complaint or related to the subject of the complaint.",
  },
  stayEnds: {
    cite: "O.C.G.A. § 43-17A-5(c) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Such automatic stay shall expire upon the rendering of the hearing officer's conclusions following the hearing; provided, however, that the hearing officer shall be authorized to extend such stay for 15 days after the rendering of his or her conclusions following the hearing.",
  },
  complaintFee: {
    cite: "O.C.G.A. § 43-17A-5(d) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "The nonprevailing party in a hearing conducted under this Code section shall be required to pay an administrative service fee of $100.00 to the Secretary of State by order of the Secretary of State.",
  },
  appeal: {
    cite: "O.C.G.A. § 43-17A-6(a)(1) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "An appeal may be taken from any order of the Secretary of State resulting from a hearing held in accordance with Code Section 43-17A-4 or any decision of a hearing officer resulting from a hearing held in accordance with Code Section 43-17A-5 by any person adversely affected by such order or decision to:",
  },
  meetingAnnual: {
    cite: "O.C.G.A. § 44-3-230(a)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Meetings of the members of the association shall be held in accordance with the provisions of the association’s bylaws and in any event shall be called not less frequently than annually.",
  },
  meetingNotice: {
    cite: "O.C.G.A. § 44-3-230(a)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Notice shall be given to each lot owner at least 21 days in advance of any annual or regularly scheduled meeting and at least seven days in advance of any other meeting and shall state the time, place, and, for any special meeting, purpose of such meeting.",
  },
  meetingDelivery: {
    cite: "O.C.G.A. § 44-3-230(a)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Such notice shall be delivered personally or sent by United States mail, postage prepaid, statutory overnight delivery, or issued electronically in accordance with Chapter 12 of Title 10, the “Uniform Electronic Transactions Act,” to all lot owners of record at such address or addresses as designated by such lot owners or, if no other address has been so designated, at the address of their respective lots.",
  },
  meetingReports: {
    cite: "O.C.G.A. § 44-3-230(a)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "At the annual meeting, comprehensive reports of the affairs, finances, and budget projections of the association shall be made to the lot owners.",
  },
  condoNotApply: {
    cite: "O.C.G.A. § 44-3-235(b)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "This article shall not apply to associations created pursuant to Article 3 of this chapter, the “Georgia Condominium Act,” except to the extent that a property owners’ development created under this article includes a condominium, together with other real property, as provided in paragraph (9) of Code Section 44-3-221.",
  },
  condoLateIntro: {
    cite: "O.C.G.A. § 44-3-109(b)",
    fixture: "ga-ocga-44-3-art3-2026.txt",
    quote: "To the extent that the condominium instruments provide, the personal obligation of the unit owner and the lien for assessments shall also include:",
  },
  condoLate: {
    cite: "O.C.G.A. § 44-3-109(b)(1)",
    fixture: "ga-ocga-44-3-art3-2026.txt",
    quote: "A late or delinquency charge not in excess of the greater of $10.00 or 10 percent of the amount of each assessment or installment thereof not paid when due;",
  },
  condoForeclose: {
    cite: "O.C.G.A. § 44-3-109(c)",
    fixture: "ga-ocga-44-3-art3-2026.txt",
    quote: "Not less than 30 days after notice is sent by certified mail or statutory overnight delivery, return receipt requested, to the unit owner both at the address of the unit and at any other address or addresses which the unit owner may have designated to the association in writing, the lien may be foreclosed by the association by an action, judgment, and foreclosure in the same manner as other liens for the improvement of real property",
  },
  condoThreshold: {
    cite: "O.C.G.A. § 44-3-109(c)",
    fixture: "ga-ocga-44-3-art3-2026.txt",
    quote: "No foreclosure action against a lien arising out of this subsection shall be permitted unless the amount of the lien is at least $2,000.00.",
  },
  condoLapse: {
    cite: "O.C.G.A. § 44-3-109(c)",
    fixture: "ga-ocga-44-3-art3-2026.txt",
    quote: "The lien for assessments shall lapse and be of no further effect, as to assessments or installments thereof, together with late charges and interest applicable thereto, four years after the assessment or installment first became due and payable.",
  },
  rightsIntro: {
    cite: "O.C.G.A. § 43-17A-7 (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Owners shall have the right to:",
  },
  right1: {
    cite: "O.C.G.A. § 43-17A-7(1) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Inspect and obtain copies of owners' association records, accounting records, and other records of the owners' association upon written demand and in compliance with the laws of this state and the governing documents. Such accounting records shall be the finalized balance sheet, budget, profit and loss statements, and bank statements for the past three years;",
  },
  right2: {
    cite: "O.C.G.A. § 43-17A-7(2) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Upon written demand to the owners' association, a copy of the owners' association certificate of insurance for all such insurance obtained by the owners' association for the benefit of the owner and that may apply to a potential claim or submitted claim;",
  },
  right3: {
    cite: "O.C.G.A. § 43-17A-7(3) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Notice of meetings of members in a fair and reasonable manner consistent with the governing documents and the laws of this state;",
  },
  right4: {
    cite: "O.C.G.A. § 43-17A-7(4) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Attend meetings of the members of the owners' association, which shall be called and held by the board of directors at least annually;",
  },
  right5: {
    cite: "O.C.G.A. § 43-17A-7(5) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Access to common areas, amenities, and common elements subject to the terms contained in the governing documents;",
  },
  right6: {
    cite: "O.C.G.A. § 43-17A-7(6) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Ingress, egress, and access to their individually owned property;",
  },
  right7: {
    cite: "O.C.G.A. § 43-17A-7(7) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Statutory notice and process requirements under the laws of this state should an owners' association proceed with foreclosure action against an individually owned property;",
  },
  right8: {
    cite: "O.C.G.A. § 43-17A-7(8) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Amend governing documents with the approval thresholds required by the laws of this state and the governing documents;",
  },
  right9: {
    cite: "O.C.G.A. § 43-17A-7(9) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Expect, unless otherwise provided by the laws of this state, that a director of an owners' association board of directors shall perform his or her duties in good faith and with the degree of care an ordinary, prudent person in a like position would exercise under similar circumstances;",
  },
  right10: {
    cite: "O.C.G.A. § 43-17A-7(10) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Expect directors to disclose to the other directors on the owners' association's board of directors any conflicting interest with respect to a transaction;",
  },
  right11: {
    cite: "O.C.G.A. § 43-17A-7(11) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Be free from governing documents that interfere with the freedom of residents to determine the composition of their household, except that owners' associations shall have the power, subject to the laws of this state and federal law, to require that all occupants of a household be members of a single housekeeping unit, and to limit the total number of occupants permitted in each individually owned property and its fair share use of the common facilities, including parking; and",
  },
  right12: {
    cite: "O.C.G.A. § 43-17A-7(12) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "Challenge discriminatory practices by an owners' association as authorized by the laws of this state or federal law.",
  },
  fineAuth: {
    cite: "O.C.G.A. § 44-3-223",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "If and to the extent provided in the instrument, the association shall be empowered to impose and assess fines, which shall not impact voting rights, to suspend temporarily voting rights for failure to pay regular and special assessments, and to suspend the right of use of certain common areas and services paid for as a common expense in order to enforce such compliance; provided, however, that no such suspension shall deny any lot owner or occupants access to the lot owned or occupied or the right to vote in board elections based on failure to pay outstanding fines.",
  },
  reasonableRules: {
    cite: "O.C.G.A. § 44-3-223",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "In addition, any lot owner and all those entitled to occupy a lot shall comply with any reasonable rules or regulations adopted by the association pursuant to the instrument which have been provided to the lot owners and with the lawful provisions of the bylaws of the association.",
  },
  injunctNotice: {
    cite: "O.C.G.A. § 44-3-223",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "After providing notice in accordance with the terms of the instrument, or, if the instrument is silent, ten days’ written notice, the association may pursue injunctive relief without the need or requirement to first pursue or utilize any other remedies, regardless of whether other remedies may be available or might otherwise be adequate, provided that such notice shall not be required in the event of a violation of the instrument or the reasonable rules or regulations adopted by the association that presents a clear and imminent danger to life, person, or property, or for which injunctive relief would become moot if not granted before a notice period as prescribed above would expire.",
  },
  boardQuorum: {
    cite: "O.C.G.A. § 44-3-228",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Unless the instrument or bylaws specify a larger percentage, the presence of persons entitled to cast one-half of the votes of the board of directors shall constitute a quorum for the transaction of business at any meeting of the board.",
  },
  memberQuorum: {
    cite: "O.C.G.A. § 44-3-228",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Unless the instrument or bylaws provide otherwise, a quorum shall be deemed present throughout any meeting of the members of the association if persons entitled to cast more than one-third of the votes are present at the beginning of the meeting.",
  },
  lotProxy: {
    cite: "O.C.G.A. § 44-3-224(b)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "The votes pertaining to any lot may, and, in the case of any lot owner not a natural person or persons, shall, be cast pursuant to a proxy or proxies duly executed by or on behalf of the lot owner or, in cases where the lot owner is more than one person, by or on behalf of the joint owners of the lot.",
  },
  proxyVoid: {
    cite: "O.C.G.A. § 44-3-224(b)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Any proxy shall be void if it is not dated or if it purports to be revocable without such notice.",
  },
  proxyOptional: {
    cite: "O.C.G.A. § 14-3-724(a)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "Unless the articles or bylaws prohibit or limit proxy voting, a member may vote in person or by proxy.",
  },
  proxyElectronic: {
    cite: "O.C.G.A. § 14-3-724(b)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "A member or his or her agent or attorney in fact may appoint a proxy to vote or otherwise act for the member by signing an appointment form either personally or by an electronic transmission.",
  },
  proxy11: {
    cite: "O.C.G.A. § 14-3-724(c)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "An appointment is valid for 11 months unless a different period is expressly provided in the appointment form.",
  },
  proxyRevocable: {
    cite: "O.C.G.A. § 14-3-724(d)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "An appointment of a proxy is revocable by the member.",
  },
  proxyRevokeVote: {
    cite: "O.C.G.A. § 14-3-724(f)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "Appointment of a proxy is revoked by the person appointing the proxy: (1) Attending any meeting and voting in person; or (2) Signing and delivering to the secretary or other officer or agent authorized to tabulate proxy votes either a writing stating that the appointment of the proxy is revoked or a subsequent appointment form.",
  },
  ballotQuorum: {
    cite: "O.C.G.A. § 14-3-707(c)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "Approval by ballot in writing or by electronic transmission pursuant to this Code section shall be valid only when the number of votes cast by ballot equals or exceeds the quorum required to be present at a meeting authorizing the action, and the number of approvals equals or exceeds the number of votes that would be required to approve the matter at a meeting at which the total number of votes cast was the same as the number of votes cast by ballot.",
  },
  copiesOfBylaws: {
    cite: "O.C.G.A. § 44-3-227(c)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "and copies thereof shall be furnished to any lot owner on request upon payment of a reasonable charge therefor.",
  },
  memberInspect: {
    cite: "O.C.G.A. § 14-3-1602(b)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "A member is entitled to inspect and copy, at a reasonable time and location specified by the corporation, any of the records of the corporation described in subsection (a) of this Code section if the member gives the corporation written notice or a written demand at least five business days before the date on which the member wishes to inspect and copy.",
  },
  memberInspectPurpose: {
    cite: "O.C.G.A. § 14-3-1602(d)(1)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "The member’s demand is made in good faith and for a proper purpose that is reasonably relevant to the member’s legitimate interest as a member;",
  },
  memberInspectRestrict: {
    cite: "O.C.G.A. § 14-3-1602(e)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "The corporation may impose reasonable restrictions on the confidentiality, use, or distribution of the records described in subsection (c) of this Code section.",
  },
  requiredRecords: {
    cite: "O.C.G.A. § 14-3-1601(a)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "A corporation shall keep as permanent records minutes of all meetings of its members and board of directors, executed consents evidencing all actions taken by the members or board of directors without a meeting, a record of all actions taken by a committee of the board of directors in place of the board of directors on behalf of the corporation, and waivers of notice of all meetings of the board of directors and its committees.",
  },
  // SEO batch 4: special assessments.
  assessmentDef: {
    cite: "O.C.G.A. § 43-17A-1(2) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "'Assessment' means and includes regular assessments, special assessments, and specific assessments.",
  },
  specialDef: {
    cite: "O.C.G.A. § 43-17A-1(9) (SB 406 § 2)",
    fixture: "ga-sb406-2026-2027-text.txt",
    quote: "'Special assessments' means an assessment imposed on owners for costs which are not included in the owners' association's regular operating budget, and which may include, but shall not be limited to, legal costs and common area nonroutine or emergency repairs, renovations, and other capital projects. Such term shall not include regular assessments or specific assessments.",
  },
  lienSums: {
    cite: "O.C.G.A. § 44-3-232(a)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "All sums lawfully assessed by the association against any lot owner or property owners’ association lot, whether for the share of the common expenses pertaining to that lot, fines, or otherwise, and all reasonable charges made to any lot owner or lot for materials furnished or services rendered by the association at the owner’s request to or on behalf of the lot owner or lot, shall, from the time the sums became due and payable, be the personal obligation of the lot owner and constitute a lien in favor of the association on the lot prior and superior to all other liens whatsoever except:",
  },
  noExempt: {
    cite: "O.C.G.A. § 44-3-225(b)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "No lot owner other than the association shall be exempted from any liability for any assessment under this Code section or under any instrument for any reason whatsoever, including, without limitation, abandonment, nonuse, or waiver of the use or enjoyment of his or her lot or any part of the common area",
  },
  condoSpecialIntro: {
    cite: "O.C.G.A. § 44-3-80(g) (Georgia Condominium Act)",
    fixture: "ga-ocga-44-3-art3-2026.txt",
    quote: "A condominium instrument recorded on or after July 1, 2015, shall not authorize the board of directors to impose:",
  },
  condoSpecial: {
    cite: "O.C.G.A. § 44-3-80(g)(1) (Georgia Condominium Act)",
    fixture: "ga-ocga-44-3-art3-2026.txt",
    quote: "Except as provided in subsections (a) and (b) of this Code section and subsections (a) and (b) of Code Section 44-3-109, a special assessment fee per unit in excess of one-sixth of the annual common expense assessment for the unit levied pursuant to subsection (c) of this Code section per fiscal year without the approval of a majority of the unit owners;",
  },
  // SEO batch 8: ballots, amending the covenants, liens, conflicts.
  ballotAction: {
    cite: "O.C.G.A. § 14-3-707(a)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "Unless prohibited or limited by the articles or bylaws, any action that may be taken at any annual, regular, or special meeting of members may be taken without a meeting if the corporation delivers a ballot in writing or by electronic transmission to every member entitled to vote on the matter.",
  },
  ballotContents: {
    cite: "O.C.G.A. § 14-3-707(b)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "A ballot in writing or by electronic transmission shall:",
  },
  ballotEach: {
    cite: "O.C.G.A. § 14-3-707(b)(1)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "Set forth each proposed action;",
  },
  ballotForAgainst: {
    cite: "O.C.G.A. § 14-3-707(b)(3)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "Provide an opportunity to vote for or against each other proposed action.",
  },
  ballotSolicitIntro: {
    cite: "O.C.G.A. § 14-3-707(d)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "All solicitations for votes by ballot in writing or by electronic transmission shall:",
  },
  ballotSolicit1: {
    cite: "O.C.G.A. § 14-3-707(d)(1)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "Indicate the number of responses needed to meet the quorum requirements;",
  },
  ballotSolicit2: {
    cite: "O.C.G.A. § 14-3-707(d)(2)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "State the percentage of approvals necessary to approve each matter other than election of directors; and",
  },
  ballotSolicit3: {
    cite: "O.C.G.A. § 14-3-707(d)(3)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "Specify the time by which a ballot must be received by the corporation in order to be counted.",
  },
  ballotNoRevoke: {
    cite: "O.C.G.A. § 14-3-707(e)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "Except as otherwise provided in the articles or bylaws, a ballot in writing or by electronic transmission may not be revoked.",
  },
  amendTwoThirds: {
    cite: "O.C.G.A. § 44-3-226(a)(1)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Except to the extent expressly permitted or required by other provisions of this article, the instrument shall be amended only by the agreement of lot owners of lots to which two-thirds of the votes in the association pertain or such larger majority as the instrument may specify",
  },
  amendRental: {
    cite: "O.C.G.A. § 44-3-226(a)(2)(B)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "No amendment shall be made to the instrument so as to prohibit or restrict a nonowner occupied lot from continuing to be leased or rented for an initial term of six months or longer pursuant to the preamended instrument",
  },
  amendCap80: {
    cite: "O.C.G.A. § 44-3-226(b) (numbered (b)(1) from Jan. 1, 2027)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "No amendment of an instrument shall require approval of lot owners to which more than 80 percent of the association vote pertains and the mortgagees holding 80 percent of the voting interest of mortgaged lots",
  },
  amendNoLotChange: {
    cite: "O.C.G.A. § 44-3-226(c)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "no amendment to the instrument shall change the boundaries of any lot, the number of votes in the association pertaining thereto, or the liability for common expenses pertaining thereto.",
  },
  amendEvidence: {
    cite: "O.C.G.A. § 44-3-226(d)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Agreement of the required majority of lot owners to any amendment of the instrument shall be evidenced by their execution of the amendment.",
  },
  amendEffective: {
    cite: "O.C.G.A. § 44-3-226(d)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Any such amendment of the instrument shall become effective only when recorded or at such later date as may be specified in the amendment itself.",
  },
  amendMortgagee: {
    cite: "O.C.G.A. § 44-3-226(e)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "the approval of any proposed amendment by a mortgagee shall be deemed implied and consented to if the mortgagee fails to submit a response to any written proposal for an amendment within 30 days after the mortgagee receives notice of the proposed amendment sent by certified mail or statutory overnight delivery, return receipt requested.",
  },
  amendPresumption: {
    cite: "O.C.G.A. § 44-3-226(f)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "In any court suit or action where the validity of the adoption of an amendment to an instrument is at issue, the adoption of the amendment shall be presumed valid if the suit is commenced more than one year after the recording of the amendment on the public record.",
  },
  lienRecordNotice: {
    cite: "O.C.G.A. § 44-3-232(a)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "The recording of the declaration pursuant to this article shall constitute record notice of the existence of the lien, and no further recordation of any claim of lien for assessments shall be required.",
  },
  lienAddOnsIntro: {
    cite: "O.C.G.A. § 44-3-232(b)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "To the extent that the instrument provides, the personal obligation of the lot owner and the lien for assessments shall also include:",
  },
  stmtRight: {
    cite: "O.C.G.A. § 44-3-232(d)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Any lot owner, mortgagee of a lot, person having executed a contract for the purchase of a lot, or lender considering the loan of funds to be secured by a lot shall be entitled upon request to a statement from the association or its management agent setting forth the amount of assessments past due and unpaid together with late charges and interest applicable thereto against that lot.",
  },
  stmtWriting: {
    cite: "O.C.G.A. § 44-3-232(d)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Such request shall be in writing, shall be delivered to the registered office of the association, and shall state an address to which the statement is to be directed.",
  },
  stmtFiveDays: {
    cite: "O.C.G.A. § 44-3-232(d)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Failure on the part of the association, within five business days from the receipt of such request, to mail or otherwise furnish such statement regarding amounts due and payable at the expiration of such five-day period with respect to the lot involved to such address as may be specified in the written request therefor shall cause the lien for assessments created by this Code section to be extinguished and of no further force or effect as to the title or interest acquired by the purchaser or lender, if any, as the case may be, and their respective successors and assigns, in the transaction contemplated in connection with such request.",
  },
  stmtBinding: {
    cite: "O.C.G.A. § 44-3-232(d)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "The information specified in such statement shall be binding upon the association and upon every lot owner.",
  },
  stmtFee: {
    cite: "O.C.G.A. § 44-3-232(d)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Payment of a fee not exceeding $10.00 may be required as a prerequisite to the issuance of such a statement if the instrument so provides.",
  },
  lienSuit: {
    cite: "O.C.G.A. § 44-3-232(e)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Nothing in this Code section shall be construed to prohibit actions maintainable pursuant to Code Section 44-3-223 to recover sums for which subsection (a) of this Code section creates a lien.",
  },
  powIntro: {
    cite: "O.C.G.A. § 44-3-231(a)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Except to the extent prohibited by the instrument and subject to any restrictions and limitations specified therein, the association shall have the power to:",
  },
  powEmploy: {
    cite: "O.C.G.A. § 44-3-231(a)(1)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Employ, retain, dismiss, and replace agents and employees to exercise and discharge the powers and responsibilities of the association;",
  },
  powImprove: {
    cite: "O.C.G.A. § 44-3-231(a)(2)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Make or cause to be made additional improvements on and as a part of the common area;",
  },
  powArc: {
    cite: "O.C.G.A. § 44-3-231(a)(3)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Grant or withhold approval of any action by one or more lot owners or other persons entitled to occupancy of any lot if such action would change the exterior appearance of any lot, or any structure thereon, or of any other portion of the development or elect or provide for the appointment of an architectural control committee to grant or withhold such approval; and",
  },
  powEnforce: {
    cite: "O.C.G.A. § 44-3-231(a)(4)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Enforce all lawful provisions of the property owners’ association instrument in accordance with and pursuant to all powers granted by this article, by Chapter 2 or 3 of Title 14 as may be applicable, and as provided for in the instrument, including, but not limited to, by an action to recover sums due; for damages; for injunctive relief, without regard to whether other remedies may exist or be adequate, provided that the provisions of Code Section 44-3-223 and the instrument are complied with; or for any other remedy available at law or in equity to the association.",
  },
  powBorrow: {
    cite: "O.C.G.A. § 44-3-231(b)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "The association shall also have the power to acquire, lease, and own in its own name property of any nature, real, personal, or mixed, tangible or intangible; to borrow money; and to pledge, mortgage, or hypothecate all or any portion of the property of the association for any lawful purpose within the association’s inherent or expressly granted powers.",
  },
  powResolution: {
    cite: "O.C.G.A. § 44-3-231(b)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Any third party dealing with the association shall be entitled to rely in good faith upon a certified resolution of the board of directors of the association authorizing any such act or transaction as conclusive evidence of the authority and power of the association so to act and of full compliance with all restraints, conditions, and limitations, if any, upon the exercise of such authority and power.",
  },
  powAmend: {
    cite: "O.C.G.A. § 44-3-231(c)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "The association shall have the power to amend the instrument, the articles of incorporation, and the bylaws of the association in such respects as may be required to conform to mandatory provisions of this article or of any other applicable law without a vote of the lot owners.",
  },
  powMinutes: {
    cite: "O.C.G.A. § 44-3-231(d)(1)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Detailed minutes of all meetings of the members of the association and of the board of directors;",
  },
  powFinancial: {
    cite: "O.C.G.A. § 44-3-231(d)(2)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Detailed and accurate financial records, including itemized records of all receipts and expenditures; and",
  },
  powBoard: {
    cite: "O.C.G.A. § 44-3-231(f)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "Except to the extent otherwise expressly required by this article, by Chapter 2 or 3 of Title 14, by the instrument, by the articles of incorporation, or by the bylaws of the association, the powers inherent in or expressly granted to the association may be exercised by the board of directors, acting through the officers, without any further consent or action on the part of the lot owners.",
  },
  powLitigate: {
    cite: "O.C.G.A. § 44-3-231(h)",
    fixture: "ga-ocga-44-3-art6-2026.txt",
    quote: "The association shall have the capacity, power, and standing to institute, intervene, prosecute, represent, or defend in its own name litigation or administrative or other proceedings of any kind concerning claims or other matters relating to any portion of the lots or common area which the association has the responsibility to administer, repair, or maintain.",
  },
  proxySign: {
    cite: "O.C.G.A. § 14-3-724(b)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "An electronic transmission must contain or be accompanied by information from which it can be determined that the member, the member’s agent, or the member’s attorney in fact authorized the electronic transmission.",
  },
  proxyEffective: {
    cite: "O.C.G.A. § 14-3-724(c)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "An appointment of a proxy is effective when a signed appointment form or electronic transmission of the appointment is received by the secretary or other officer or agent authorized to tabulate votes.",
  },
  proxyFace: {
    cite: "O.C.G.A. § 14-3-724(g)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "Subject to Code Section 14-3-727 and any express limitation on the proxy’s authority appearing on the face of the appointment form or in the electronic transmission, a corporation is entitled to accept the proxy’s vote or other action as that of the member making the appointment.",
  },
  ballotDirector: {
    cite: "O.C.G.A. § 14-3-707(b)(2)",
    fixture: "ga-ocga-14-3-2026.txt",
    quote: "Provide an opportunity to vote for, or withhold a vote for, each candidate for election as a director, if any; and",
  },
} as const satisfies Record<string, StatuteQuote>

export type QuoteId = keyof typeof QUOTES
