// SEO batch 9: the first Florida, Texas and California guides. Statute text
// only through the quote bank (state-quotes.ts, checked word for word against
// the fixtures). Product claims only with an apps/hoa route and a release note
// that exist, and only what STATE_COVERAGE in state-law.ts lists.
//
// Fixture limits, stated on the pages: the Florida fixture is Chapter 720
// (homeowners' associations), so condominium rules (Chapter 718) are not
// described. The California text is the AB 130 version of §§ 5850 and 5855
// (effective June 30, 2025), checked in docs/research/2026-10-ca-rules-verification.md.
// The Texas fixture holds §§ 209.0062 and 209.0063; § 209.0064 is cited only
// where § 209.0062 itself names it.

import type { Guide } from './types'

const PUBLISHED = '2026-10-31'

export const FL_FINE_HEARING: Guide = {
  slug: 'florida-hoa-fine-hearing-committee',
  path: '/guides/florida-hoa-fine-hearing-committee',
  state: 'FL',
  title: 'Florida HOA fine hearings: the 14-day notice and the committee',
  metaTitle: 'Florida HOA fine hearing rules',
  description:
    'A Florida HOA board cannot fine an owner without a committee hearing. The 14-day notice, the panel, the vote and the deadlines, in the statute’s words.',
  eyebrow: 'Florida · Fines',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'In a Florida homeowners’ association, the board proposes a fine, but it cannot impose one on its own. Section 720.305(2) sends the proposal to a hearing before a committee.',
    'The owner gets at least 14 days’ written notice. The hearing is held within 90 days of the notice. The committee has at least three members who are not officers, directors or employees, or close relatives of one.',
    'If the committee does not approve the fine by majority vote, it cannot be imposed. If the owner cures the violation first, there is no fine.',
    'This is a plain-language guide to Chapter 720, not legal advice. Condominiums fall under a different chapter that this page does not cover.',
  ],
  sections: [
    {
      heading: 'Who decides: the board proposes, a committee confirms',
      body: [
        'Most volunteer boards expect to vote on a fine themselves. In Florida they do not get the last word. The board levies the fine, and a separate committee then decides whether to confirm it. The committee’s job is narrow. It does not rewrite the rules or reconsider the board’s policy. It confirms or rejects what the board proposed.',
        'That split matters for how you run the process. The people who sat in the board meeting that proposed the fine cannot be the ones who approve it.',
      ],
      quotes: ['flHearingVote'],
    },
    {
      heading: 'The notice an owner must receive first',
      body: [
        'The clock starts with a written notice of the owner’s right to a hearing. The statute sets the lead time and says where the notice goes: the mailing or e-mail address in the association’s official records. If a tenant, guest or invitee is the one to be fined, the notice goes to them too. It must describe the violation, say what cures it, and give the hearing date, place and any phone access.',
      ],
      quotes: ['flHearingNotice'],
    },
    {
      heading: 'The panel and the 90-day window',
      body: [
        'The hearing must happen within 90 days after the notice is issued. The committee needs at least three members, appointed by the board. None of them may be an officer, director or employee of the association, and none may be the spouse, parent, child, brother or sister of one.',
        'In a small community this is the hard part. Finding three owners with no tie to the board takes some asking around. Start before the first violation notice goes out, not after.',
      ],
      quotes: ['flHearingPanel'],
    },
    {
      heading: 'After the hearing: findings, cure and the payment date',
      body: [
        'The committee has seven days after the hearing to tell the owner in writing what it decided. The notice must say which fines or suspensions it approved or rejected and how the owner can cure or fulfill them.',
        'A fine is not due the next day. If the committee approves it and the violation is still not cured, the committee sets a payment date. The statute puts a floor under that date, and it keeps attorney’s fees off the owner for anything the board did before that date.',
      ],
      quotes: ['flHearingFindings', 'flHearingPayDate', 'flHearingCured'],
    },
    {
      heading: 'Amounts and limits',
      body: [
        'The default cap is $100 per violation, unless the governing documents say otherwise. For a violation that continues, the board can levy a fine for each day with a single notice and hearing, up to an aggregate cap. A fine below $1,000 cannot become a lien on the parcel.',
        'A suspension of common-area use is a different remedy with its own limits. It can never block the owner’s way in and out of the home.',
      ],
      quotes: ['flFineCap', 'flFineSuspend'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold the text of Chapter 720 only. We cannot tell you how your declaration limits fines, whether your documents set a higher cap, or how your committee should be appointed. Read your documents first. Ask your attorney before you fine anyone for the first time.',
        'The statute also covers suspensions for being more than 90 days delinquent, which do not need this hearing. That is a separate path.',
      ],
    },
  ],
  steps: [
    'Confirm your declaration authorizes fines, and note the amount and any cap in the governing documents.',
    'Appoint a committee of at least three members who are not officers, directors, employees, or their close relatives.',
    'Send the written hearing notice at least 14 days ahead, with the violation, the cure, and the hearing date, place and access details.',
    'Hold the hearing within 90 days of the notice, and let the owner attend in person or by phone.',
    'Record the committee’s majority vote. If it does not approve the fine, stop.',
    'Send the written findings within 7 days of the hearing, with how to cure and, if a fine stands, the payment date.',
    'Set the payment date at least 30 days after the findings are delivered.',
  ],
  faqs: [
    {
      q: 'Can the Florida board vote to fine an owner at a regular meeting?',
      a: 'The board can propose the fine. Under § 720.305(2) the fine or suspension cannot be imposed unless the notice and committee hearing steps are followed first.',
    },
    {
      q: 'Who can sit on the committee?',
      a: 'At least three members the board appoints, none of whom is an officer, director or employee, or the spouse, parent, child, brother or sister of one.',
    },
    {
      q: 'What if the owner fixes the problem before the hearing?',
      a: 'The statute says a fine or suspension may not be imposed when the violation has been cured before the hearing or in the manner the written notice specified.',
    },
    {
      q: 'Does the hearing apply to a suspension for unpaid assessments?',
      a: 'The statute says the notice and hearing steps do not apply to a suspension imposed for being more than 90 days delinquent. Check the full text and your documents.',
    },
    {
      q: 'Does this apply to a Florida condominium?',
      a: 'This page covers Chapter 720 only. Condominiums are governed by a different chapter, so ask your attorney.',
    },
  ],
  related: ['fines-and-violation-hearings', 'violation-notice-checklist', 'ai-hoa-violation-letters-board-approval', 'florida-hoa-estoppel-certificate-rules', 'florida-hoa-fine-hearing-notice'],
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
    {
      text: 'A State law check panel appears when a violation moves to Fined. For Florida it lists a fine over $100 per violation (unless your documents allow more), and you can only go ahead by recording a reason.',
      route: '/violations/[id]',
      release: '2026-10-20-1935-law-check-opening-balances',
    },
  ],
}

