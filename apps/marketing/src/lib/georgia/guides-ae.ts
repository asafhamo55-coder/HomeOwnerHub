// SEO batch 31: two Florida guides and one Texas guide.
//   1. Florida budget, reserves and financial reports, Fla. Stat. 720.303(6) and (7).
//   2. Florida recall of directors, Fla. Stat. 720.303(10).
//   3. Texas owner suits against the association in justice court, Tex. Prop. Code 209.017, with the 209.002 definitions.
// Statute text only through the quote bank (flBudget*, flReserve*, flFin*, flRecall*, txJustice, txDef*), checked word for
// word by georgia-guides.test.ts against flsenate-ch720-2026.html and tcss-pr209-2026-excerpt.htm. Every other sentence
// restates a quote or says the text we hold is silent, and adds no rule. Chapter 720 only, not condominiums, and Chapter 209
// only, not other Texas chapters. Product claims: none, so each page uses hoaDoesNot.

import type { Guide } from './types'

const PUBLISHED = '2026-11-06'

export const FL_BUDGET_RESERVES: Guide = {
  slug: 'florida-hoa-budget-reserves-and-financial-reports-720-303',
  path: '/guides/florida-hoa-budget-reserves-and-financial-reports-720-303',
  state: 'FL',
  title: 'Florida HOA budget, reserves and financial reports under 720.303',
  metaTitle: 'Florida HOA budget and reserves, 720.303',
  description:
    'Fla. Stat. 720.303 on the annual budget, optional reserve accounts, waiving reserves and the financial report that depends on yearly revenue. A plain guide.',
  eyebrow: 'Florida · Budgets and reserves',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Section 720.303(6) of the Florida Homeowners’ Association Act in chapter 720 requires an annual budget and lets the budget include reserve accounts. Reserves become a rule for the association once the members approve them. Section 720.303(7) then sets the financial report the association prepares after the year ends, and the kind of report depends on total annual revenues.',
    'The text covers homeowners’ associations under chapter 720, not condominiums. This is a plain-language guide to the text we hold, not legal advice. Your attorney and your accountant decide how it applies to your association.',
  ],
  sections: [
    {
      heading: 'The annual budget',
      body: [
        'The association prepares a budget for the year. It sets out expected revenues and expenses and the estimated surplus or deficit at the end of the current year.',
      ],
      quotes: ['flBudgetAnnual'],
    },
    {
      heading: 'Who gets a copy',
      body: [
        'Each member gets the budget itself or a written notice that a copy is available on request at no charge. The time limits come from subsection (5), which this page does not restate. Read that subsection before you set a mailing date.',
      ],
      quotes: ['flBudgetCopy'],
    },
    {
      heading: 'Reserves are optional until members approve them',
      body: [
        'The budget may include reserve accounts for capital expenditures and deferred maintenance. The statute says may. The association is treated as having provided for reserve accounts once a majority of the total voting interests approve, either at a meeting or in writing. The approval must say reserves will be provided in the budget and name the components.',
      ],
      quotes: ['flReserveMay', 'flReserveApprove'],
    },
    {
      heading: 'How the amount is computed',
      body: [
        'Once reserve accounts exist, the amount reserved comes from a formula. The text we hold also describes a separate analysis for each asset and a pooled analysis for two or more assets. Ask your accountant or reserve preparer which one your association uses.',
      ],
      quotes: ['flReserveFormula'],
    },
    {
      heading: 'Waiving or reducing reserves',
      body: [
        'After reserve accounts are established, the members can vote to provide for no reserves or less than the section requires. The vote needs a quorum, and it covers one budget year only. If the meeting does not produce a waiver vote or lacks a quorum, the reserves in the budget go into effect.',
      ],
      quotes: ['flReserveWaive', 'flReserveWaiveYear'],
    },
    {
      heading: 'Using reserve money for something else',
      body: [
        'Reserve funds stay in the reserve accounts and are used for authorized reserve expenditures. Using them for another purpose needs approval in advance.',
      ],
      quotes: ['flReserveUse'],
    },
    {
      heading: 'The financial report after year end',
      body: [
        'The association prepares the report itself or contracts with a third party. The first deadline runs from the end of the fiscal year. Delivery to members has a second deadline, which the text ties to subsection (5) and a 120 day outer limit.',
      ],
      quotes: ['flFinDeadline'],
    },
    {
      heading: 'Which kind of report',
      body: [
        'The kind of statement depends on total annual revenues. A fourth rule for associations with at least 1,000 parcels is in the same paragraph, and the text we hold sends those associations to audited statements whatever their revenues.',
      ],
      quotes: ['flFinSmall', 'flFinCompiled', 'flFinReviewed', 'flFinAudited'],
    },
    {
      heading: 'Members can ask for more',
      body: [
        'If enough parcel owners petition the board for a higher level of financial reporting, the board must call a members’ meeting to vote on it. The same subsection lets members, at a properly called meeting, approve a lower level for a year, but not in consecutive years.',
      ],
      quotes: ['flFinPetition'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold chapter 720 only. We do not state how much to reserve, which accounting standard your accountant applies, or what happens to a board that misses a deadline. We also leave out the developer rules in paragraph (i). Paragraph (c) also requires a conspicuous statement in the financial report when reserves are not provided or not fully funded. Ask your accountant for the required wording. Check the current text with your attorney before the board relies on a date.',
      ],
    },
  ],
  steps: [
    'Read your declaration and bylaws for any limit on assessment increases and for the fiscal year date.',
    'Prepare the annual budget with revenues, expenses and the estimated surplus or deficit. Calendar the delivery date with your attorney.',
    'Find out whether the members ever approved reserve accounts. If they did, keep the vote record with the budget.',
    'Ask your accountant which financial report your revenue level calls for, and who will prepare it.',
    'Calendar the report completion date and the delivery to members. Ask your attorney whether the bylaws set a different date.',
    'If owners petition for a higher level of reporting, ask your attorney how to notice the meeting.',
  ],
  faqs: [
    {
      q: 'Does a Florida HOA have to keep reserves?',
      a: 'Not by the text of § 720.303(6)(b) and (d). The budget may include reserve accounts. Once the members approve them, the association follows the reserve rules in that subsection.',
    },
    {
      q: 'Who can waive reserves?',
      a: 'After reserve accounts exist, the members can vote at a meeting with a quorum to provide for no reserves or less. That vote applies to one budget year.',
    },
    {
      q: 'What financial report does a Florida HOA prepare?',
      a: 'It depends on total annual revenues under § 720.303(7). Below $150,000 it is a report of cash receipts and expenditures. Higher revenue tiers call for compiled, reviewed or audited statements.',
    },
    {
      q: 'When is the financial report due?',
      a: 'The association prepares it within 90 days after the end of the fiscal year, or on the date in the bylaws, and delivers it to members within the limits the statute sets. Ask your attorney to confirm the dates.',
    },
    {
      q: 'Does this apply to a condominium?',
      a: 'No. This page covers homeowners’ associations under chapter 720. A condominium association is under a different chapter.',
    },
  ],
  related: [
    'florida-hoa-board-meeting-notice-rules',
    'florida-hoa-official-records-inspection',
    'florida-hoa-member-meetings-proxies-and-recording',
    'georgia-hoa-reserve-fund-and-reserve-study',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not set your budget, decide whether to fund reserves, calculate a reserve formula or prepare a financial statement. Your board, your accountant and your attorney do that.',
}

