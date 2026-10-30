// Statute quotes for the Florida, Texas and California guides (BL-172 batch 9).
// Same rule as georgia-quotes.ts: each quote is copied from a fixture in
// scripts/fixtures/state-law/ by extraction, and georgia-guides.test.ts checks
// every one word for word (HTML fixtures are reduced to text first). Merged
// into QUOTES by georgia-quotes.ts, so guides reference them by id the same way.
// Subdivision labels such as "(a)" are left out of the quoted text and kept in
// the citation, which is how the fixtures' own text reads.

import type { StatuteQuote } from './georgia-quotes'

const FL = 'flsenate-ch720-2026.html'
const TX = 'tx-prop-209-0062-2026.txt'
const CA = 'ca-civ-davis-stirling-2026.txt'
const TXC = 'tx-prop-209-2026.txt'
const TX4 = 'tx-prop-209-004-2026.txt'
const TX7 = 'tx-prop-207-2026.txt'

export const STATE_QUOTES = {
  // Florida: estoppel certificates, Fla. Stat. § 720.30851
  flEstopIssue: {
    cite: 'Fla. Stat. § 720.30851',
    fixture: FL,
    quote: "Within 10 business days after receiving a written or electronic request for an estoppel certificate from a parcel owner or the parcel owner’s designee, or a parcel mortgagee or the parcel mortgagee’s designee, the association shall issue the estoppel certificate.",
  },
  flEstopWebsite: {
    cite: 'Fla. Stat. § 720.30851',
    fixture: FL,
    quote: "Each association shall designate on its website a person or entity with a street or e-mail address for receipt of a request for an estoppel certificate issued pursuant to this section.",
  },
  flEstopDelivery: {
    cite: 'Fla. Stat. § 720.30851',
    fixture: FL,
    quote: "The estoppel certificate must be provided by hand delivery, regular mail, or e-mail to the requestor on the date of issuance of the estoppel certificate.",
  },
  flEstopEffective: {
    cite: 'Fla. Stat. § 720.30851(2)',
    fixture: FL,
    quote: "An estoppel certificate that is hand delivered or sent by electronic means has a 30-day effective period. An estoppel certificate that is sent by regular mail has a 35-day effective period.",
  },
  flEstopAmended: {
    cite: 'Fla. Stat. § 720.30851(2)',
    fixture: FL,
    quote: "A fee may not be charged for an amended estoppel certificate.",
  },
  flEstopReliance: {
    cite: 'Fla. Stat. § 720.30851(3)',
    fixture: FL,
    quote: "An association waives the right to collect any moneys owed in excess of the amounts specified in the estoppel certificate from any person who in good faith relies upon the estoppel certificate and from the person’s successors and assigns.",
  },
  flEstopLate: {
    cite: 'Fla. Stat. § 720.30851(4)',
    fixture: FL,
    quote: "If an association receives a request for an estoppel certificate from a parcel owner or the parcel owner’s designee, or a parcel mortgagee or the parcel mortgagee’s designee, and fails to deliver the estoppel certificate within 10 business days, a fee may not be charged for the preparation and delivery of that estoppel certificate.",
  },
  flEstopSuit: {
    cite: 'Fla. Stat. § 720.30851(5)',
    fixture: FL,
    quote: "A summary proceeding pursuant to s. 51.011 may be brought to compel compliance with this section, and the prevailing party is entitled to recover reasonable attorney fees.",
  },
  flEstopFee: {
    cite: 'Fla. Stat. § 720.30851(6)',
    fixture: FL,
    quote: "An association or its authorized agent may charge a reasonable fee for the preparation and delivery of an estoppel certificate, which may not exceed $250, if, on the date the certificate is issued, no delinquent amounts are owed to the association for the applicable parcel.",
  },
  flEstopFeeExtra: {
    cite: 'Fla. Stat. § 720.30851(6)',
    fixture: FL,
    quote: "If an estoppel certificate is requested on an expedited basis and delivered within 3 business days after the request, the association may charge an additional fee of $100. If a delinquent amount is owed to the association for the applicable parcel, an additional fee for the estoppel certificate may not exceed $150.",
  },
  flEstopAuthority: {
    cite: 'Fla. Stat. § 720.30851(8)',
    fixture: FL,
    quote: "The authority to charge a fee for the preparation and delivery of the estoppel certificate must be established by a written resolution adopted by the board or provided by a written management, bookkeeping, or maintenance contract and is payable upon the preparation of the certificate.",
  },
  flEstopCpi: {
    cite: 'Fla. Stat. § 720.30851(9)',
    fixture: FL,
    quote: "The fees specified in this section shall be adjusted every 5 years in an amount equal to the total of the annual increases for that 5-year period in the Consumer Price Index for All Urban Consumers, U.S. City Average, All Items.",
  },

  // Florida: fines and suspensions, Fla. Stat. § 720.305(2)
  flFineCap: {
    cite: 'Fla. Stat. § 720.305(2)',
    fixture: FL,
    quote: "A fine may not exceed $100 per violation against any member or any member’s tenant, guest, or invitee for the failure of the owner of the parcel or its occupant, licensee, or invitee to comply with any provision of the declaration, the association bylaws, or reasonable rules of the association unless otherwise provided in the governing documents.",
  },
  flFineDaily: {
    cite: 'Fla. Stat. § 720.305(2)',
    fixture: FL,
    quote: "A fine may be levied by the board for each day of a continuing violation, with a single notice and opportunity for hearing, except that the fine may not exceed $1,000 in the aggregate unless otherwise provided in the governing documents. A fine of less than $1,000 may not become a lien against a parcel.",
  },
  flFineSuspend: {
    cite: 'Fla. Stat. § 720.305(2)(a)',
    fixture: FL,
    quote: "A suspension may not prohibit an owner or tenant of a parcel from having vehicular and pedestrian ingress to and egress from the parcel, including, but not limited to, the right to park.",
  },
  flHearingNotice: {
    cite: 'Fla. Stat. § 720.305(2)(b)',
    fixture: FL,
    quote: "A fine or suspension levied by the board of administration may not be imposed unless the board first provides at least 14 days’ written notice of the parcel owner’s right to a hearing to the parcel owner at his or her designated mailing or e-mail address in the association’s official records and, if applicable, to any occupant, licensee, or invitee of the parcel owner, sought to be fined or suspended.",
  },
  flHearingPanel: {
    cite: 'Fla. Stat. § 720.305(2)(b)',
    fixture: FL,
    quote: "Such hearing must be held within 90 days after issuance of the notice before a committee of at least three members appointed by the board who are not officers, directors, or employees of the association, or the spouse, parent, child, brother, or sister of an officer, director, or employee.",
  },
  flHearingContents: {
    cite: 'Fla. Stat. § 720.305(2)(b)',
    fixture: FL,
    quote: "The notice must include a description of the alleged violation; the specific action required to cure such violation, if applicable; and the hearing date, location, and access information if held by telephone or other electronic means. A parcel owner has the right to attend a hearing by telephone or other electronic means.",
  },
  flHearingVote: {
    cite: 'Fla. Stat. § 720.305(2)(c)',
    fixture: FL,
    quote: "If the committee, by majority vote, does not approve a proposed fine or suspension, the proposed fine or suspension may not be imposed. The role of the committee is limited to determining whether to confirm or reject the fine or suspension levied by the board.",
  },
  flHearingFindings: {
    cite: 'Fla. Stat. § 720.305(2)(d)',
    fixture: FL,
    quote: "Within 7 days after the hearing, the committee shall provide written notice to the parcel owner at his or her designated mailing or e-mail address in the association’s official records and, if applicable, any occupant, licensee, or invitee of the parcel owner, of the committee’s findings related to the violation, including any applicable fines or suspensions that the committee approved or rejected, and how the parcel owner or any occupant, licensee, or invitee of the parcel owner may cure the violation, if applicable, or fulfill a suspension, or the date by which a fine must be paid.",
  },
  flHearingCured: {
    cite: 'Fla. Stat. § 720.305(2)(e)',
    fixture: FL,
    quote: "If a violation has been cured before the hearing or in the manner specified in the written notice required in paragraph (b) or paragraph (d), a fine or suspension may not be imposed.",
  },
  flHearingPayDate: {
    cite: 'Fla. Stat. § 720.305(2)(f)',
    fixture: FL,
    quote: "If a violation is not cured and the proposed fine or suspension levied by the board is approved by the committee by a majority vote, the committee must set a date by which the fine must be paid, which date must be at least 30 days after delivery of the written notice required in paragraph (d).",
  },

  // Texas: payment plans and the order payments are applied
  txPlanAdopt: {
    cite: 'Tex. Prop. Code § 209.0062(a)',
    fixture: TX,
    quote: "A property owners' association composed of more than 14 lots shall adopt reasonable guidelines to establish an alternative payment schedule by which an owner may make partial payments to the property owners' association for delinquent regular or special assessments or any other amount owed to the association without accruing additional monetary penalties.",
  },
  txPlanPenalty: {
    cite: 'Tex. Prop. Code § 209.0062(a)',
    fixture: TX,
    quote: "For purposes of this section, monetary penalties do not include reasonable costs associated with administering the payment plan or interest.",
  },
  txPlanMinTerm: {
    cite: 'Tex. Prop. Code § 209.0062(b)',
    fixture: TX,
    quote: "The minimum term for a payment plan offered by a property owners' association is three months.",
  },
  txPlanMax: {
    cite: 'Tex. Prop. Code § 209.0062(c)',
    fixture: TX,
    quote: "A property owners' association is not required to allow a payment plan for any amount that extends more than 18 months from the date of the owner's request for a payment plan.",
  },
  txPlanDefault: {
    cite: 'Tex. Prop. Code § 209.0062(c)',
    fixture: TX,
    quote: "The association is not required to enter into a payment plan with an owner who failed to honor the terms of a previous payment plan during the two years following the owner's default under the previous payment plan.",
  },
  txPlanCure: {
    cite: 'Tex. Prop. Code § 209.0062(c)',
    fixture: TX,
    quote: "The association is not required to make a payment plan available to an owner after the period for cure described by Section 209.0064(b)(3) expires.",
  },
  txPlanOnce: {
    cite: 'Tex. Prop. Code § 209.0062(c)',
    fixture: TX,
    quote: "The association is not required to allow an owner to enter into a payment plan more than once in any 12-month period.",
  },
  txPlanFile: {
    cite: 'Tex. Prop. Code § 209.0062(d)',
    fixture: TX,
    quote: "A property owners' association shall file the association's guidelines under this section in the real property records of each county in which the subdivision is located.",
  },
  txPlanNoFile: {
    cite: 'Tex. Prop. Code § 209.0062(e)',
    fixture: TX,
    quote: "A property owners' association's failure to file as required by this section the association's guidelines in the real property records of each county in which the subdivision is located does not prohibit a property owner from receiving an alternative payment schedule by which the owner may make partial payments to the property owners' association for delinquent regular or special assessments or any other amount owed to the association without accruing additional monetary penalties, as defined by Subsection (a).",
  },
  txPrioIntro: {
    cite: 'Tex. Prop. Code § 209.0063(a)',
    fixture: TX,
    quote: "Except as provided by Subsection (b), a payment received by a property owners' association from the owner shall be applied to the owner's debt in the following order of priority:",
  },
  txPrio1: {
    cite: 'Tex. Prop. Code § 209.0063(a)(1)',
    fixture: TX,
    quote: "any delinquent assessment;",
  },
  txPrio2: {
    cite: 'Tex. Prop. Code § 209.0063(a)(2)',
    fixture: TX,
    quote: "any current assessment;",
  },
  txPrio3: {
    cite: 'Tex. Prop. Code § 209.0063(a)(3)',
    fixture: TX,
    quote: "any reasonable attorney's fees or reasonable third party collection costs incurred by the association associated solely with assessments or any other charge that could provide the basis for foreclosure;",
  },
  txPrio4: {
    cite: 'Tex. Prop. Code § 209.0063(a)(4)',
    fixture: TX,
    quote: "any reasonable attorney's fees incurred by the association that are not subject to Subdivision (3);",
  },
  txPrio5: {
    cite: 'Tex. Prop. Code § 209.0063(a)(5)',
    fixture: TX,
    quote: "any reasonable fines assessed by the association; and",
  },
  txPrio6: {
    cite: 'Tex. Prop. Code § 209.0063(a)(6)',
    fixture: TX,
    quote: "any other reasonable amount owed to the association.",
  },
  txPrioDefault: {
    cite: 'Tex. Prop. Code § 209.0063(b)',
    fixture: TX,
    quote: "If, at the time the property owners' association receives a payment from a property owner, the owner is in default under a payment plan entered into with the association:",
  },
  txPrioDefault1: {
    cite: 'Tex. Prop. Code § 209.0063(b)(1)',
    fixture: TX,
    quote: "the association is not required to apply the payment in the order of priority specified by Subsection (a); and",
  },
  txPrioDefault2: {
    cite: 'Tex. Prop. Code § 209.0063(b)(2)',
    fixture: TX,
    quote: "in applying the payment, a fine assessed by the association may not be given priority over any other amount owed to the association.",
  },

  // California: monetary penalties and discipline hearings (AB 130 text)
  caSchedule: {
    cite: 'Cal. Civ. Code § 5850(a)',
    fixture: CA,
    quote: "If an association adopts or has adopted a policy imposing any monetary penalty, including any fee, on any association member for a violation of the governing documents, including any monetary penalty relating to the activities of a guest or tenant of the member, the board shall adopt and distribute to each member, in the annual policy statement prepared pursuant to Section 5310, a schedule of the monetary penalties that may be assessed for those violations, which shall be in accordance with authorization for member discipline contained in the governing documents.",
  },
  caCapIntro: {
    cite: 'Cal. Civ. Code § 5850(c)',
    fixture: CA,
    quote: "A monetary penalty for a violation of the governing documents shall not exceed the lesser of the following:",
  },
  caCap1: {
    cite: 'Cal. Civ. Code § 5850(c)(1)',
    fixture: CA,
    quote: "The monetary penalty stated in the schedule of monetary penalties or supplement that is in effect at the time of the violation.",
  },
  caCap2: {
    cite: 'Cal. Civ. Code § 5850(c)(2)',
    fixture: CA,
    quote: "One hundred dollars ($100) per violation.",
  },
  caHealth: {
    cite: 'Cal. Civ. Code § 5850(d)(1)',
    fixture: CA,
    quote: "Notwithstanding subdivision (c), the board may impose a penalty stated in the schedule of monetary penalties or supplement that is in effect at the time of the violation that is greater than one hundred dollars ($100) per violation, if the violation may result in an adverse health or safety impact on the common area or another association member’s property.",
  },
  caHealthFinding: {
    cite: 'Cal. Civ. Code § 5850(d)(2)',
    fixture: CA,
    quote: "Before imposing a penalty on a violation pursuant to this subdivision, the board shall make a written finding specifying the adverse health or safety impact in a board meeting open to the members.",
  },
  caNoLate: {
    cite: 'Cal. Civ. Code § 5850(e)',
    fixture: CA,
    quote: "A late charge or interest shall not be charged to a member for a monetary penalty.",
  },
  caNotice: {
    cite: 'Cal. Civ. Code § 5855(a)',
    fixture: CA,
    quote: "When the board is to meet to consider or impose discipline upon a member, or to impose a monetary charge as a means of reimbursing the association for costs incurred by the association in the repair of damage to the common area and facilities caused by a member or the member’s guest or tenant, the board shall notify the member in writing, by either personal delivery or individual delivery pursuant to Section 4040, at least 10 days prior to the meeting.",
  },
  caNoticeContents: {
    cite: 'Cal. Civ. Code § 5855(b)',
    fixture: CA,
    quote: "The notification shall contain, at a minimum, the date, time, and place of the meeting, the nature of the alleged violation for which a member may be disciplined or the nature of the damage to the common area and facilities for which a monetary charge may be imposed, and a statement that the member has a right to attend and may address the board at the meeting. The board shall meet in executive session if requested by the member.",
  },
  caCure: {
    cite: 'Cal. Civ. Code § 5855(c)',
    fixture: CA,
    quote: "A member shall have the opportunity to cure the violation prior to the meeting. The board shall not impose discipline in either of the following circumstances:",
  },
  caCure1: {
    cite: 'Cal. Civ. Code § 5855(c)(1)',
    fixture: CA,
    quote: "The member cures the violation prior to the meeting.",
  },
  caCure2: {
    cite: 'Cal. Civ. Code § 5855(c)(2)',
    fixture: CA,
    quote: "If curing the violation would take longer than the time between the notice provided pursuant to subdivision (a) and the meeting, the member provides financial commitment to cure the violation.",
  },
  caIdr: {
    cite: 'Cal. Civ. Code § 5855(d)',
    fixture: CA,
    quote: "If the board and the member are not in agreement after the meeting, a member shall have the opportunity to request internal dispute resolution pursuant to Section 5910.",
  },
  caAgreement: {
    cite: 'Cal. Civ. Code § 5855(e)',
    fixture: CA,
    quote: "If the board and the member are in agreement after the meeting, the board shall draft a written resolution.",
  },
  caDecision: {
    cite: 'Cal. Civ. Code § 5855(f)',
    fixture: CA,
    quote: "If the board imposes discipline on a member or imposes a monetary charge on the member for damage to the common area and facilities, the board shall provide the member with a written notification of the decision, by either personal delivery or individual delivery pursuant to Section 4040, within 14 days following the action.",
  },
  caEffective: {
    cite: 'Cal. Civ. Code § 5855(g)',
    fixture: CA,
    quote: "A disciplinary action or the imposition of a monetary charge for damage to the common area shall not be effective against a member unless the board fulfills the requirements of this section.",
  },
  caNoNewPower: {
    cite: 'Cal. Civ. Code § 5865',
    fixture: CA,
    quote: "Nothing in Section 5850 or 5855 shall be construed to create, expand, or reduce the authority of the board to impose monetary penalties on a member for a violation of the governing documents.",
  },

  // Florida: official records, Fla. Stat. § 720.303(5) (BL-172 batch 10)
  flRecInspect: {
    cite: 'Fla. Stat. § 720.303(5)(a)',
    fixture: FL,
    quote: "Unless otherwise provided by law or the governing documents of the association, the official records must be maintained within this state for at least 7 years and be made available to a parcel owner for inspection or photocopying within 45 miles of the community or within the county in which the association is located within 10 business days after receipt by the board or its designee of a written request from the parcel owner.",
  },
  flRecElectronic: {
    cite: 'Fla. Stat. § 720.303(5)(a)',
    fixture: FL,
    quote: "This subsection may be complied with by having a copy of the official records available for inspection or copying in the community or by making the records available to a parcel owner electronically via the Internet or by allowing the records to be viewed in electronic format on a computer screen and printed upon request.",
  },
  flRecDevice: {
    cite: 'Fla. Stat. § 720.303(5)(a)',
    fixture: FL,
    quote: "An association shall allow a member or his or her authorized representative to use a portable device, including a smartphone, tablet, portable scanner, or any other technology capable of scanning or taking photographs, to make an electronic copy of the official records in lieu of the association’s providing the member or his or her authorized representative with a copy of such records. The association may not charge a fee to a member or his or her authorized representative for the use of a portable device.",
  },
  flRecPresumption: {
    cite: 'Fla. Stat. § 720.303(5)(b)',
    fixture: FL,
    quote: "The failure of an association to provide access to the records within 10 business days after receipt of a written request submitted by certified mail, return receipt requested, creates a rebuttable presumption that the association willfully failed to comply with this subsection.",
  },
  flRecDamages: {
    cite: 'Fla. Stat. § 720.303(5)(c)',
    fixture: FL,
    quote: "A member denied access to official records is entitled to the actual damages or minimum damages for the association’s willful failure to comply with this subsection. The minimum damages are to be $50 per calendar day up to 10 days, the calculation to begin on the 11th business day after receipt of the written request.",
  },
  flRecCriminal: {
    cite: 'Fla. Stat. § 720.303(5)(d)',
    fixture: FL,
    quote: "Any director or member of the board or association or a community association manager who knowingly, willfully, and repeatedly violates paragraph (a), with the intent of causing harm to the association or one or more of its members, commits a misdemeanor of the second degree, punishable as provided in s. 775.082 or s. 775.083.",
  },
  flRecRules: {
    cite: 'Fla. Stat. § 720.303(5)(g)',
    fixture: FL,
    quote: "The association may adopt reasonable written rules governing the frequency, time, location, notice, records to be inspected, and manner of inspections, but may not require a parcel owner to demonstrate any proper purpose for the inspection, state any reason for the inspection, or limit a parcel owner’s right to inspect records to less than one 8-hour business day per month.",
  },
  flRecFees: {
    cite: 'Fla. Stat. § 720.303(5)(g)',
    fixture: FL,
    quote: "The association may impose fees to cover the costs of providing copies of the official records, including the costs of copying and the costs required for personnel to retrieve and copy the records if the time spent retrieving and copying the records exceeds one-half hour and if the personnel costs do not exceed $20 per hour. Personnel costs may not be charged for records requests that result in the copying of 25 or fewer pages. The association may charge up to 25 cents per page for copies made on the association’s photocopier.",
  },
  flRecNotAccessible: {
    cite: 'Fla. Stat. § 720.303(5)(g)',
    fixture: FL,
    quote: "Notwithstanding this subsection, the following records are not accessible to members or parcel owners:",
  },
  flRecPersonal: {
    cite: 'Fla. Stat. § 720.303(5)(g)6.',
    fixture: FL,
    quote: "Social security numbers, driver license numbers, credit card numbers, electronic mailing addresses, telephone numbers, facsimile numbers, emergency contact information, any addresses for a parcel owner other than as provided for association notice requirements, and other personal identifying information of any person, excluding the person’s name, parcel designation, mailing address, and property address.",
  },

  // California: association records, Civ. Code §§ 5200, 5210, 5220 (BL-172 batch 10)
  caRecDef: {
    cite: 'Cal. Civ. Code § 5200(a)',
    fixture: CA,
    quote: "“Association records” means all of the following:",
  },
  caRecMinutes: {
    cite: 'Cal. Civ. Code § 5200(a)(8)',
    fixture: CA,
    quote: "Agendas and minutes of meetings of the members, the board, and any committees appointed by the board pursuant to Section 7212 of the Corporations Code; excluding, however, minutes and other information from executive sessions of the board as described in Article 2 (commencing with Section 4900).",
  },
  caRecMembers: {
    cite: 'Cal. Civ. Code § 5200(a)(9)',
    fixture: CA,
    quote: "Membership lists, including name, property address, mailing address, email address, as collected by the association in accordance with Section 4041 where applicable, but not including information for members who have opted out pursuant to Section 5220.",
  },
  caRecEnhanced: {
    cite: 'Cal. Civ. Code § 5200(b)',
    fixture: CA,
    quote: "“Enhanced association records” means invoices, receipts, and canceled checks for payments made by the association, purchase orders approved by the association, bank account statements for bank accounts in which assessments are deposited or withdrawn, credit card statements for credit cards issued in the name of the association, statements for services rendered, and reimbursement requests submitted to the association.",
  },
  caRecElection: {
    cite: 'Cal. Civ. Code § 5200(c)',
    fixture: CA,
    quote: "Signed voter envelopes may be inspected but may not be copied. An association shall maintain association election materials for one year after the date of the election.",
  },
  caRecPeriod: {
    cite: 'Cal. Civ. Code § 5210(a)(1)',
    fixture: CA,
    quote: "For the current fiscal year and for each of the previous two fiscal years.",
  },
  caRecMinutesForever: {
    cite: 'Cal. Civ. Code § 5210(a)(2)',
    fixture: CA,
    quote: "Notwithstanding paragraph (1), minutes of member and board meetings are subject to inspection permanently.",
  },
  caRecCurrent: {
    cite: 'Cal. Civ. Code § 5210(b)(1)',
    fixture: CA,
    quote: "Association records prepared during the current fiscal year, within 10 business days following the association’s receipt of the request.",
  },
  caRecPrevious: {
    cite: 'Cal. Civ. Code § 5210(b)(2)',
    fixture: CA,
    quote: "Association records prepared during the previous two fiscal years, within 30 calendar days following the association’s receipt of the request.",
  },
  caRecMemberList: {
    cite: 'Cal. Civ. Code § 5210(b)(6)',
    fixture: CA,
    quote: "Membership list, within the timeframe specified in Section 8330 of the Corporations Code.",
  },
  caRecOptOut: {
    cite: 'Cal. Civ. Code § 5220',
    fixture: CA,
    quote: "A member of the association may opt out of the sharing of that member’s name, property address, email address, and mailing address by notifying the association in writing that the member prefers to be contacted via the alternative process described in subdivision (c) of Section 8330 of the Corporations Code.",
  },

  // Texas: management certificates, Tex. Prop. Code § 209.004 (BL-172 batch 10)
  txMcRecord: {
    cite: 'Tex. Prop. Code § 209.004(a)',
    fixture: TX4,
    quote: "A property owners' association shall record in each county in which any portion of the residential subdivision is located a management certificate, signed and acknowledged by an officer or the managing agent of the association, stating:",
  },
  txMcContact: {
    cite: 'Tex. Prop. Code § 209.004(a)(6)',
    fixture: TX4,
    quote: "the name, mailing address, telephone number, and e-mail address of the person managing the association or the association's designated representative;",
  },
  txMcWebsite: {
    cite: 'Tex. Prop. Code § 209.004(a)(7)',
    fixture: TX4,
    quote: "the website address of any Internet website on which the association's dedicatory instruments are available in accordance with Section 207.006;",
  },
  txMcTransferFee: {
    cite: 'Tex. Prop. Code § 209.004(a)(8)',
    fixture: TX4,
    quote: "the amount and description of a fee or fees charged by the association relating to a property transfer in the subdivision; and",
  },
  txMcClerk: {
    cite: 'Tex. Prop. Code § 209.004(a-1)',
    fixture: TX4,
    quote: "The county clerk of each county in which a management certificate is filed as required by this section shall record the management certificate in the real property records of the county and index the document as a \"Property Owners' Association Management Certificate.\"",
  },
  txMcAmend: {
    cite: 'Tex. Prop. Code § 209.004(b)',
    fixture: TX4,
    quote: "The property owners' association shall record an amended management certificate in each county in which any portion of the residential subdivision is located not later than the 30th day after the date the association has notice of a change in any information in the recorded certificate required by Subsection (a).",
  },
  txMcTrec: {
    cite: 'Tex. Prop. Code § 209.004(b-1)',
    fixture: TX4,
    quote: "Not later than the seventh day after the date a property owners' association files a management certificate for recording under Subsection (a) or files an amended management certificate for recording under Subsection (b), the property owners' association shall electronically file the management certificate or amended management certificate with the Texas Real Estate Commission.",
  },
  txMcLiability: {
    cite: 'Tex. Prop. Code § 209.004(c)',
    fixture: TX4,
    quote: "Except as provided under Subsections (d) and (e), the property owners' association and its officers, directors, employees, and agents are not subject to liability to any person for a delay in recording or failure to record a management certificate with a county clerk's office or electronically file the management certificate with the Texas Real Estate Commission, unless the delay or failure is wilful or caused by gross negligence.",
  },
  txMcPurchaser: {
    cite: 'Tex. Prop. Code § 209.004(d)',
    fixture: TX4,
    quote: "If a property owners' association fails to record a management certificate or an amended management certificate under this section, the purchaser, lender, or title insurance company or its agent in a transaction involving property in the property owners' association is not liable to the property owners' association for:",
  },
  txMcLien: {
    cite: 'Tex. Prop. Code § 209.004(e)',
    fixture: TX4,
    quote: "A lien of a property owners' association that fails to file a management certificate or an amended management certificate under this section to secure an amount due on the effective date of a transfer to a bona fide purchaser is enforceable only for an amount incurred after the effective date of sale.",
  },
  txMcOwnerFees: {
    cite: 'Tex. Prop. Code § 209.004(e)',
    fixture: TX4,
    quote: "An owner is not liable for attorney's fees incurred by a property owners' association relating to the collection of a delinquent assessment against the owner or interest on the amount of a delinquent assessment if the attorney's fees are incurred by the association or the interest accrues during the period a management certificate is not recorded with a county clerk or electronically filed with the Texas Real Estate Commission as required by this section.",
  },
  txMcBfp: {
    cite: 'Tex. Prop. Code § 209.004(f)',
    fixture: TX4,
    quote: "For purposes of this section, \"bona fide purchaser\" means:",
  },
  // Texas: resale certificate, Tex. Prop. Code ch. 207 (BL-172 batch 11)
  txResaleDeadline: {
    cite: 'Tex. Prop. Code § 207.003(a)',
    fixture: TX7,
    quote: "Not later than the 10th business day after the date a written request for subdivision information is received from an owner or the owner's agent, a purchaser of property in a subdivision or the purchaser's agent, or a title insurance company or its agent acting on behalf of the owner or purchaser and the evidence of the requestor's authority to order a resale certificate under Subsection (a-1) is received and verified, the property owners' association shall deliver to the owner or the owner's agent, the purchaser or the purchaser's agent, or the title insurance company or its agent:",
  },
  txResaleFresh: {
    cite: 'Tex. Prop. Code § 207.003(a)(3)',
    fixture: TX7,
    quote: "a resale certificate prepared not earlier than the 60th day before the date the certificate is delivered that complies with Subsection (b).",
  },
  txResaleContents: {
    cite: 'Tex. Prop. Code § 207.003(b)',
    fixture: TX7,
    quote: "A resale certificate under Subsection (a) must contain:",
  },
  txResaleAssessments: {
    cite: 'Tex. Prop. Code § 207.003(b)(2)',
    fixture: TX7,
    quote: "the frequency and amount of any regular assessments;",
  },
  txResaleOwed: {
    cite: 'Tex. Prop. Code § 207.003(b)(4)',
    fixture: TX7,
    quote: "the total of all amounts due and unpaid to the property owners' association that are attributable to the owner's property;",
  },
  txResaleReserves: {
    cite: 'Tex. Prop. Code § 207.003(b)(6)',
    fixture: TX7,
    quote: "the amount of reserves, if any, for capital expenditures;",
  },
  txResaleBudget: {
    cite: 'Tex. Prop. Code § 207.003(b)(7)',
    fixture: TX7,
    quote: "the property owners' association's current operating budget and balance sheet;",
  },
  txResaleViolations: {
    cite: 'Tex. Prop. Code § 207.003(b)(11)',
    fixture: TX7,
    quote: "a description of any conditions on the owner's property that the property owners' association board has actual knowledge are in violation of the restrictions applying to the subdivision or the bylaws or rules of the property owners' association;",
  },
  txResaleTransferFees: {
    cite: 'Tex. Prop. Code § 207.003(b)(16)',
    fixture: TX7,
    quote: "a statement of all fees associated with the transfer of ownership, including a description of each fee, to whom each fee is paid, and the amount of each fee.",
  },
  txResaleFee: {
    cite: 'Tex. Prop. Code § 207.003(c)',
    fixture: TX7,
    quote: "A property owners' association may charge a reasonable and necessary fee, not to exceed $375, to assemble, copy, and deliver the information required by this section and may charge a reasonable and necessary fee, not to exceed $75, to prepare and deliver an update of a resale certificate under Subsection (f).",
  },
  txResaleLateFee: {
    cite: 'Tex. Prop. Code § 207.003(c-1)',
    fixture: TX7,
    quote: "The association may not charge a fee if the certificate is not provided in the time prescribed by Subsection (a).",
  },
  txResaleAddress: {
    cite: 'Tex. Prop. Code § 207.003(d)',
    fixture: TX7,
    quote: "A written request that does not specify the name and location to which the information is to be sent is not effective.",
  },
  txResaleUpdate: {
    cite: 'Tex. Prop. Code § 207.003(f)',
    fixture: TX7,
    quote: "Not later than the seventh business day after the date a written request for an update of a resale certificate delivered under Subsection (a) is received from an owner, owner's agent, or title insurance company or its agent acting on behalf of the owner, the property owners' association shall deliver to the owner, owner's agent, or title insurance company or its agent an updated resale certificate that contains the following information:",
  },
  txResaleUpdateWindow: {
    cite: 'Tex. Prop. Code § 207.003(g)',
    fixture: TX7,
    quote: "Requests for an updated resale certificate pursuant to Subsection (f) must be made within 180 days of the date a resale certificate is issued under Subsection (a).",
  },
  txResaleSecond: {
    cite: 'Tex. Prop. Code § 207.004(a)',
    fixture: TX7,
    quote: "If a property owners' association does not timely deliver information in accordance with Section 207.003, the owner, owner's agent, or title insurance company or its agent acting on behalf of the owner may submit a second request for the information.",
  },
  txResaleJudgment: {
    cite: 'Tex. Prop. Code § 207.004(b)(1)(B)',
    fixture: TX7,
    quote: "a judgment against the property owners' association for not more than $5,000;",
  },
  txResaleCondo: {
    cite: 'Tex. Prop. Code § 207.002(b)',
    fixture: TX7,
    quote: "This chapter does not apply to a condominium council of owners governed by Chapter 81 or a condominium unit owners' association governed by Chapter 82.",
  },

  // California: internal dispute resolution, Civ. Code §§ 5900-5920 (BL-172 batch 13)
  caIdrScope: {
    cite: 'Cal. Civ. Code § 5900(a)',
    fixture: CA,
    quote: "This article applies to a dispute between an association and a member involving their rights, duties, or liabilities under this act, under the Nonprofit Mutual Benefit Corporation Law (Part 3 (commencing with Section 7110) of Division 2 of Title 1 of the Corporations Code), or under the governing documents of the common interest development or association.",
  },
  caIdrSupplement: {
    cite: 'Cal. Civ. Code § 5900(b)',
    fixture: CA,
    quote: "This article supplements, and does not replace, Article 3 (commencing with Section 5925), relating to alternative dispute resolution as a prerequisite to an enforcement action.",
  },
  caIdrFair: {
    cite: 'Cal. Civ. Code § 5905(a)',
    fixture: CA,
    quote: "An association shall provide a fair, reasonable, and expeditious procedure for resolving a dispute within the scope of this article.",
  },
  caIdrMediation: {
    cite: 'Cal. Civ. Code § 5905(b)',
    fixture: CA,
    quote: "In developing a procedure pursuant to this article, an association shall make maximum, reasonable use of available local dispute resolution programs involving a neutral third party, including low-cost mediation programs such as those listed on the Internet Web sites of the Department of Consumer Affairs and the United States Department of Housing and Urban Development.",
  },
  caIdrDefault: {
    cite: 'Cal. Civ. Code § 5905(c)',
    fixture: CA,
    quote: "If an association does not provide a fair, reasonable, and expeditious procedure for resolving a dispute within the scope of this article, the procedure provided in Section 5915 applies and satisfies the requirement of subdivision (a).",
  },
  caIdrMinimum: {
    cite: 'Cal. Civ. Code § 5910',
    fixture: CA,
    quote: "A fair, reasonable, and expeditious dispute resolution procedure shall, at a minimum, satisfy all of the following requirements:",
  },
  caIdrInvoke: {
    cite: 'Cal. Civ. Code § 5910(a)',
    fixture: CA,
    quote: "The procedure may be invoked by either party to the dispute. A request invoking the procedure shall be in writing.",
  },
  caIdrDeadlines: {
    cite: 'Cal. Civ. Code § 5910(b)',
    fixture: CA,
    quote: "The procedure shall provide for prompt deadlines. The procedure shall state the maximum time for the association to act on a request invoking the procedure.",
  },
  caIdrMemberInvokes: {
    cite: 'Cal. Civ. Code § 5910(c)',
    fixture: CA,
    quote: "If the procedure is invoked by a member, the association shall participate in the procedure.",
  },
  caIdrAssocInvokes: {
    cite: 'Cal. Civ. Code § 5910(d)',
    fixture: CA,
    quote: "If the procedure is invoked by the association, the member may elect not to participate in the procedure. If the member participates but the dispute is resolved other than by agreement of the member, the member shall have a right of appeal to the board.",
  },
  caIdrBinding: {
    cite: 'Cal. Civ. Code § 5910(e)',
    fixture: CA,
    quote: "A written resolution, signed by both parties, of a dispute pursuant to the procedure that is not in conflict with the law or the governing documents binds the association and is judicially enforceable. A written agreement, signed by both parties, reached pursuant to the procedure that is not in conflict with the law or the governing documents binds the parties and is judicially enforceable.",
  },
  caIdrExplain: {
    cite: 'Cal. Civ. Code § 5910(f)',
    fixture: CA,
    quote: "The procedure shall provide a means by which the member and the association may explain their positions. The member and association may be assisted by an attorney or another person in explaining their positions at their own cost.",
  },
  caIdrNoFee: {
    cite: 'Cal. Civ. Code § 5910(g)',
    fixture: CA,
    quote: "A member of the association shall not be charged a fee to participate in the process.",
  },
  caMeetRequest: {
    cite: 'Cal. Civ. Code § 5915(b)(1)',
    fixture: CA,
    quote: "The party may request the other party to meet and confer in an effort to resolve the dispute. The request shall be in writing.",
  },
  caMeetRefuse: {
    cite: 'Cal. Civ. Code § 5915(b)(2)',
    fixture: CA,
    quote: "A member of an association may refuse a request to meet and confer. The association shall not refuse a request to meet and confer.",
  },
  caMeetDirector: {
    cite: 'Cal. Civ. Code § 5915(b)(3)',
    fixture: CA,
    quote: "The board shall designate a director to meet and confer.",
  },
  caMeetConfer: {
    cite: 'Cal. Civ. Code § 5915(b)(4)',
    fixture: CA,
    quote: "The parties shall meet promptly at a mutually convenient time and place, explain their positions to each other, and confer in good faith in an effort to resolve the dispute. The parties may be assisted by an attorney or another person at their own cost when conferring.",
  },
  caMeetWritten: {
    cite: 'Cal. Civ. Code § 5915(b)(5)',
    fixture: CA,
    quote: "A resolution of the dispute agreed to by the parties shall be memorialized in writing and signed by the parties, including the board designee on behalf of the association.",
  },
  caMeetBinding: {
    cite: 'Cal. Civ. Code § 5915(c)',
    fixture: CA,
    quote: "A written agreement reached under this section binds the parties and is judicially enforceable if it is signed by both parties and both of the following conditions are satisfied:",
  },
  caMeetNoFee: {
    cite: 'Cal. Civ. Code § 5915(d)',
    fixture: CA,
    quote: "A member shall not be charged a fee to participate in the process.",
  },
  caIdrPolicy: {
    cite: 'Cal. Civ. Code § 5920',
    fixture: CA,
    quote: "The annual policy statement prepared pursuant to Section 5310 shall include a description of the internal dispute resolution process provided pursuant to this article.",
  },

  // Collections notices (BL-172 batch 14): TX § 209.0064, FL § 720.3085, CA §§ 5650-5665
  txCollAgent: {
    cite: 'Tex. Prop. Code § 209.0064(a)',
    fixture: TXC,
    quote: "In this section, \"collection agent\" means a debt collector, as defined by Section 803 of the federal Fair Debt Collection Practices Act (15 U.S.C. Section 1692a).",
  },
  txCollNotice: {
    cite: 'Tex. Prop. Code § 209.0064(b)',
    fixture: TXC,
    quote: "A property owners' association may not hold an owner liable for fees of a collection agent retained by the association unless the association first provides written notice to the owner by certified mail that:",
  },
  txCollAmounts: {
    cite: 'Tex. Prop. Code § 209.0064(b)(1)',
    fixture: TXC,
    quote: "specifies each delinquent amount and the total amount of the payment required to make the account current;",
  },
  txCollOptions: {
    cite: 'Tex. Prop. Code § 209.0064(b)(2)',
    fixture: TXC,
    quote: "if the association is subject to Section 209.0062 or the association's dedicatory instruments contain a requirement to offer a payment plan, describes the options the owner has to avoid having the account turned over to a collection agent, including information regarding availability of a payment plan through the association; and",
  },
  txCollCure: {
    cite: 'Tex. Prop. Code § 209.0064(b)(3)',
    fixture: TXC,
    quote: "provides a period of at least 45 days for the owner to cure the delinquency before further collection action is taken.",
  },
  txCollContingent: {
    cite: 'Tex. Prop. Code § 209.0064(c)(1)',
    fixture: TXC,
    quote: "the obligation for payment by the association to the association's collection agent for fees or costs associated with a collection action is in any way dependent or contingent on amounts recovered; or",
  },
  txCollAgreement: {
    cite: 'Tex. Prop. Code § 209.0064(c)(2)',
    fixture: TXC,
    quote: "the payment agreement between the association and the association's collection agent does not require payment by the association of all fees to a collection agent for the action undertaken by the collection agent.",
  },
  txCollContact: {
    cite: 'Tex. Prop. Code § 209.0064(d)',
    fixture: TXC,
    quote: "The agreement between the property owners' association and the association's collection agent may not prohibit the owner from contacting the association board or the association's managing agent regarding the owner's delinquency.",
  },
  txCollReceivables: {
    cite: 'Tex. Prop. Code § 209.0064(e)',
    fixture: TXC,
    quote: "A property owners' association may not sell or otherwise transfer any interest in the association's accounts receivables for a purpose other than as collateral for a loan.",
  },
  flLienDemand: {
    cite: 'Fla. Stat. § 720.3085(4)',
    fixture: FL,
    quote: "A homeowners’ association may not file a record of lien against a parcel for unpaid assessments unless a written notice or demand for past due assessments as well as any other amounts owed to the association pursuant to its governing documents has been made by the association.",
  },
  flLien45: {
    cite: 'Fla. Stat. § 720.3085(4)(a)',
    fixture: FL,
    quote: "Provide the owner with 45 days following the date the notice is deposited in the mail to make payment for all amounts due, including, but not limited to, any attorney’s fees and actual costs associated with the preparation and delivery of the written demand.",
  },
  flLienFormIntent: {
    cite: 'Fla. Stat. § 720.3085(4)(a)',
    fixture: FL,
    quote: "This letter shall serve as the association’s notice of intent to record a Claim of Lien against your property no sooner than 45 days after your receipt of this letter, unless you pay in full the amounts set forth below:",
  },
  flLienMail: {
    cite: 'Fla. Stat. § 720.3085(4)(b)',
    fixture: FL,
    quote: "Be sent by registered or certified mail, return receipt requested, and by first-class United States mail to the parcel owner at his or her last address as reflected in the records of the association, if the address is within the United States, and to the parcel owner subject to the demand at the address of the parcel if the owner’s address as reflected in the records of the association is not the parcel address.",
  },
  flLienAbroad: {
    cite: 'Fla. Stat. § 720.3085(4)(b)',
    fixture: FL,
    quote: "If the address reflected in the records is outside the United States, then sending the notice to that address and to the parcel address by first-class United States mail is sufficient.",
  },
  flLienLateNotice: {
    cite: 'Fla. Stat. § 720.3085(3)(d)',
    fixture: FL,
    quote: "An association may not require payment of attorney fees related to a past due assessment without first delivering a written notice of late assessment to the parcel owner which specifies the amount owed the association and provides the parcel owner an opportunity to pay the amount owed without the assessment of attorney fees.",
  },
  flLienInterest: {
    cite: 'Fla. Stat. § 720.3085(3)',
    fixture: FL,
    quote: "Assessments and installments on assessments that are not paid when due bear interest from the due date until paid at the rate provided in the declaration of covenants or the bylaws of the association, which rate may not exceed the rate allowed by law.",
  },
  flLienLateFee: {
    cite: 'Fla. Stat. § 720.3085(3)(a)',
    fixture: FL,
    quote: "If the declaration or bylaws so provide, the association may also charge an administrative late fee not to exceed the greater of $25 or 5 percent of the amount of each installment that is paid past the due date.",
  },
  flLienApply: {
    cite: 'Fla. Stat. § 720.3085(3)(b)',
    fixture: FL,
    quote: "Any payment received by an association and accepted shall be applied first to any interest accrued, then to any administrative late fee, then to any costs and reasonable attorney fees incurred in collection, and then to the delinquent assessment.",
  },
  flLienForeclose: {
    cite: 'Fla. Stat. § 720.3085(5)',
    fixture: FL,
    quote: "The action to foreclose the lien may not be brought until 45 days after the parcel owner has been provided notice of the association’s intent to foreclose and collect the unpaid amount.",
  },
  flLienSecondNotice: {
    cite: 'Fla. Stat. § 720.3085(5)',
    fixture: FL,
    quote: "The notice must be given in the manner provided in paragraph (4)(b), and the notice may not be provided until the passage of the 45 days required in paragraph (4)(a).",
  },
  flLienRecover: {
    cite: 'Fla. Stat. § 720.3085(5)(a)',
    fixture: FL,
    quote: "The association may recover any interest, late charges, costs, and reasonable attorney’s fees incurred in a lien foreclosure action or in an action to recover a money judgment for the unpaid assessments.",
  },
  flLienExcept: {
    cite: 'Fla. Stat. § 720.3085(5)(b)',
    fixture: FL,
    quote: "The time limitations in this subsection do not apply if the parcel is subject to a foreclosure action or forced sale of another party, or if an owner of the parcel is a debtor in a bankruptcy proceeding.",
  },
  caCollDelinquent: {
    cite: 'Cal. Civ. Code § 5650(b)',
    fixture: CA,
    quote: "Regular and special assessments levied pursuant to the governing documents are delinquent 15 days after they become due, unless the declaration provides a longer time period, in which case the longer time period shall apply.",
  },
  caCollCosts: {
    cite: 'Cal. Civ. Code § 5650(b)(1)',
    fixture: CA,
    quote: "Reasonable costs incurred in collecting the delinquent assessment, including reasonable attorney’s fees.",
  },
  caCollLate: {
    cite: 'Cal. Civ. Code § 5650(b)(2)',
    fixture: CA,
    quote: "A late charge not exceeding 10 percent of the delinquent assessment or ten dollars ($10), whichever is greater, unless the declaration specifies a late charge in a smaller amount, in which case any late charge imposed shall not exceed the amount specified in the declaration.",
  },
  caCollInterest: {
    cite: 'Cal. Civ. Code § 5650(b)(3)',
    fixture: CA,
    quote: "Interest on all sums imposed in accordance with this section, including the delinquent assessments, reasonable fees and costs of collection, and reasonable attorney’s fees, at an annual interest rate not to exceed 12 percent, commencing 30 days after the assessment becomes due, unless the declaration specifies the recovery of interest at a rate of a lesser amount, in which case the lesser rate of interest shall apply.",
  },
  caCollNotice: {
    cite: 'Cal. Civ. Code § 5660',
    fixture: CA,
    quote: "At least 30 days prior to recording a lien upon the separate interest of the owner of record to collect a debt that is past due under Section 5650, the association shall notify the owner of record in writing by certified mail of the following:",
  },
  caCollDescription: {
    cite: 'Cal. Civ. Code § 5660(a)',
    fixture: CA,
    quote: "A general description of the collection and lien enforcement procedures of the association and the method of calculation of the amount, a statement that the owner of the separate interest has the right to inspect the association records pursuant to Section 5205, and the following statement in 14-point boldface type, if printed, or in capital letters, if typed: “IMPORTANT NOTICE: IF YOUR SEPARATE INTEREST IS PLACED IN FORECLOSURE BECAUSE YOU ARE BEHIND IN YOUR ASSESSMENTS, IT MAY BE SOLD WITHOUT COURT ACTION.”",
  },
  caCollMeeting: {
    cite: 'Cal. Civ. Code § 5660(d)',
    fixture: CA,
    quote: "The right to request a meeting with the board as provided in Section 5665.",
  },
  caCollAdr: {
    cite: 'Cal. Civ. Code § 5660(f)',
    fixture: CA,
    quote: "The right to request alternative dispute resolution with a neutral third party pursuant to Article 3 (commencing with Section 5925) of Chapter 10 before the association may initiate foreclosure against the owner’s separate interest, except that binding arbitration shall not be available if the association intends to initiate a judicial foreclosure.",
  },
  caCollPlanStandards: {
    cite: 'Cal. Civ. Code § 5665(a)',
    fixture: CA,
    quote: "The association shall provide the owners the standards for payment plans, if any exists.",
  },
  caCollPlanMeeting: {
    cite: 'Cal. Civ. Code § 5665(b)',
    fixture: CA,
    quote: "The board shall meet with the owner in executive session within 45 days of the postmark of the request, if the request is mailed within 15 days of the date of the postmark of the notice, unless there is no regularly scheduled board meeting within that period, in which case the board may designate a committee of one or more directors to meet with the owner.",
  },
  caCollPlanLien: {
    cite: 'Cal. Civ. Code § 5665(d)',
    fixture: CA,
    quote: "Payment plans shall not impede an association’s ability to record a lien on the owner’s separate interest to secure payment of delinquent assessments.",
  },
} as const satisfies Record<string, StatuteQuote>