export const FL_ESTOPPEL: Guide = {
  slug: 'florida-hoa-estoppel-certificate-rules',
  path: '/guides/florida-hoa-estoppel-certificate-rules',
  state: 'FL',
  title: 'Florida HOA estoppel certificates: deadline, fees and validity',
  metaTitle: 'Florida HOA estoppel certificate rules',
  description:
    'A Florida HOA must issue an estoppel certificate within 10 business days. The deadline, fee limits, 30 and 35 day validity, and the cost of being late.',
  eyebrow: 'Florida · Home sales',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'When a Florida parcel is sold or refinanced, the title company asks the association for an estoppel certificate. Section 720.30851 gives the board 10 business days to issue it.',
    'Miss the deadline and the association cannot charge for that certificate. Get it wrong and the association cannot collect more than the certificate states from someone who relied on it in good faith.',
    'The base fee cap is $250, with add-ons for a rush and for a delinquent account. The statute adjusts those amounts every five years.',
    'This is a plain-language guide, not legal advice. Your attorney and the state’s published figures decide what you can charge today.',
  ],
  sections: [
    {
      heading: 'What an estoppel certificate is for',
      body: [
        'A buyer or lender wants to know what the home owes the association on the day of closing. The certificate is the association’s written answer: the regular assessment, what has been paid, anything past due, and a short list of yes or no questions about violations, transfer approval and rights of first refusal.',
        'The statute prints the form and says the certificate must be substantially in that form. A board member, an authorized agent or a management company employee may complete it.',
      ],
    },
    {
      heading: 'The deadline and how to deliver it',
      body: [
        'The clock is business days, counted from the written or electronic request. The request can come from the owner, the mortgagee, or either one’s designee. The association must also name, on its website, where a request should be sent.',
      ],
      quotes: ['flEstopIssue', 'flEstopWebsite', 'flEstopDelivery'],
    },
    {
      heading: 'How long it is good for',
      body: [
        'The certificate has a limited life, and the length depends on how it is sent. If the association learns of a mistake or new information during that period, it can send an amended certificate. The amended one starts a new period and costs nothing.',
      ],
      quotes: ['flEstopEffective', 'flEstopAmended'],
    },
    {
      heading: 'What the fee can be',
      body: [
        'A reasonable fee is allowed, up to a cap. The base cap applies when the account is clean on the issue date. A rush adds a set amount, and a delinquent account adds another, capped separately.',
        'There is one more condition that boards miss. The right to charge at all has to come from a written board resolution or a written management, bookkeeping or maintenance contract.',
      ],
      quotes: ['flEstopFee', 'flEstopFeeExtra', 'flEstopAuthority'],
    },
    {
      heading: 'Late, wrong, or ignored: the consequences',
      body: [
        'Lateness costs the fee. Errors cost more: a buyer or lender who relied on the certificate in good faith can hold the association to the numbers on it. Anyone can also bring a summary proceeding to force compliance, and the winner recovers attorney’s fees.',
      ],
      quotes: ['flEstopLate', 'flEstopReliance', 'flEstopSuit'],
    },
    {
      heading: 'The dollar amounts move',
      body: [
        'The $250, $100 and $150 figures are the statute’s base amounts. The statute adjusts them every five years for inflation, and the state’s Department of Business and Professional Regulation publishes the adjusted figures. Check that page before you charge the full cap.',
      ],
      quotes: ['flEstopCpi'],
    },
  ],
  steps: [
    'Name a person and an address for estoppel requests, and publish them on the association’s website.',
    'Log the date and time each written or electronic request arrives, and count 10 business days from there.',
    'Check that a board resolution or a written contract allows you to charge a fee.',
    'Complete the statute’s form from the home’s account. Leave nothing blank that the form asks for.',
    'Work out the fee: the base amount, plus the rush or delinquency add-on only if each applies. Check the current adjusted limits.',
    'Deliver by hand, regular mail or e-mail on the date of issuance, and note the effective period.',
    'If you find a mistake inside the period, issue an amended certificate with no fee.',
  ],
  faqs: [
    {
      q: 'How long does a Florida HOA have to issue an estoppel certificate?',
      a: 'Within 10 business days after receiving a written or electronic request, under § 720.30851. See the quote above.',
    },
    {
      q: 'Can the association charge if it is late?',
      a: 'No. The statute says a fee may not be charged for that certificate if it is not delivered within 10 business days.',
    },
    {
      q: 'What is the most an HOA can charge?',
      a: 'The statute’s base figures are $250, plus $100 for delivery within 3 business days, plus up to $150 if the account is delinquent. Those amounts are adjusted every five years, so check the state’s current figures.',
    },
    {
      q: 'How long is the certificate valid?',
      a: '30 days if hand delivered or sent electronically, and 35 days if sent by regular mail.',
    },
    {
      q: 'Does Georgia have a Florida-style estoppel statute?',
      a: 'The Georgia text we hold has a statement of amounts due with a five-business-day deadline. It is a different rule with a different consequence.',
    },
  ],
  related: ['florida-hoa-fine-hearing-committee', 'georgia-hoa-assessment-lien-rules', 'hoa-treasurer-duties', 'overpayments-credits'],
  hoaDoes: [
    {
      text: 'On a property, the board can prepare an estoppel certificate filled in from the home’s account: the balance, the regular assessment and paid-through date, special assessments, and any payment plan.',
      route: '/properties/[id]/estoppel',
      release: '2026-10-19-1539-estoppel',
    },
    {
      text: 'For Florida it shows the 10-business-day deadline, the 30 or 35 day validity, and the fee limits, with a reminder to check the state’s current inflation-adjusted amounts.',
      route: '/properties/[id]/estoppel',
      release: '2026-10-19-1539-estoppel',
    },
    {
      text: 'The certificate lists only violations that were formally noticed to the owner. A violation without a recorded notice shows on screen as "board to verify" and is never printed.',
      route: '/properties/[id]/estoppel',
      release: '2026-10-20-2205-estoppel-and-ui-fixes',
    },
    {
      text: 'You cannot print until every blank is filled and you tick that you have verified the figures. Nothing is emailed, and each certificate prepared or printed is recorded in the activity log.',
      route: '/properties/[id]/estoppel',
      release: '2026-10-19-1539-estoppel',
    },
  ],
}

