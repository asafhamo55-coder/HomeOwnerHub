// SEO batch 4: special assessments (Georgia) and the switch from a management
// company to a self-managed HOA. Same truth rules as the other guides: statute
// text only through the quote bank (checked word for word against the
// fixtures), product claims only with an apps/hoa route and a release note
// that exist, and plain words about what the fixtures do not hold.

import type { Guide } from './types'

const PUBLISHED = '2026-10-27'

export const SPECIAL_ASSESSMENTS: Guide = {
  slug: 'special-assessments',
  title: 'Georgia HOA special assessments: what the statute says and what your documents decide',
  metaTitle: 'Georgia HOA special assessment rules',
  description:
    'What counts as a Georgia HOA special assessment, how an unpaid one becomes a lien, the 2027 payment order, and what your own documents decide. Not legal advice.',
  eyebrow: 'Money · Georgia',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'SB 406 defines a special assessment as one for costs outside the regular operating budget, such as legal costs and nonroutine or emergency repairs, renovations and other capital projects.',
    'The sections of the Property Owners’ Association Act that we hold set no owner vote and no dollar cap for a special assessment. Your declaration and bylaws decide who may levy one, and how.',
    'An unpaid assessment is the owner’s personal obligation and a lien on the lot. From January 1, 2027, a payment goes to regular assessments first, then to special assessments.',
    'Condominiums are under a different statute with its own limit. Check which one governs you.',
  ],
  sections: [
    {
      heading: 'What counts as a special assessment',
      body: [
        'From January 1, 2027, Georgia’s new owners’ association chapter sorts assessments into regular, special and specific. Regular assessments fund the operating budget, including reserve contributions. A special assessment covers a real cost that was never in that budget, like a storm repair or a legal bill.',
      ],
      quotes: ['assessmentDef', 'specialDef'],
    },
    {
      heading: 'Where the power to levy one comes from',
      body: [
        'In the Property Owners’ Association Act text we hold, we found no percentage of owners who must approve a special assessment, no dollar cap and no notice period written for it. That does not mean there are none. It means the answer sits in your own declaration and bylaws, which usually say who can levy an assessment, how much notice is needed and whether owners vote.',
        'So the first job is to read your documents. If they are silent or unclear, ask your attorney before you send an invoice. An assessment the documents do not support is the easiest kind for an owner to challenge.',
      ],
    },
    {
      heading: 'Owners cannot opt out, and unpaid amounts become a lien',
      body: [
        'Once a special assessment is lawfully levied, an owner cannot avoid it by not using the common area or by walking away from it. The statute says no owner other than the association is exempt from liability for an assessment.',
        'An unpaid assessment is also more than a debt. The statute makes sums lawfully assessed the owner’s personal obligation and a lien on the lot in favor of the association, ahead of most other liens.',
      ],
      quotes: ['noExempt', 'lienSums'],
    },
    {
      heading: 'From 2027, payments go to special assessments second',
      body: [
        'SB 406 sets the order in which an association must apply an owner’s payment. Regular assessments come first, until current. Special assessments come second. Fines and fees come last. A board that applies a payment to a fine first, while a special assessment is unpaid, would be out of order.',
        'The order does not name interest or collection costs, so ask your attorney where they fall.',
      ],
      quotes: ['payOrderIntro', 'payOrder1', 'payOrder2'],
    },
    {
      heading: 'Do special assessments count toward the foreclosure threshold?',
      body: [
        'From January 1, 2027, a foreclosure on a lien needs a minimum amount. The text excludes specific assessments, fines and fees from that amount. It does not say in so many words whether special assessments are counted.',
        'HomeownerHub’s collections panel counts regular and special assessments. That is our reading, not a court’s. Have your attorney confirm it before you rely on it.',
      ],
      quotes: ['threshold2027'],
    },
    {
      heading: 'Condominiums have their own limit',
      body: [
        'A condominium is under the Georgia Condominium Act instead. For condominium instruments recorded on or after July 1, 2015, it says the instrument may not authorize the board to impose the following. Ask your attorney about older instruments.',
      ],
      quotes: ['condoSpecialIntro', 'condoSpecial'],
    },
    {
      heading: 'A fair process, as best practice',
      body: [
        'None of this is in the statute, but a board that follows it is easier to defend. Write down the cost, the bids and why it is outside the budget. Put the decision on a noticed agenda and record the vote in the minutes. Then tell owners in writing the amount per lot, the due date, how to pay, and whether you allow installments.',
        'Keep it as its own ledger line, apart from regular dues and fines.',
      ],
    },
    {
      heading: 'What this page cannot tell you',
      body: [
        'We do not hold Georgia case law, the text of your declaration, or any official guidance on how a court will read the points above. We cannot tell you whether your board may levy a special assessment, how large it may be, or whether owners must vote. Ask your attorney to review your documents once, and keep that advice with the minutes.',
      ],
    },
  ],
  steps: [
    'Read your declaration and bylaws for the power to levy a special assessment, any owner vote or cap, and the notice steps.',
    'Write down the cost, the bids and why it is outside the regular budget.',
    'Notice the meeting as your documents require, and record the vote in the minutes.',
    'Send owners a written notice with the amount per lot, the due date and how to pay.',
    'Record it as its own charge, apart from regular dues and fines.',
    'Before January 1, 2027, confirm that payments are applied in the statutory order, and ask your attorney about interest and collection costs.',
  ],
  faqs: [
    {
      q: 'What is a special assessment in Georgia?',
      a: 'SB 406 defines it as an assessment imposed on owners for costs that are not included in the association’s regular operating budget, such as legal costs and nonroutine or emergency repairs, renovations and other capital projects.',
    },
    {
      q: 'Can a Georgia HOA board levy a special assessment without an owner vote?',
      a: 'The sections of the Property Owners’ Association Act that we hold do not require a vote. Your declaration and bylaws may. Condominiums have a statutory limit that depends on a vote, as quoted above.',
    },
    {
      q: 'Is there a cap on a Georgia HOA special assessment?',
      a: 'Not in the property owners’ association text that we hold. Your documents may set one. For condominiums, see the one-sixth rule quoted above and ask your attorney whether it applies to you.',
    },
    {
      q: 'Can an HOA put a lien on a home for an unpaid special assessment?',
      a: 'The statute makes sums lawfully assessed a lien on the lot. Foreclosing on it has its own notice and threshold rules, covered in our foreclosure threshold guide.',
    },
  ],
  related: ['late-fee-limits', 'foreclosure-threshold-2027', 'hoa-treasurer-duties', 'condo-vs-hoa-law', 'georgia-hoa-collections-notice'],
  hoaDoes: [
    {
      text: 'On a home’s dues, Georgia boards can use Record payment to enter one payment that covers several charges. From January 1, 2027 the app splits it in SB 406’s order: regular dues first, then special assessments, then late fees and fines, then everything else. You see the split before saving.',
      route: '/dues',
      release: '2026-10-27-0805-seo-audit-ga-payment-order',
    },
    {
      text: 'Each open collections case shows whether the amount owed clears the threshold: today’s rule and the stricter 2027 rule side by side, using the regular and special assessments owed less unapplied credit. The panel is read-only.',
      route: '/properties/[id]/collections-letter',
      release: '2026-10-26-1400-ga-foreclosure-threshold',
    },
  ],
}

