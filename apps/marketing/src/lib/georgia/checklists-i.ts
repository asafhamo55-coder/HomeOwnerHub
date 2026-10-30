// SEO batch 12, two templates.
//
// 1. Proxy and written ballot form fields. Statute text: O.C.G.A. § 14-3-724
//    (proxies) and § 14-3-707 (action without a meeting, by ballot) from
//    ga-ocga-14-3-2026.txt. The fixture's own heading for § 14-3-707 notes it
//    was numbered § 14-3-708 before Ga. L. 2023, SB 148, which is why the
//    ballot guide cites 707. Both sections are the Nonprofit Corporation Code,
//    so they reach an association only if it is a Georgia nonprofit. The one
//    Property Owners' Association Act line used is § 44-3-224(b) (undated
//    proxy is void), already in the quote bank.
// 2. Payment plan agreement fields. No fixture holds a Georgia payment plan
//    rule: the page says so and quotes only the late charge, interest and
//    payment order text that may bear on what the agreement lists. It gives
//    no advice on what a plan may or must contain.
//
// Product claims: the quorum kit's proxy forms and the Payment plans page.

import type { Checklist } from './checklists'

export const PROXY_BALLOT_FORM: Checklist = {
  slug: 'georgia-hoa-proxy-and-written-ballot-form',
  path: '/templates/georgia-hoa-proxy-and-written-ballot-form',
  title: 'Georgia HOA proxy and written ballot form fields',
  metaTitle: 'Georgia HOA proxy and written ballot form',
  description:
    'A free, printable list of the fields a Georgia HOA proxy appointment form and a written ballot should carry, built from O.C.G.A. §§ 14-3-724 and 14-3-707.',
  eyebrow: 'Free template · Print it',
  intro: [
    'Use this when you build a proxy appointment form or a written ballot for a member vote. Each field below is tagged: statute means the quoted Georgia text calls for it, practice means it is our suggestion.',
    'The quoted sections are from Georgia’s Nonprofit Corporation Code, so they reach an association that is a Georgia nonprofit corporation, and your articles or bylaws can prohibit or limit them. The ballot section appears as § 14-3-707 in the text we hold, which notes it was numbered § 14-3-708 before 2023. This is a form guide, not legal advice. Have your attorney read the final forms.',
  ],
  items: [
    { text: 'Check your articles and bylaws first. Proxy voting and ballots without a meeting both give way to them.', detail: 'Both sections open with a condition about the articles or bylaws.', basis: 'statute' },
    { text: 'Proxy field: the name of the member and the lot address.', basis: 'practice' },
    { text: 'Proxy field: the name of the person appointed to vote or act.', basis: 'practice' },
    { text: 'Proxy field: the meeting, by date and type, or the matter the proxy covers.', detail: 'A proxy that is wider than the member meant invites a challenge. Say what it covers.', basis: 'practice' },
    { text: 'Proxy field: the member’s signature, or an electronic transmission that shows the member authorized it.', detail: 'The signer may be the member or the member’s agent or attorney in fact.', basis: 'statute' },
    { text: 'Proxy field: the date the form was signed.', detail: 'For a Property Owners’ Association Act proxy, an undated proxy is void.', basis: 'statute' },
    { text: 'Proxy field: how long the appointment lasts, if different from 11 months.', detail: 'The statute treats the appointment as valid for 11 months unless the form expressly provides a different period.', basis: 'statute' },
    { text: 'Proxy field: any limit on the proxy’s authority, written on the face of the form.', detail: 'The association may accept the proxy’s vote subject to an express limit shown on the form.', basis: 'statute' },
    { text: 'Proxy form: a line saying the member can revoke the appointment.', detail: 'The statute says an appointment is revocable. Voting in person or delivering a signed revocation or a later form revokes it.', basis: 'statute' },
    { text: 'Proxy form: the name and address of the secretary or other officer who receives and tabulates proxies.', detail: 'An appointment takes effect when that person receives the signed form.', basis: 'statute' },
    { text: 'Ballot field: each proposed action is stated in full.', basis: 'statute' },
    { text: 'Ballot field: for a director election, a way to vote for or withhold a vote for each candidate.', basis: 'statute' },
    { text: 'Ballot field: for every other action, a way to vote for or against.', basis: 'statute' },
    { text: 'Ballot instructions: the number of responses needed to meet the quorum requirement.', basis: 'statute' },
    { text: 'Ballot instructions: the percentage of approvals needed for each matter other than electing directors.', basis: 'statute' },
    { text: 'Ballot instructions: the time by which the ballot must be received to count.', detail: 'Give a date, a clock time and the place or address.', basis: 'statute' },
    { text: 'Ballot instructions: that a returned ballot cannot be revoked, unless your articles or bylaws say otherwise.', basis: 'statute' },
    { text: 'The ballot goes to every member entitled to vote on the matter.', basis: 'statute' },
    { text: 'Ballot field: member name or lot, a signature line, and a return method.', detail: 'A secret ballot for a board election should not carry the voter’s name on the part that is counted.', basis: 'practice' },
    { text: 'Keep each proxy and ballot, with the date received, in the meeting file.', basis: 'practice' },
  ],
  letter: {
    heading: 'Proxy appointment (fill-in)',
    intro: 'Fill the blanks in brackets. This sample quotes no law. Have your attorney review it against your articles and bylaws.',
    lines: [
      'PROXY APPOINTMENT FORM, [association name]',
      '',
      'I, [member name], owner of the lot at [lot address], appoint [proxy name] to vote for me and act for me at [meeting type and date], and on the following matters only: [list of matters, or "all matters at that meeting"].',
      '',
      'Limits on this proxy: [none, or write each limit].',
      '',
      'This appointment lasts until [date, or "11 months from the date signed"].',
      '',
      'I may revoke this appointment by attending the meeting and voting in person, or by delivering a signed written revocation or a later appointment form to [secretary or tabulating officer] at [address or email].',
      '',
      'Signed: [signature or electronic signature]    Date signed: [date]',
      'If signing for the member, capacity: [agent or attorney in fact].',
      '',
      'Return to [secretary or tabulating officer] at [address or email] by [deadline].',
    ],
  },
  quotes: ['proxyOptional', 'proxyElectronic', 'proxySign', 'proxyEffective', 'proxy11', 'proxyRevocable', 'proxyRevokeVote', 'proxyFace', 'proxyVoid', 'ballotAction', 'ballotContents', 'ballotEach', 'ballotDirector', 'ballotForAgainst', 'ballotSolicitIntro', 'ballotSolicit1', 'ballotSolicit2', 'ballotSolicit3', 'ballotQuorum', 'ballotNoRevoke'],
  quotesHeading: 'The statute text behind these fields',
  faqs: [
    {
      q: 'Is a proxy valid if the member signs it electronically?',
      a: 'The Nonprofit Code text we hold allows a member, or the member’s agent or attorney in fact, to sign an appointment form personally or by an electronic transmission, which must carry information showing the member authorized it.',
    },
    {
      q: 'How long does a Georgia proxy last?',
      a: 'The text we hold says an appointment is valid for 11 months unless the appointment form expressly provides a different period.',
    },
    {
      q: 'What must a written ballot say?',
      a: 'It must set forth each proposed action, let members vote for or withhold a vote for each director candidate, and let them vote for or against every other proposed action. The solicitation must also state the responses needed for quorum, the approval percentage and the deadline. See the quotes above.',
    },
    {
      q: 'Does this apply if our association is not a nonprofit corporation?',
      a: 'The Nonprofit Corporation Code sections quoted here apply to nonprofit corporations. Ask your attorney which law governs your association and whether your bylaws set their own rules.',
    },
    {
      q: 'Is this a required form?',
      a: 'No. The statute text we hold does not supply a form. This is a working list of fields for a volunteer board. Have your attorney review the final version.',
    },
  ],
  related: ['georgia-hoa-written-ballots-without-a-meeting', 'annual-meeting-quorum-proxies', 'annual-meeting-notice-checklist', 'hoa-board-meeting-minutes'],
  datePublished: '2026-10-31',
  dateModified: '2026-10-31',
  howTo: true,
  hoaDoes: [
    {
      text: 'The annual meeting kit has a live quorum counter, proxy tracking, a list of homes with no proxy yet, a printable sign-in sheet and printable proxy forms. Nothing is sent to residents.',
      route: '/meetings/[id]/quorum',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
    {
      text: 'For Georgia, the kit shows a proxy form written to Georgia’s rules. Have your attorney read the form once.',
      route: '/meetings/[id]/quorum/proxies',
      release: '2026-10-21-2255-dues-rates-late-fees-georgia',
    },
    {
      text: 'The election planner works back from the meeting date and prints ballots that never name the voter, envelope labels and a tellers’ tally sheet for a paper board election.',
      route: '/meetings/[id]/election',
      release: '2026-10-21-1930-elections-compliance',
    },
  ],
}

export const PAYMENT_PLAN_AGREEMENT: Checklist = {
  slug: 'georgia-hoa-payment-plan-agreement',
  path: '/templates/georgia-hoa-payment-plan-agreement',
  title: 'Georgia HOA payment plan agreement fields',
  metaTitle: 'Georgia HOA payment plan agreement template',
  description:
    'A free, printable list of fields for a written HOA payment plan agreement, with the Georgia late charge, interest and payment order text that may apply.',
  eyebrow: 'Free template · Print it',
  intro: [
    'Use this when the board and an owner agree on a schedule for paying a past-due balance. It lists the fields a written agreement usually has, so nothing is left to memory. Every field is tagged practice, because the Georgia text we hold does not describe payment plans.',
    'This is not legal advice, and it does not say what a plan may or must contain, whether the board has to offer one, or what a plan does to your lien or your collection steps. Those answers depend on your documents and the facts, so have your attorney review the agreement before you use it. The Georgia text quoted below is limited to late charges, interest and the order a payment is applied, because those may affect the figures you write in.',
  ],
  items: [
    { text: 'Read your declaration and any board policy on payment plans first.', detail: 'Check whether they say anything about who may approve a plan, and about late charges while a plan runs.', basis: 'practice' },
    { text: 'Field: the owner’s name, the lot address and the association’s name.', basis: 'practice' },
    { text: 'Field: the balance on the date of the agreement, with each charge listed by type and amount.', detail: 'Pull the figures from the ledger. List regular assessments, special assessments, late charges, interest, fines and fees on separate lines.', basis: 'practice' },
    { text: 'Field: which of those charges the plan covers.', basis: 'practice' },
    { text: 'Field: the number of installments, the amount of each and the due date of each.', detail: 'Add the installments up and make sure they match the balance the plan covers.', basis: 'practice' },
    { text: 'Field: how the owner pays, and where.', detail: 'Name the method and the address, portal or account the payment goes to.', basis: 'practice' },
    { text: 'Field: whether new regular assessments that come due during the plan are paid on time in addition to the installments.', detail: 'Write the answer your attorney gives you.', basis: 'practice' },
    { text: 'Field: whether late charges and interest continue to be added while the plan runs, and at what rate.', detail: 'The Georgia text allows them only to the extent the instrument provides, within a stated limit. See the quotes below, then check your documents.', basis: 'practice' },
    { text: 'Field: the order the association applies each payment.', detail: 'From January 1, 2027, Georgia ranks the order payments must be applied. See the quote below.', basis: 'practice' },
    { text: 'Field: what happens if an installment is missed, and who the owner contacts first.', detail: 'Write the board’s policy and have your attorney review it.', basis: 'practice' },
    { text: 'Field: what the association will and will not do while the owner is on the plan.', detail: 'Do not promise anything your attorney has not approved.', basis: 'practice' },
    { text: 'Field: signature lines and dates for the owner and for the board’s authorized signer.', basis: 'practice' },
    { text: 'Field: the date the board approved the plan, and the minutes entry that records it.', basis: 'practice' },
    { text: 'Give the owner a signed copy, and save the original with the account.', basis: 'practice' },
    { text: 'Enter the plan in the ledger and calendar each installment date.', basis: 'practice' },
  ],
  letter: {
    heading: 'Payment plan agreement (fill-in)',
    intro: 'Fill the blanks in brackets. This sample quotes no law and makes no promise on the association’s behalf. Have your attorney review it before it is used.',
    lines: [
      'PAYMENT PLAN AGREEMENT, [association name]',
      '',
      'Owner: [owner name]    Lot: [lot address]    Date: [date]',
      '',
      'Balance covered by this plan as of [date]: $[total]. This is made up of: [charge type and amount], [charge type and amount], [charge type and amount].',
      '',
      'The owner will pay [number] installments of $[amount], due on [date], [date], [date and so on], by [payment method and place].',
      '',
      'Regular assessments that come due during the plan: [how they are to be paid].',
      '',
      'Late charges and interest during the plan: [what applies, as your documents provide].',
      '',
      'Payments are applied in this order: [order of application].',
      '',
      'If an installment is not paid by [date]: [what happens, as your attorney has approved].',
      '',
      'Owner signature: [signature]    Date: [date]',
      'Association signature: [name and office]    Date: [date]',
      'Approved by the board on: [date]',
    ],
  },
  quotes: ['lateIntro', 'lateCharge', 'interest', 'payOrderIntro', 'payOrder1', 'payOrder2', 'payOrder3', 'payOrder4', 'actEffective'],
  quotesHeading: 'Georgia text that may bear on the figures',
  faqs: [
    {
      q: 'Does Georgia law require an HOA to offer a payment plan?',
      a: 'The Georgia text we hold, including the Property Owners’ Association Act and SB 406, contains no payment plan rule. Ask your attorney. Texas is different: see our guide to Texas payment plans.',
    },
    {
      q: 'Can the association keep charging late fees while a plan runs?',
      a: 'The quoted text lets late charges and interest be part of the lien only to the extent the instrument provides, up to the stated limits. Whether they run during a plan is a question for your documents and your attorney.',
    },
    {
      q: 'In what order are plan payments applied?',
      a: 'From January 1, 2027, SB 406 ranks the order in which all funds an owner remits are applied. See the quote above, and our payment order guide.',
    },
    {
      q: 'Does signing a plan affect the lien or a foreclosure?',
      a: 'This page does not say. Ask your attorney before you sign, and before you change any collection step.',
    },
    {
      q: 'Is this a required form?',
      a: 'No. No law we hold supplies a form. This is a working list of fields for a volunteer board. Your attorney should review the final agreement.',
    },
  ],
  related: ['georgia-hoa-payment-order-sb-406', 'late-fee-limits', 'attorney-fee-notice-checklist', 'texas-hoa-payment-plans-and-payment-priority'],
  datePublished: '2026-10-31',
  dateModified: '2026-10-31',
  howTo: true,
  hoaDoes: [
    {
      text: 'Accounting has a Payment plans page. A plan moves to Completed on its own when every installment is paid, waived or written off, and the board can see which plans are behind.',
      route: '/accounting/payment-plans',
      release: '2026-10-18-0810-plans-recurring-vendors',
    },
    {
      text: 'The property page shows the same plan status in a payment plan tile, so the board sees it next to the owner’s balance.',
      route: '/properties/[id]',
      release: '2026-10-18-0810-plans-recurring-vendors',
    },
  ],
}