export const FL_RECALL: Guide = {
  slug: 'florida-hoa-board-director-recall-720-303',
  path: '/guides/florida-hoa-board-director-recall-720-303',
  state: 'FL',
  title: 'Florida HOA director recall: how members remove a board member under 720.303',
  metaTitle: 'Florida HOA director recall rules, 720.303',
  description:
    'Fla. Stat. 720.303(10) lets a majority of voting interests recall a director, by written ballot or at a meeting. The 5 day board step and the dispute route.',
  eyebrow: 'Florida · Recall',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Section 720.303(10) of the Florida Homeowners’ Association Act in chapter 720 lets members remove a director with or without cause by a majority of the total voting interests, whatever the governing documents say, subject to the section on transition of control from a developer.',
    'A recall can be done by a written agreement or ballot, or at a meeting if the governing documents allow it. The board then has 5 full business days to notice and hold a meeting and decide whether to certify. If it will not certify, it has another 5 full business days after that meeting to file in court or petition for binding arbitration.',
    'The text covers homeowners’ associations under chapter 720, not condominiums. This is a plain-language guide to the text we hold, not legal advice. A recall has short deadlines, so involve an attorney early.',
  ],
  sections: [
    {
      heading: 'Who can be recalled and by whom',
      body: [
        'Any director may be recalled with or without cause by a majority of the total voting interests. If the documents say only one class of members elects a director, only that class votes on recalling that director.',
      ],
      quotes: ['flRecallAny'],
    },
    {
      heading: 'Recall by written agreement or ballot',
      body: [
        'Members can sign a written agreement or written ballots without holding a meeting. The papers are served on the association by certified mail or personal service in the way the statute names. A signed recall paper has a short shelf life and must meet formal requirements, so confirm both with your attorney before anyone relies on it.',
      ],
      
    },
    {
      heading: 'Recall at a meeting',
      body: [
        'A meeting vote is available only if the declaration, articles or bylaws specifically provide for it. The statute says electronic transmission may not be used to give notice of a meeting called for this purpose. Check your documents for who may call the meeting and how.',
      ],
      quotes: ['flRecallMeeting'],
    },
    {
      heading: 'The board’s 5 business day step',
      body: [
        'After the papers are served, the board must notice and hold a meeting within 5 full business days. The same period runs from the end of a members’ recall meeting. At the board meeting the board certifies the recall, or it follows the dispute route in paragraph (d).',
      ],
      quotes: ['flRecallBoardMeet', 'flRecallMeetBoard'],
    },
    {
      heading: 'If the board does not certify',
      body: [
        'A board that decides not to certify must file an action in court or a petition for binding arbitration with the state agency within 5 full business days after the meeting. The text says a recall that goes this route takes effect only when the court enters its final order or the arbitration order is mailed to the association, and the members who voted or signed are treated as one party. Which route fits is a question for your attorney. Recall disputes are not eligible for presuit mediation under 720.311(1). They go to arbitration by the state agency or to court, and the arbitration carries a filing fee and a prevailing party cost rule that your attorney can explain.',
      ],
      
    },
    {
      heading: 'If the board does nothing',
      body: [
        'If the board misses the meeting deadline, the text says the recall is deemed effective and the recalled directors turn over the association’s records and property. A parcel owner representative has a separate way to challenge a board that fails to act, set out in paragraph (g), which requires the petition or action within 60 days after the 5 full business day period ends.',
      ],
      
    },
    {
      heading: 'Minutes and separate votes',
      body: [
        'The minutes of the board meeting about certification are an official record and must show the date, time, decision and vote counts. If the board decides not to certify, the minutes must also give the parcel number and the specific reason for each vote rejected. When more than one director is targeted, each gets a separate vote.',
      ],
      quotes: ['flRecallMinutes'],
    },
    {
      heading: 'A recalled director can challenge it',
      body: [
        'A recalled board member may file an action or petition challenging the validity of the recall, within 60 days after the recall is deemed certified.',
      ],
      
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold chapter 720 only. We do not restate how vacancies are filled after a recall, how a signed recall ballot expires (no ballot is valid more than 120 days after signing), the rule that a member’s written rescission must reach the association before service, the requirement that the instrument list replacement directors when a majority of the board is targeted, the reuse of ballots after a defective first attempt, or the procedural rules of the state agency. Paragraphs (d) and (k) borrow the arbitration procedure from sections of the condominium chapter. The recall right itself comes from chapter 720, and this page does not cover condominium recalls. Paragraph (l) bars the state agency and the courts from accepting a recall petition or action when 60 or fewer days remain until the director’s scheduled reelection, or when 60 or fewer days have passed since the director’s election. Ask your attorney to check that window before anyone files. We give no deadline of our own. Because the clocks are short, ask your attorney before the board acts on either side of a recall.',
      ],
    },
  ],
  steps: [
    'Read your declaration, articles and bylaws for any meeting-based recall rule and for who may call a special meeting.',
    'If a written recall is served, record the date and method of service the same day.',
    'Ask your attorney whether the recalled director’s election date falls within the 60 day window in paragraph (l).',
    'Calendar the 5 full business days and notice a board meeting with your attorney.',
    'At the meeting, decide whether to certify. Record the vote count for each director in the minutes.',
    'If the board will not certify, ask your attorney to file the court action or arbitration petition within the period.',
    'Collect records and property from any director who is removed.',
  ],
  faqs: [
    {
      q: 'Can Florida HOA members remove a director without cause?',
      a: 'Yes. Under § 720.303(10)(a), any director may be recalled with or without cause by a majority of the total voting interests.',
    },
    {
      q: 'How long does the board have to act on a recall?',
      a: 'The board must notice and hold a meeting within 5 full business days after the papers are received or after the members’ meeting adjourns.',
    },
    {
      q: 'What if the board refuses to certify the recall?',
      a: 'It must file a court action or an arbitration petition within 5 full business days after the meeting. Ask an attorney which route to use.',
    },
    {
      q: 'Does this cover condominium recalls?',
      a: 'No. This page covers homeowners’ associations under chapter 720 only.',
    },
  ],
  related: [
    'florida-hoa-elections-and-quorum',
    'florida-hoa-member-meetings-proxies-and-recording',
    'florida-hoa-board-meeting-notice-rules',
    'florida-hoa-presuit-mediation-720-311',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not serve or certify a recall, count recall ballots or file the court action or arbitration petition. Your board and your attorney handle those steps.',
}

