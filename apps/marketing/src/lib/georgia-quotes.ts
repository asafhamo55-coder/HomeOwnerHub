// Statute quotes for the Georgia guides, each copied from a fixture in scripts/fixtures/state-law/ by
// extraction (not retyped). georgia-guides.test.ts checks every one word for word against its fixture.

export type QuoteFixture =
  | 'ga-sb406-2026-2027-text.txt'
  | 'ga-ocga-44-3-art6-2026.txt'
  | 'ga-ocga-44-3-art3-2026.txt'

export interface StatuteQuote {
  cite: string
  fixture: QuoteFixture
  /** Verbatim from the fixture (whitespace aside). */
  quote: string
}

export const QUOTES = {
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
} as const satisfies Record<string, StatuteQuote>

export type QuoteId = keyof typeof QUOTES
