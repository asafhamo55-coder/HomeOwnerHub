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
} as const satisfies Record<string, StatuteQuote>
