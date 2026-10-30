// SEO batch 13, two state templates.
//
// 1. Texas payment plan agreement fields. Statute text: Tex. Prop. Code
//    § 209.0062 (alternative payment schedule) and § 209.0063 (order payments
//    are applied), from tx-prop-209-0062-2026.txt, through the txPlan* and
//    txPrio* quotes already in state-quotes.ts. The page is a field list and
//    a fill-in sample, not a required form. Product claims are limited to the
//    generic Payment plans page and the Texas collections letter, which are
//    what the Texas payment plans guide already says. Texas coverage in
//    STATE_COVERAGE is the resale certificate and collections letters only,
//    so nothing here claims plan checking or payment ordering for Texas.
// 2. Florida fine hearing notice fields. Statute text: Fla. Stat.
//    § 720.305(2) from flsenate-ch720-2026.html, through the flHearing*
//    quotes. Product claim: Florida fine hearings in STATE_COVERAGE.

import type { Checklist } from './checklists'

export const TX_PAYMENT_PLAN_AGREEMENT: Checklist = {
  slug: 'texas-hoa-payment-plan-agreement',
  path: '/templates/texas-hoa-payment-plan-agreement',
  title: 'Texas HOA payment plan agreement fields',
  metaTitle: 'Texas HOA payment plan agreement template',
  description:
    'A free, printable list of fields for a written Texas HOA payment plan agreement, built from Tex. Prop. Code 209.0062 and the 209.0063 payment order. No sign-up.',
  eyebrow: 'Free template · Print it',
  intro: [
    'Use this when the board and an owner agree on an alternative payment schedule for a past-due balance. Each field below is tagged: statute means the quoted Texas text bears on it, practice means it is our suggestion.',
    'Section 209.0062 applies to an association composed of more than 14 lots, and it asks the board to adopt guidelines first. This page is a field list for one written agreement, not those guidelines. It is not legal advice, and it does not decide how a plan fits your dedicatory instruments or your collection steps. Have your attorney review the agreement.',
  ],
  items: [
    { text: 'Count your lots. The guideline duty applies to an association composed of more than 14 lots.', basis: 'statute' },
    { text: 'Read your adopted payment plan guidelines, and confirm they are filed in the real property records of each county.', detail: 'The statute requires the filing. A missed filing does not take away the owner’s right to a schedule.', basis: 'statute' },
    { text: 'Field: the owner’s name, the lot address and the association’s name.', basis: 'practice' },
    { text: 'Field: the date of the owner’s request for a plan.', detail: 'The 18-month limit counts from this date.', basis: 'statute' },
    { text: 'Field: the balance on the date of the agreement, with each charge listed by type and amount.', detail: 'Pull the figures from the ledger. List assessments, attorney’s fees or collection costs, fines and other charges on separate lines.', basis: 'practice' },
    { text: 'Field: the number of installments, the amount of each and the due date of each.', detail: 'The minimum term the statute sets is three months. Add the installments up and check them against the balance.', basis: 'statute' },
    { text: 'Check the end date against the 18-month limit.', detail: 'The association is not required to allow a plan that runs more than 18 months from the date of the request. It may choose to.', basis: 'statute' },
    { text: 'Field: what is charged while the plan runs.', detail: 'The statute says additional monetary penalties do not accrue, and it separates out reasonable costs of administering the plan and interest. Write what your guidelines say and have your attorney read it.', basis: 'statute' },
    { text: 'Field: how the owner pays, and where.', detail: 'Name the method and the address, portal or account.', basis: 'practice' },
    { text: 'Field: whether new regular assessments that come due during the plan are paid on time in addition to the installments.', basis: 'practice' },
    { text: 'Field: the order each payment is applied.', detail: 'Section 209.0063 ranks assessments, then fees and costs, then fines. Copy the order from the quote below, then ask your attorney how it works with the plan.', basis: 'statute' },
    { text: 'Check whether the owner defaulted on an earlier plan in the past two years, or asked for a plan more than once in 12 months.', detail: 'The statute says the association is not required to enter a plan in those cases.', basis: 'statute' },
    { text: 'Check that the cure period in the delinquency notice has not already run.', detail: 'The statute says the association is not required to offer a plan after the § 209.0064(b)(3) cure period expires.', basis: 'statute' },
    { text: 'Field: what happens if an installment is missed, and who the owner contacts first.', detail: 'Write the board’s policy and have your attorney review it.', basis: 'practice' },
    { text: 'Field: signature lines and dates for the owner and the board’s authorized signer.', basis: 'practice' },
    { text: 'Field: the date the board approved the plan, and the minutes entry that records it.', basis: 'practice' },
    { text: 'Give the owner a signed copy, save the original with the account, and calendar each installment date.', basis: 'practice' },
  ],
  letter: {
    heading: 'Payment plan agreement (fill-in)',
    intro: 'Fill the blanks in brackets. This sample quotes no law and makes no promise on the association’s behalf. Have your attorney review it before it is used.',
    lines: [
      'PAYMENT PLAN AGREEMENT, [association name]',
      '',
      'Owner: [owner name]    Lot: [lot address]    Date of request: [date]    Date of agreement: [date]',
      '',
      'Balance covered by this plan as of [date]: $[total]. This is made up of: [charge type and amount], [charge type and amount], [charge type and amount].',
      '',
      'The owner will pay [number] installments of $[amount], due on [date], [date], [date and so on], by [payment method and place]. The last installment is due on [date].',
      '',
      'Charges while the plan runs: [what applies, as the association’s guidelines provide].',
      '',
      'Regular assessments that come due during the plan: [how they are to be paid].',
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
  quotes: ['txPlanAdopt', 'txPlanPenalty', 'txPlanMinTerm', 'txPlanMax', 'txPlanOnce', 'txPlanDefault', 'txPlanCure', 'txPlanFile', 'txPlanNoFile', 'txPrioIntro', 'txPrio1', 'txPrio2', 'txPrio3', 'txPrio4', 'txPrio5', 'txPrio6'],
  quotesHeading: 'The Texas text behind these fields',
  faqs: [
    {
      q: 'Does a Texas HOA have to offer payment plans?',
      a: 'An association composed of more than 14 lots must adopt guidelines for an alternative payment schedule under § 209.0062. Smaller associations should ask their attorney. The quotes above show the exceptions the statute allows.',
    },
    {
      q: 'How long must a plan run?',
      a: 'The statute sets a minimum term of three months. The association is not required to allow a plan that extends more than 18 months from the date of the owner’s request.',
    },
    {
      q: 'Can the association add fines while a plan runs?',
      a: 'The statute says an owner on the schedule makes partial payments without accruing additional monetary penalties. It excludes reasonable costs of administering the plan and interest from that term. See the quote above and ask your attorney about your charges.',
    },
    {
      q: 'In what order are plan payments applied?',
      a: 'Section 209.0063 ranks delinquent assessments first, then current assessments, then fees and costs, with fines near the end. See the quotes above.',
    },
    {
      q: 'Is this a required form?',
      a: 'No. The statute text we hold does not supply a form. This is a working list of fields for a volunteer board. Have your attorney review the final agreement.',
    },
  ],
  related: ['texas-hoa-payment-plans-and-payment-priority', 'georgia-hoa-payment-plan-agreement', 'texas-hoa-management-certificate', 'apply-hoa-credit-to-owner-balance-checklist'],
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
      text: 'For Texas, the collections letter is the delinquency notice under § 209.0064, with at least 45 days to cure and payment-plan options. It waits in Approvals, and nothing is emailed.',
      route: '/properties/[id]/collections-letter',
      release: '2026-10-19-1759-collections-letters',
    },
  ],
}