export const SWITCH_FROM_MANAGER: Guide = {
  slug: 'switch-from-management-company-to-self-managed-hoa',
  path: '/guides/switch-from-management-company-to-self-managed-hoa',
  title: 'How to switch from a management company to a self-managed HOA',
  metaTitle: 'Management company to self-managed HOA',
  description:
    'A step-by-step plan for a volunteer board leaving its HOA management company: the contract, the records, the bank account, owner data and the first routines.',
  eyebrow: 'Self-managed HOA',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Read the management contract first. The notice period and the records-transfer terms set your timeline, and the contract is where most surprises hide.',
    'Ask in writing for the records, the bank access and the owner list well before the last day. A manager is easiest to work with while the relationship is still friendly.',
    'Move the money and the owner data in a planned order, and check each balance against the manager’s final report.',
    'Do not leave a gap. Decide who does what on day one, because the first invoice, violation and owner call will not wait.',
  ],
  sections: [
    {
      heading: 'Start with the contract, not the calendar',
      body: [
        'Most boards that switch do it because of cost, service or control. Whatever the reason, the management contract decides how and when you can leave. Before you tell the manager anything, have the board read it with a pen and look for the points below. This guide is general information, not legal advice. Have your attorney review the termination steps.',
      ],
      list: [
        'The term, the renewal clause and the notice you must give. Check whether it renews by itself unless you give notice in a set window.',
        'Termination for cause and without cause, and any fee for leaving early.',
        'What the manager must hand over at the end, in what format, and by when.',
        'Who owns the bank account, the owner database and the website domain, and who holds the logins.',
        'Fees for a records transfer, and whether the manager can hold records until the final invoice is paid.',
      ],
    },
    {
      heading: 'Get the records and the right to keep them',
      body: [
        'The records are the association’s, not the manager’s. Make a written list of everything you need, send it with a date, and ask for a handover meeting. A good list covers the governing documents, minutes, the current budget and financial statements, the owner list with balances, open violations and architectural requests, insurance policies, vendor contracts and the keys and logins.',
        'In Georgia, a nonprofit corporation must keep minutes of member and board meetings as permanent records. From January 1, 2027, SB 406 adds a ten-year rule for records on assessments, fines, fees, liens and foreclosures. Both are good reasons to ask for the full ledger history and not only this year’s.',
      ],
      quotes: ['requiredRecords', 'regRecords'],
    },
    {
      heading: 'Move the money in a planned order',
      body: [
        'Money is where a switch most often goes wrong. Open or confirm the association’s own operating account, add the new signers, and move owner payments to it on a date you announce. Keep the manager’s account open long enough to catch late payments.',
        'On the last business day, get the manager’s final reconciliation and trust-account balance, and tie your opening balances to it. Compare each home’s balance with the manager’s aging report before you accept it.',
      ],
    },
    {
      heading: 'Bring over the owner list and the books',
      body: [
        'Ask the manager for the owner list and the aging report as spreadsheets, not PDFs. Check names and addresses against your own records, and check each balance. A balance you carry over wrongly turns into a disputed late fee later.',
        'Do not post balances you have not checked. Treat the first month as a test run: reconcile the bank, compare the ledger to the manager’s final report, and write down what does not match.',
      ],
    },
    {
      heading: 'Set up the routines the manager used to run',
      body: [
        'A manager does a lot nobody lists: collecting dues, chasing late payers, scheduling vendors, answering owners, booking the annual meeting. Write the routines on one page and give each an owner on the board and a date. Monthly, that is a board meeting, a bank reconciliation and a look at who is overdue. Yearly, it is the budget, the annual meeting and the insurance renewal.',
        'Our first 90 days guide for Georgia and our treasurer checklist turn this into a calendar.',
      ],
    },
    {
      heading: 'Tell owners, vendors and the state',
      body: [
        'Tell owners in writing what is changing, from what date, where to pay and who to call. Send the same message to vendors and to anyone with an open request. Do not let owners learn about it from a bounced payment.',
        'In Georgia, a change in an association’s address or officers also has to reach the Secretary of State. If the association’s mailing address was the manager’s office, moving it counts.',
      ],
      quotes: ['regAmend'],
    },
    {
      heading: 'What this guide cannot tell you',
      body: [
        'We cannot tell you what your contract allows, whether your documents require an owner vote to change managers, or what your insurance requires. Those depend on documents we have not seen. We also do not know every state’s rules about trust accounts or records. Ask your attorney to review the contract and the termination notice before you send it.',
      ],
    },
  ],
  steps: [
    'Read the management contract: term, renewal, notice, handover duties and fees.',
    'Decide who on the board will lead the switch, and set a target date at least one notice period away.',
    'Send the termination notice the way the contract requires, after your attorney has reviewed it.',
    'Send a written list of the records, logins and data you need, and book a handover meeting.',
    'Open or confirm the association’s accounts, add signers and announce the new payment details to owners.',
    'Check the opening balances against the manager’s final report, then run the first month as a test.',
  ],
  faqs: [
    {
      q: 'Can an HOA board switch from a management company to self-managed?',
      a: 'In most cases yes, if the board follows the contract’s termination terms and its own governing documents. Some documents or contracts add requirements, so have your attorney check.',
    },
    {
      q: 'How long does it take to go self-managed?',
      a: 'It depends on the contract’s notice period and on how quickly the records arrive. Plan for at least one full quarter of overlap and checking.',
    },
    {
      q: 'What records should we get from the management company?',
      a: 'The governing documents, minutes, budgets and financial statements, the owner list with balances, violation and architectural files, insurance policies, vendor contracts, and every login the association uses.',
    },
    {
      q: 'Do we need an owner vote to end the management contract?',
      a: 'Usually the board signs the management contract, so the board ends it. But your documents may say otherwise. Read them and ask your attorney.',
    },
    {
      q: 'Can HomeownerHub help after the switch?',
      a: 'It can import your owner list and the opening balances, bring in bank statements and keep a setup checklist, as described above. The board approves every draft, and it does not give legal advice.',
    },
  ],
  related: ['self-managed-hoa-georgia-first-90-days', 'hoa-treasurer-duties', 'records-inspection-requests', 'registration-2027', 'hoa-board-meeting-minutes'],
  hoaDoes: [
    {
      text: 'The roster import takes a CSV or Excel file and matches its columns. CINC exports are recognised automatically. A preview shows what will happen to each row before anything is saved, and balances in the file are shown for reference but never posted.',
      route: '/properties/import',
      release: '2026-10-18-0045-properties-360-import',
    },
    {
      text: 'The CINC aging report import sets each home’s opening balance. A preview matches rows to homes by address and checks the file against the report’s own grand total. Nothing posts until a board member approves it in Approvals. The CINC column layout has not yet been checked against a real export.',
      route: '/accounting/opening-balances',
      release: '2026-10-21-2230-cinc-aging-security',
    },
    {
      text: 'The bank import adds an account by hand and loads a CSV, OFX or QFX statement. A preview shows the new transactions first, and re-importing an overlapping statement never adds a transaction twice.',
      route: '/accounting/bank',
      release: '2026-10-21-1810-bank-import-street-homes',
    },
    {
      text: 'The setup checklist is one list of nine steps, seven of them required, on the dashboard and on the setup page. Each tick reflects real data, and importing a spreadsheet is self-serve.',
      route: '/onboarding/setup',
      release: '2026-10-20-1700-setup-billing-deadlines',
    },
    {
      text: 'The board handover checklist covers who has access and which connections one person set up, with a printable summary that has no passwords in it.',
      route: '/settings/handover',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
  ],
}