export const TX_JUSTICE: Guide = {
  slug: 'texas-hoa-owner-suit-justice-court-209-017',
  path: '/guides/texas-hoa-owner-suit-justice-court-209-017',
  state: 'TX',
  title: 'Texas HOA owner lawsuits in justice court: what 209.017 says',
  metaTitle: 'Texas HOA owner suit in justice court',
  description:
    'Tex. Prop. Code 209.017 lets an owner sue the association for a violation of Chapter 209 in justice court. Who counts as an owner and what the text leaves out.',
  eyebrow: 'Texas · Owner rights',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  summary: [
    'Section 209.017 of the Texas Property Code says an owner of property in a subdivision may bring an action for a violation of Chapter 209 against the property owners’ association in the justice court of a precinct where all or part of the subdivision is located.',
    'The terms in that sentence are defined in Section 209.002, so a board can check whether the section reaches its association. This is a plain-language guide to the text we hold, not legal advice.',
  ],
  sections: [
    {
      heading: 'What the section says',
      body: [
        'The sentence names who may sue, what the suit is about, who it is against and where it is filed.',
      ],
      quotes: ['txJustice'],
    },
    {
      heading: 'Who counts as an owner',
      body: [
        'Chapter 209 defines the word owner by record title, and the definition includes the personal representative of a person who holds record title. A board with a question about whether a particular person is an owner should ask its attorney.',
      ],
      quotes: ['txDefOwner'],
    },
    {
      heading: 'What counts as a subdivision and an association',
      body: [
        'The chapter defines a residential subdivision by its restrictions, and it defines a property owners’ association as one that represents owners in such a subdivision. Whether your community fits is a question about your recorded documents. Both definitions continue with conditions, including that the restrictions are recorded, limit most of the land to residential use, and require membership in an association with authority to impose assessments. Read the full definitions with your attorney.',
      ],
      quotes: ['txDefSubdivision', 'txDefAssoc'],
    },
    {
      heading: 'Assessments and the governing documents',
      body: [
        'Two more definitions matter when a dispute is about money or rules. An assessment is an amount owed under the dedicatory instrument or by law, and the dedicatory instrument is the set of governing documents.',
      ],
      quotes: ['txDefAssessment', 'txDefDedicatory'],
    },
    {
      heading: 'What the text does not say',
      body: [
        'In the sections we hold, 209.017 does not state a filing fee, a dollar limit, a deadline to sue, a required notice before suing or what remedy a court may give. It does not say that an owner must use the association’s own hearing process first. If any of those points matters, the answer comes from other law and your attorney, not from this page.',
      ],
    },
    {
      heading: 'Reading the sentence closely',
      body: [
        'The right belongs to an owner, and the defendant is the association. The text says an action for a violation of this chapter. It does not say whether a claim based only on the declaration or another rule may also be brought under this section, and we do not infer an answer. A dispute that rests only on the declaration should be raised with your attorney, who can say whether it fits this section or belongs elsewhere.',
        'The venue is a justice court in a precinct where all or part of the subdivision is located. For a large subdivision that can mean more than one precinct, and the text we hold does not rank them.',
      ],
    },
    {
      heading: 'What a board can do with this',
      body: [
        'Treat the section as a reason to follow the chapter’s notice, hearing, payment plan and records rules carefully, since an owner has a local court available to raise a violation. Our guides on violation notices, payment plans and written ballots cover those rules.',
      ],
    },
  ],
  steps: [
    'Confirm from your recorded documents that your community is a residential subdivision under the Chapter 209 definition.',
    'Keep a file for each owner dispute with notices, dates and proof of delivery.',
    'Follow the Chapter 209 notice and hearing steps before any enforcement action.',
    'If you receive a justice court citation, send it to your attorney the same day.',
    'Brief the board on the section so that no one is surprised by a local filing.',
  ],
  faqs: [
    {
      q: 'Can a Texas owner sue the HOA in justice court?',
      a: 'Section 209.017 says an owner may bring an action for a violation of Chapter 209 against the association in justice court of a precinct where the subdivision, or part of it, is located.',
    },
    {
      q: 'Who is an owner under Chapter 209?',
      a: 'Under § 209.002(6), a person who holds record title to property in a residential subdivision, including that person’s personal representative.',
    },
    {
      q: 'Does 209.017 set a deadline or a dollar limit?',
      a: 'Not in the text we hold. Ask your attorney whether other law sets one.',
    },
    {
      q: 'Does the owner have to go through a hearing first?',
      a: 'The text of § 209.017 does not say so. Your attorney can tell you whether another provision applies.',
    },
    {
      q: 'Does this cover condominiums?',
      a: 'This page covers Chapter 209 only and says nothing about other chapters. Ask your attorney which law governs your community.',
    },
  ],
  related: [
    'texas-hoa-violation-notice-and-hearing-209-006',
    'texas-hoa-payment-plans-and-payment-priority',
    'texas-hoa-written-ballots-209-0058',
    'texas-hoa-third-party-collections-notice',
  ],
  hoaDoes: [],
  hoaDoesNot:
    'HomeownerHub does not file or respond to a court case or tell you whether a claim is valid. Your board and your attorney decide that.',
}