export const TX_PAYMENT_PLANS: Guide = {
  slug: 'texas-hoa-payment-plans-and-payment-priority',
  path: '/guides/texas-hoa-payment-plans-and-payment-priority',
  state: 'TX',
  title: 'Texas HOA payment plans and the order payments are applied',
  metaTitle: 'Texas HOA payment plans and payment priority',
  description:
    'Texas Property Code 209.0062 requires many HOAs to offer payment plans, and 209.0063 ranks which debt a payment pays first. The rules in the statute’s words.',
  eyebrow: 'Texas · Collections',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'A Texas property owners’ association with more than 14 lots must adopt guidelines for an alternative payment schedule, so an owner who is behind can pay in parts without piling on penalties.',
    'The plan has a three-month minimum. The statute then lists cases where the association does not have to offer one: a very long plan, a recent default, an owner past the cure period, or a second plan in 12 months.',
    'Section 209.0063 sets the order a payment is applied: assessments first, then fees and costs, then fines. A default under a plan changes that.',
    'This is a plain-language guide to two sections, not legal advice. Your attorney should review the guidelines before the board adopts and files them.',
  ],
  sections: [
    {
      heading: 'What the statute requires the board to adopt',
      body: [
        'The duty falls on an association composed of more than 14 lots. It has to adopt reasonable guidelines for an alternative payment schedule. The point of the schedule is that the owner pays partial amounts without accruing additional monetary penalties.',
        'The statute defines that phrase narrowly. Reasonable costs of administering the plan, and interest, do not count as monetary penalties. So a plan can carry both.',
      ],
      quotes: ['txPlanAdopt', 'txPlanPenalty'],
    },
    {
      heading: 'Minimum term and when you can say no',
      body: [
        'A plan the association offers has to run at least three months. The statute then lists four situations where the association is not required to offer or allow one. Read them as limits on the duty, not as rules you must apply. A board can still choose to be more flexible, as long as it treats owners alike.',
      ],
      quotes: ['txPlanMinTerm', 'txPlanMax', 'txPlanDefault', 'txPlanCure', 'txPlanOnce'],
    },
    {
      heading: 'File the guidelines in the county records',
      body: [
        'The guidelines go in the real property records of each county where the subdivision sits. A missed filing is not an excuse to refuse a plan. The statute says an owner can still receive one.',
      ],
      quotes: ['txPlanFile', 'txPlanNoFile'],
    },
    {
      heading: 'Which debt a payment pays first',
      body: [
        'Section 209.0063 ranks how the association applies money the owner sends. Unpaid assessments come before current ones, and both come before attorney’s fees, collection costs and fines. Fines rank fifth of six, so a payment cannot clear a fine while assessments are still unpaid.',
      ],
      quotes: ['txPrioIntro', 'txPrio1', 'txPrio2', 'txPrio3', 'txPrio4', 'txPrio5', 'txPrio6'],
    },
    {
      heading: 'When the owner is in default under a plan',
      body: [
        'The order changes when the owner has already defaulted on a plan. The association is no longer required to follow the ranked list, with one limit that protects the other charges.',
      ],
      quotes: ['txPrioDefault', 'txPrioDefault1', 'txPrioDefault2'],
    },
    {
      heading: 'What this page does not tell you',
      body: [
        'We hold the text of §§ 209.0062 and 209.0063. We cannot tell you what your dedicatory instruments say about late fees or interest, how your attorney reads the cure period in § 209.0064, or whether your association has fewer than 15 lots. Check those before you write your guidelines.',
        'On the product side, HomeownerHub tracks the plan and drafts the notice. It does not check a plan against the minimum term or the 18-month and 12-month limits above, and it does not apply payments in the § 209.0063 order for you.',
      ],
    },
  ],
  steps: [
    'Count your lots. If there are more than 14, the guidelines are required.',
    'Draft the guidelines: how an owner asks, the minimum three-month term, and how you will treat the exceptions the statute allows.',
    'Have your attorney review them, then adopt them by board resolution.',
    'File the adopted guidelines in the real property records of each county where the subdivision is located.',
    'Put each plan in writing with the amount, the dates and what happens on a missed payment.',
    'Apply every payment in the statutory order, and write down the date and the charge each part paid.',
    'If an owner defaults on a plan, record the date, and decide how to apply later payments under the exception.',
  ],
  faqs: [
    {
      q: 'Does my Texas HOA have to offer payment plans?',
      a: 'If it is composed of more than 14 lots, it must adopt guidelines for an alternative payment schedule under § 209.0062. Smaller associations should ask their attorney.',
    },
    {
      q: 'How short can a plan be?',
      a: 'The statute sets a minimum term of three months for a plan the association offers.',
    },
    {
      q: 'Can the association charge interest on a plan?',
      a: 'The statute says monetary penalties do not include reasonable costs of administering the plan or interest. Your dedicatory instruments decide what interest or costs apply.',
    },
    {
      q: 'Which charge does a payment pay first?',
      a: 'Under § 209.0063, a delinquent assessment, then a current one, then attorney’s fees and collection costs, then fines, then other amounts.',
    },
    {
      q: 'What if the guidelines were never filed?',
      a: 'The statute says that does not stop an owner from receiving a payment plan. File them anyway.',
    },
  ],
  related: ['georgia-hoa-payment-order-sb-406', 'overpayments-credits', 'hoa-treasurer-duties', 'florida-hoa-estoppel-certificate-rules', 'texas-hoa-payment-plan-agreement'],
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
    {
      text: 'A State law check panel flags a Texas collection letter that lists fees before the 45-day notice, or that offers no payment plan. You can go ahead only by recording a reason.',
      route: '/properties/[id]/collections-letter',
      release: '2026-10-20-1935-law-check-opening-balances',
    },
  ],
}

