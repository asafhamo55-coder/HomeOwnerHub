// BL-172 batch 2: self-managed HOA how-to guides. Same truth rules as the
// other guides: statute text only through the quote bank, product claims
// only with an apps/hoa route and a release note that exist.

import type { Guide } from './types'

const PUBLISHED = '2026-10-26'

export const FIRST_90_DAYS: Guide = {
  slug: 'self-managed-hoa-georgia-first-90-days',
  title: 'How to run a self-managed HOA in Georgia: the first 90 days',
  metaTitle: 'Self-managed HOA in Georgia: your first 90 days as a board',
  description:
    'A 90-day plan for a volunteer board taking over a Georgia HOA without a management company: documents, money, meetings, and the SB 406 dates.',
  eyebrow: 'Self-managed HOA · Georgia',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'In the first 30 days, get control of the documents, the bank account and the officer list. Nothing else works without them.',
    'In days 31 to 60, put the money, the meetings and the violation process on a calendar.',
    'In days 61 to 90, get ready for Georgia’s January 1, 2027 changes: registration, owners’ rights and the new collection rules.',
    'Your own declaration and bylaws come first. Georgia’s statute fills the gaps, and it often says “to the extent the instrument provides.”',
  ],
  sections: [
    {
      heading: 'Days 1 to 30: get control',
      body: [
        'A self-managed board does the work a management company used to do, so the first month is about finding out what you actually have. Ask the previous manager, the previous board or the developer for the following, and keep the answers in one shared folder.',
      ],
      list: [
        'The recorded declaration, the bylaws, the articles of incorporation and every amendment.',
        'The rules and regulations, and proof they were provided to owners.',
        'The current budget, the last two years of financial statements and the reserve balance.',
        'Bank account details, who the signers are, and the login for every online account the association uses.',
        'Insurance policies, vendor contracts and their renewal dates.',
        'The owner list, with mailing addresses and any open balances.',
      ],
    },
    {
      heading: 'Know which law governs you',
      body: [
        'Most Georgia HOAs are governed by the Property Owners’ Association Act. Condominiums are under a different statute, with different rules for things like late charges and notices. If you are unsure which applies, that is your first question for the association’s attorney. Our condo guide explains the split.',
        'Then read your own documents with a pen in hand. Fines, late fees and the process for both are things Georgia lets an association do only “to the extent” its documents allow. If yours are silent, do not start charging until your attorney has looked.',
      ],
    },
    {
      heading: 'Confirm who is on the board',
      body: [
        'Check the filed officer list against who is actually serving, and make sure the bank and every account has the current officers. This matters more from 2027, when the Secretary of State registration must be signed by an authorized officer or representative.',
      ],
    },
    {
      heading: 'Days 31 to 60: put the routines on a calendar',
      body: [
        'Once you have the paperwork, set a rhythm. A volunteer board that decides in advance what happens each month avoids the emergency.',
      ],
      list: [
        'Monthly: a board meeting, a bank reconciliation, and a look at who is overdue.',
        'Quarterly: a financial summary for owners, an insurance and vendor-contract check.',
        'Yearly: the budget, the annual meeting, the reserve review and the Secretary of State renewal.',
      ],
    },
    {
      heading: 'Meetings and quorum',
      body: [
        'Georgia sets two minimums for meetings of owners. The association must meet at least once a year, and the notice has to go out early and say what the statute lists. Our annual meeting notice checklist walks through it.',
        'For the board itself, the statute sets a default quorum unless your bylaws specify a larger percentage. Use our free agenda template so every meeting records the same things.',
      ],
      quotes: ['meetingNotice', 'boardQuorum'],
    },
    {
      heading: 'Money: dues, late fees and the budget',
      body: [
        'Send dues on schedule and keep one ledger. A late charge is allowed only if the instrument provides for it, and then only up to the statute’s cap. Our late fee guide has the numbers and examples.',
      ],
      quotes: ['lateIntro'],
    },
    {
      heading: 'Violations: a fair process from the start',
      body: [
        'The most common source of owner disputes is an unclear violation letter. Decide now who inspects, who drafts, and who approves, and use a checklist so every notice states the facts, cites the rule, and says how to respond. Our violation notice checklist tags each item as statute or best practice.',
      ],
    },
    {
      heading: 'Days 61 to 90: get ready for January 1, 2027',
      body: [
        'Georgia’s SB 406 changes the rules for associations starting in 2027. By day 60 your documents and officers are in order, so use days 61 to 90 on the changes.',
        'First, registration. From 2027 an owners’ association must register with the Secretary of State, and the registration comes with a financial statement.',
      ],
      list: [
        'Decide whether to register or to opt out, with your attorney. Opting out has consequences for fines and fees.',
        'Gather the governing documents and a recent financial statement.',
        'Put the December 31 renewal on the calendar.',
      ],
      quotes: ['regRequired', 'regFinancial'],
    },
    {
      heading: 'Owners’ rights and your duty of care',
      body: [
        'The same law lists twelve rights owners can expect, including that directors will act in good faith. Read the whole list once as a board; our owners’ rights guide quotes all twelve.',
      ],
      quotes: ['right9'],
    },
  ],
  steps: [
    'Days 1 to 7: collect the declaration, bylaws, articles, rules, budget, bank details and insurance policies into one folder.',
    'Days 8 to 30: confirm officers and bank signers, learn which statute governs you, and read your documents for fines and late fees.',
    'Days 31 to 45: set the monthly, quarterly and yearly calendar, and hold your first meeting using an agenda.',
    'Days 46 to 60: send dues on schedule, adopt a violation process, and check insurance and vendor renewals.',
    'Days 61 to 75: take the SB 406 readiness check and decide, with your attorney, whether to register.',
    'Days 76 to 90: prepare the filing documents, plan the annual meeting, and brief the board on owners’ rights.',
  ],
  faqs: [
    {
      q: 'Can a volunteer board run an HOA without a management company in Georgia?',
      a: 'Yes. Many Georgia associations are self-managed. The board takes on the work of records, money, meetings and enforcement, and uses an attorney and an accountant for the parts that need a professional.',
    },
    {
      q: 'What is the most important thing to do first?',
      a: 'Get the governing documents, the bank account access and the current officer list. Almost every other task depends on one of the three.',
    },
    {
      q: 'Do we have to register with the Secretary of State?',
      a: 'From January 1, 2027, an entity that is an owners’ association must register, unless it elects by written notice not to. Opting out has consequences, so decide with your attorney. See our registration guide.',
    },
    {
      q: 'How often must we hold a meeting of owners?',
      a: 'At least once a year, with 21 days’ notice for an annual or regularly scheduled meeting, and seven days for others, as quoted above. Your bylaws may require more.',
    },
    {
      q: 'Do we still need an attorney?',
      a: 'For collections, foreclosure, document amendments and the registration decision, yes. A self-managed board uses an attorney for judgment calls and does the routine work itself.',
    },
  ],
  related: ['registration-2027', 'violation-notice-checklist', 'hoa-board-meeting-agenda', 'late-fee-limits', 'hoa-treasurer-duties'],
  hoaDoes: [
    {
      text: 'The Compliance page lists what Georgia law asks of your association, with an overdue banner, so the yearly obligations are on one calendar.',
      route: '/compliance',
      release: '2026-10-21-1930-elections-compliance',
    },
    {
      text: 'The Georgia registration kit helps the board decide between registering and opting out, fills in a filing sheet from your records, and records each filing and renewal. It does not file anything for you.',
      route: '/compliance/ga-registration',
      release: '2026-10-22-1445-ga-registration-kit-digest-fix',
    },
    {
      text: 'The Tasks page gathers every action item from your meetings, with an owner and a due date for each.',
      route: '/tasks',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
    {
      text: 'The board handover checklist covers who has access and which connections one person set up, with a printable summary that has no passwords in it.',
      route: '/settings/handover',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
  ],
}

export const TREASURER_DUTIES: Guide = {
  slug: 'hoa-treasurer-duties',
  path: '/guides/hoa-treasurer-duties',
  title: 'HOA treasurer duties: a plain-language checklist',
  metaTitle: 'HOA treasurer duties: a plain-language checklist for volunteers',
  description:
    'What an HOA treasurer actually does: the books, dues, bank reconciliation, budget, reserves, reports and year-end, with a checklist for volunteers.',
  eyebrow: 'Self-managed HOA · Treasurer',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  summary: [
    'The treasurer keeps the association’s money records honest: what came in, what went out, and what is owed.',
    'Do a few things every month (reconcile, review overdue accounts, report) and a few every year (budget, reserves, year-end package, annual meeting report).',
    'The treasurer does not have to be an accountant, but should get a CPA for the tax return and for anything uncertain.',
    'Your governing documents set the details. Georgia’s statute requires financial reports at the annual meeting.',
  ],
  sections: [
    {
      heading: 'What the job is',
      body: [
        'In most associations the treasurer is a volunteer officer. The role is to make sure the association’s money is recorded accurately, that the board can see where it stands, and that owners get the reports the documents and the law require.',
        'It is a duty of care, not a licence. A treasurer who keeps clear records, asks questions and uses professionals when unsure is doing the job well. Your bylaws list the exact duties, so read them first.',
      ],
    },
    {
      heading: 'Every month',
      body: ['Block an evening each month. These are the tasks that make the year-end easy.'],
      list: [
        'Record deposits and payments in the ledger, matched to the right owner or vendor.',
        'Reconcile the bank account: the books and the bank statement should agree, and any difference is explained.',
        'Review the overdue list. Contact owners early and in a consistent way.',
        'Approve and pay vendor bills against the budget, and keep the invoice with the payment record.',
        'Give the board a one-page report: cash, dues collected, what is overdue, spending against budget.',
      ],
    },
    {
      heading: 'Dues and late fees',
      body: [
        'The treasurer usually owns the dues schedule. Bill on the dates your documents set, and treat every owner the same way. In Georgia, a late charge is added to the owner’s obligation only to the extent the instrument provides, and the statute caps it. Interest is a separate item.',
      ],
      quotes: ['lateIntro', 'lateCharge'],
    },
    {
      heading: 'The annual budget and reserves',
      body: [
        'Each year the board adopts a budget for the next. The treasurer drafts it from last year’s actuals, known contract changes and the reserve plan. Reserves are money set aside for large repairs such as roofs, paving and pools. A budget that leaves them out tends to produce special assessments later.',
        'Check your documents for the adoption steps: how the budget is approved, how owners are told, and when a dues increase takes effect.',
      ],
    },
    {
      heading: 'The annual meeting report',
      body: [
        'Georgia’s statute says that comprehensive reports of the association’s affairs, finances and budget projections are made to the owners at the annual meeting. The treasurer is the natural author of the finances part.',
      ],
      quotes: ['meetingReports'],
    },
    {
      heading: 'Year-end and your accountant',
      body: [
        'At year end, gather a package for your CPA: financial statements, the ledger, amounts owed by owners, bank reconciliations, vendor payments and budget against actual. Ask the CPA which tax return the association files and which vendors need a 1099. Do not guess on tax questions.',
        'From 2027, a Georgia owners’ association registering with the Secretary of State also files a financial statement dated no more than a year before the filing. Having the year-end package ready makes that easy.',
      ],
      quotes: ['regFinancial'],
    },
    {
      heading: 'Controls that protect you',
      body: [
        'Money handled by volunteers needs simple controls. Two people should see each payment: one approves, another records or reconciles. The person who signs checks should not be the only one who sees the bank statement. Keep every receipt and invoice. When the treasurer changes, hand over bank access and logins in writing.',
      ],
    },
  ],
  steps: [
    'Read the treasurer duties, the dues section and the budget section of your bylaws and declaration.',
    'Get read access to the bank account and the ledger, and agree who approves payments.',
    'Reconcile the most recent month and fix anything that does not match.',
    'Build the overdue list and decide how and when owners are contacted.',
    'Draft the next budget with a reserve line, and put the adoption steps on the calendar.',
    'Set a monthly report for the board, and a year-end package for your CPA.',
  ],
  faqs: [
    {
      q: 'Does an HOA treasurer need to be an accountant?',
      a: 'No. The role calls for care and consistency. Use a CPA for the tax return, for reviewing the books if your documents require it, and for anything you are unsure of.',
    },
    {
      q: 'What reports does a treasurer give the board?',
      a: 'A monthly summary is usual: cash on hand, dues billed and collected, overdue accounts, spending against budget and the reserve balance. Your bylaws may require more.',
    },
    {
      q: 'Can a treasurer be personally liable?',
      a: 'It depends on your documents, your state and the circumstances, so ask your attorney and your insurer about director and officer coverage. Good records and the controls above are your best protection.',
    },
    {
      q: 'What is the difference between operating and reserve funds?',
      a: 'The operating fund pays everyday costs such as landscaping, insurance and utilities. The reserve fund is saved for large repairs and replacements. Keep them separate in the books.',
    },
    {
      q: 'What should we hand over when the treasurer changes?',
      a: 'The ledger, bank statements and reconciliations, the budget, the owner balances, vendor contracts, and written access to every account, with passwords moved to the new treasurer by the bank or provider.',
    },
  ],
  related: ['late-fee-limits', 'hoa-board-meeting-agenda', 'self-managed-hoa-georgia-first-90-days', 'annual-meeting-notice-checklist'],
  hoaDoes: [
    {
      text: 'Bank statement import: for a bank that is not linked, upload a CSV, OFX or QFX file, preview it, and send the new transactions to the reconciliation queue. Re-importing the same file never adds a transaction twice.',
      route: '/accounting/bank',
      release: '2026-10-21-1810-bank-import-street-homes',
    },
    {
      text: 'The year-end package is one zip with the statements, the ledger, amounts owed at year end, bank reconciliation status, vendor payments and budget against actual, for your accountant. It also has a Form 1120-H worksheet and a list of vendors who may need a 1099. It is not tax advice, and the app does not file the return.',
      route: '/accounting/reports/year-end',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
    {
      text: 'A monthly board report is emailed on the 1st to board and admin members: cash, dues collected, overdue balances, budget lines furthest from plan, violations and approvals waiting. You can preview it first.',
      route: '/accounting/reports',
      release: '2026-10-17-2210-speed-board-report',
    },
    {
      text: 'A late-fee policy page checks Georgia’s cap when the board saves a policy, so a policy over the cap cannot be saved.',
      route: '/settings/late-fees',
      release: '2026-10-21-2255-dues-rates-late-fees-georgia',
    },
    {
      text: 'A budget adoption checklist walks the board through scheduling the meeting, sending notice, recording the adoption and then setting the new dues.',
      route: '/accounting/budget',
      release: '2026-10-21-1130-budget-hearings-directors',
    },
  ],
}