export const FL_FINE_HEARING_NOTICE: Checklist = {
  slug: 'florida-hoa-fine-hearing-notice',
  path: '/templates/florida-hoa-fine-hearing-notice',
  title: 'Florida HOA fine hearing notice fields',
  metaTitle: 'Florida HOA fine hearing notice template',
  description:
    'A free, printable checklist and fill-in notice for the hearing notice Florida requires before an HOA fine or suspension, from Fla. Stat. 720.305(2).',
  eyebrow: 'Free template · Print it',
  intro: [
    'Use this when the board proposes a fine or suspension and has to give the owner notice of the right to a hearing. Each field below is tagged: statute means the quoted Florida text calls for it, practice means it is our suggestion.',
    'The quoted text is Fla. Stat. § 720.305(2). It is not legal advice, and it does not show how your declaration limits fines. Your documents can add steps, and your attorney should read the final notice.',
  ],
  items: [
    { text: 'Confirm your governing documents authorize this fine or suspension before the notice goes out.', basis: 'practice' },
    { text: 'Notice goes out at least 14 days before the hearing date.', detail: 'The statute says the board may not impose a fine or suspension unless it first gives at least 14 days’ written notice of the right to a hearing.', basis: 'statute' },
    { text: 'Address it to the owner at the mailing or e-mail address in the association’s official records.', detail: 'Use the designated address on file, not one you found elsewhere.', basis: 'statute' },
    { text: 'If the violation involves an occupant, licensee or invitee, send the notice to that person too.', basis: 'statute' },
    { text: 'The notice describes the alleged violation.', detail: 'Name the rule, the date or dates, and what was seen.', basis: 'statute' },
    { text: 'The notice states the specific action required to cure, if there is one.', basis: 'statute' },
    { text: 'The notice gives the hearing date and location.', basis: 'statute' },
    { text: 'If the hearing can be held by telephone or other electronic means, the notice gives the access information.', detail: 'The owner has a right to attend by telephone or other electronic means.', basis: 'statute' },
    { text: 'The hearing is set within 90 days after the notice is issued.', basis: 'statute' },
    { text: 'The hearing is before a committee of at least three members appointed by the board.', detail: 'None may be an officer, director or employee, or a spouse, parent, child, brother or sister of one.', basis: 'statute' },
    { text: 'Write down each committee member’s name and why none of the ties above apply.', basis: 'practice' },
    { text: 'Keep proof of how and when the notice was sent, with a copy of what was sent.', basis: 'practice' },
    { text: 'After the hearing, the committee decides by majority vote. A proposed fine or suspension it does not approve cannot be imposed.', basis: 'statute' },
    { text: 'The committee sends written findings to the owner within 7 days after the hearing.', detail: 'They state what was approved or rejected and how to cure, serve the suspension or pay by the date.', basis: 'statute' },
    { text: 'If the violation was cured before the hearing, or as the notice allows, no fine or suspension is imposed.', basis: 'statute' },
    { text: 'If a fine is approved and not cured, the committee sets a payment date at least 30 days after delivery of its findings.', basis: 'statute' },
  ],
  letter: {
    heading: 'Notice of right to a hearing (fill-in)',
    intro: 'Fill the blanks in brackets. This sample quotes no law. Have your attorney review it against your governing documents before it is sent.',
    lines: [
      '[Association name]',
      '[Date of notice]',
      '',
      'To: [owner name] and, if applicable, [occupant, licensee or invitee name]',
      'Sent to: [mailing or e-mail address in the official records]',
      'Lot: [lot address]',
      '',
      'NOTICE OF RIGHT TO A HEARING BEFORE A FINE OR SUSPENSION',
      '',
      'The board proposes to impose [fine of $[amount] / suspension of [privilege] for [period]] for the following alleged violation: [description of the violation, the rule and the date or dates].',
      '',
      'To cure the violation, [the specific action required, or "no cure is available"]. Cure by [date].',
      '',
      'You have the right to a hearing before a committee of at least three members who are not officers, directors or employees of the association or relatives of them.',
      '',
      'Hearing date and time: [date and time]',
      'Location: [address, room]',
      'You may also attend by telephone or other electronic means: [dial-in or link and access information].',
      '',
      'Questions: [name, office, phone, e-mail]',
    ],
  },
  quotes: ['flHearingNotice', 'flHearingContents', 'flHearingPanel', 'flHearingVote', 'flHearingFindings', 'flHearingCured', 'flHearingPayDate'],
  quotesHeading: 'The Florida text behind these fields',
  faqs: [
    {
      q: 'How much notice must a Florida HOA give before a fine hearing?',
      a: 'At least 14 days’ written notice of the owner’s right to a hearing, sent to the address in the association’s official records. See the quote above.',
    },
    {
      q: 'Who sits on the hearing committee?',
      a: 'At least three members appointed by the board who are not officers, directors or employees of the association, or a spouse, parent, child, brother or sister of one.',
    },
    {
      q: 'What must the notice say?',
      a: 'A description of the alleged violation, the specific action required to cure it if applicable, and the hearing date, location and access information if held by telephone or other electronic means.',
    },
    {
      q: 'What if the owner fixes the problem before the hearing?',
      a: 'The statute says that if a violation is cured before the hearing, or in the manner the notice specifies, a fine or suspension may not be imposed.',
    },
    {
      q: 'Is this a required form?',
      a: 'No. The statute text we hold does not supply a form. This is a working list of fields for a volunteer board. Have your attorney review the final notice.',
    },
  ],
  related: ['florida-hoa-fine-hearing-committee', 'violation-notice-checklist', 'hoa-violation-letter-georgia', 'california-hoa-fine-hearing-and-penalty-rules'],
  datePublished: '2026-10-31',
  dateModified: '2026-10-31',
  howTo: true,
  hoaDoes: [
    {
      text: 'In Florida, a violation can only move to Fined once the hearing record shows the notice sent in time, the hearing held, and the outcome recorded. The panel needs at least three people who are not on the board.',
      route: '/violations/[id]',
      release: '2026-10-21-1130-budget-hearings-directors',
    },
    {
      text: 'If a panel member’s name matches a board member’s, the app flags it. It cannot check relatives, and the page says so. The only override is "Attorney advised", and it is recorded.',
      route: '/violations/[id]',
      release: '2026-10-21-1130-budget-hearings-directors',
    },
  ],
}