export const CA_FINE_HEARING: Guide = {
  slug: 'california-hoa-fine-hearing-and-penalty-rules',
  path: '/guides/california-hoa-fine-hearing-and-penalty-rules',
  state: 'CA',
  title: 'California HOA fines: the $100 cap and the hearing before discipline',
  metaTitle: 'California HOA fine rules and hearings',
  description:
    'California Civil Code 5850 caps most HOA fines at $100, and 5855 requires a noticed hearing first. The notice, the cure right and the decision, quoted.',
  eyebrow: 'California · Fines',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'In a California common interest development, a monetary penalty cannot exceed the lesser of the published schedule amount and $100 per violation, with a narrow health and safety exception.',
    'Before the board disciplines a member, it must give written notice at least 10 days before a board meeting where the member may speak. The member can cure first, and a cure ends the matter.',
    'If the board imposes discipline, the member gets the decision in writing within 14 days. Without these steps, the discipline is not effective.',
    'This is a plain-language guide to the current Davis-Stirling text, not legal advice. Your attorney decides how it applies to your documents.',
  ],
  sections: [
    {
      heading: 'The penalty must be on a published schedule',
      body: [
        'A board that fines at all must adopt a schedule of monetary penalties and give it to every member in the annual policy statement. The penalties must fit what the governing documents authorize, and they must be reasonable. A new or revised penalty can go out later in a supplement delivered to members individually. A member can ask for the latest schedule and gets a copy.',
      ],
    },
    {
      heading: 'The $100 cap and its one exception',
      body: [
        'The cap is the lesser of two numbers. One is the amount in the schedule in effect on the day of the violation. The other is $100 per violation. A schedule that lists $250 does not let the board charge $250.',
        'There is one exception. For a violation that may harm the common area or another member’s property, the board may impose the scheduled amount even if it is above $100. Before it does, it must make a written finding at a board meeting open to the members.',
      ],
      quotes: ['caCapIntro', 'caCap1', 'caCap2', 'caHealth', 'caHealthFinding'],
    },
    {
      heading: 'No late charge or interest on a fine',
      body: [
        'A fine is not an assessment. The statute says a late charge or interest cannot be charged to a member on a monetary penalty. If your ledger adds a late fee to unpaid fines, that line is the one to look at first.',
      ],
      quotes: ['caNoLate'],
    },
    {
      heading: 'The notice and the hearing',
      body: [
        'Before the board meets to consider discipline, or to charge a member for damage to the common area, it must notify the member in writing. Delivery is personal or individual delivery, and the notice goes out at least 10 days before the meeting.',
        'The notice has minimum contents: when and where, what the alleged violation or damage is, and a statement that the member has a right to attend and may address the board. If the member asks, the board meets in executive session.',
      ],
      quotes: ['caNotice', 'caNoticeContents'],
    },
    {
      heading: 'The right to cure first',
      body: [
        'The member can fix the problem before the meeting. If the member does, the board may not impose discipline. The statute also covers a fix that takes longer than the notice period: if the member provides a financial commitment to cure, there is no discipline either.',
      ],
      quotes: ['caCure'],
    },
    {
      heading: 'After the meeting: agreement, dispute resolution and the decision',
      body: [
        'If the board and the member agree, the board drafts a written resolution that both sign. If they do not agree, the member can ask for internal dispute resolution. When the board does impose discipline, the member must get written notice of the decision within 14 days.',
        'None of this is optional. The statute says the discipline is not effective against the member unless the board meets these requirements.',
      ],
      quotes: ['caIdr', 'caDecision', 'caEffective'],
    },
    {
      heading: 'What these sections do not do',
      body: [
        'Section 5865 says §§ 5850 and 5855 do not give the board new power to fine, and do not take any away. Whether your board may fine for a given violation still depends on your governing documents. We hold only this statute text and cannot read your documents for you.',
      ],
      quotes: ['caNoNewPower'],
    },
  ],
  steps: [
    'Confirm the governing documents authorize the discipline, and that the penalty is on the published schedule.',
    'Check the amount: the lesser of the schedule and $100, unless the board has made the written health and safety finding in an open meeting.',
    'Send the written notice by personal or individual delivery at least 10 days before the meeting, with every required item.',
    'Offer the member the chance to cure, and record any cure or financial commitment before the meeting.',
    'Hold the meeting, let the member address the board, and go into executive session if the member asks.',
    'If you impose discipline, send the written decision within 14 days, delivered personally or individually.',
    'Do not add a late charge or interest to the penalty. Keep the notice, the proof of delivery and the decision together.',
  ],
  faqs: [
    {
      q: 'What is the most a California HOA can fine?',
      a: 'The lesser of the amount on the published schedule and $100 per violation, except where the board makes a written health and safety finding at an open meeting. See the quotes above.',
    },
    {
      q: 'How much notice must the owner get before the hearing?',
      a: 'The board must notify the member in writing at least 10 days before the meeting, by personal delivery or individual delivery.',
    },
    {
      q: 'Can the owner avoid the fine by fixing the problem?',
      a: 'Yes. The board may not impose discipline if the member cures before the meeting, or provides a financial commitment to cure when the cure takes longer than the notice period.',
    },
    {
      q: 'Can we charge a late fee on an unpaid fine?',
      a: 'No. The statute says a late charge or interest cannot be charged to a member for a monetary penalty.',
    },
    {
      q: 'What if the board skips the hearing steps?',
      a: 'The statute says the discipline is not effective against the member unless the board fulfills the requirements of § 5855.',
    },
  ],
  related: ['fines-and-violation-hearings', 'florida-hoa-fine-hearing-committee', 'california-hoa-internal-dispute-resolution', 'violation-notice-checklist', 'ai-hoa-violation-letters-board-approval'],
  hoaDoes: [
    {
      text: 'In California, a violation can only move to Fined once the hearing record shows the notice sent in time, the hearing held, and the outcome recorded. "Attorney advised" is the only override, and it is recorded.',
      route: '/violations/[id]',
      release: '2026-10-21-1130-budget-hearings-directors',
    },
    {
      text: 'A State law check panel appears when a violation moves to Fined. For California it flags a fine over $100 a day, and you can go ahead only by recording a reason.',
      route: '/violations/[id]',
      release: '2026-10-20-1935-law-check-opening-balances',
    },
  ],
}

export const STATE_GUIDES: readonly Guide[] = [FL_FINE_HEARING, FL_ESTOPPEL, TX_PAYMENT_PLANS, CA_FINE_HEARING]
