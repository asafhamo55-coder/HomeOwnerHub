// SEO batch 11: an annual budget and reserve worksheet. The only statute text
// is the Georgia annual-meeting duty to report budget projections (§ 44-3-230(a),
// quote bank). Every line below is tagged best practice except that one: no
// fixture sets a budget format or a reserve amount, and the page says so.
// Product claims are limited to the budget editor, budget vs. actual and the
// owner budget notice.

import type { Checklist } from './checklists'

export const BUDGET_WORKSHEET: Checklist = {
  slug: 'hoa-annual-budget-worksheet',
  path: '/templates/hoa-annual-budget-worksheet',
  title: 'HOA annual budget and reserve contribution worksheet',
  metaTitle: 'HOA annual budget worksheet and reserves',
  description:
    'A free, printable worksheet for an HOA annual budget: income and expense lines, a reserve contribution, the dues math, and how to present it to owners.',
  eyebrow: 'Free worksheet · Print it',
  intro: [
    'Work down the page once a year, before the board votes on next year’s budget. Each line is a prompt: write the last-year actual beside it, then the figure you propose, then a one-line reason. The reserve line sits near the end so it is not squeezed by whatever is left.',
    'No law sets the layout of an HOA budget, and the statute text we hold does not set a reserve amount. Georgia’s Act requires a report of budget projections at the annual meeting, which is quoted below. Everything else on the list is our suggestion, tagged best practice. This is not legal advice. Check your bylaws and your state’s notice rules, and ask your attorney or CPA.',
  ],
  items: [
    { text: 'Write down last year’s actual income and expense for every line, from the books, not from memory.', detail: 'Use the budget against actual report for the year just ended as your starting column.', basis: 'practice' },
    { text: 'Income line 1: regular assessments. Number of homes times the annual dues per home.', detail: 'Use the dues you bill, not the dues you hope to collect.', basis: 'practice' },
    { text: 'Income line 2: other income such as interest, late charges, clubhouse rentals and capital contributions at sale.', detail: 'Budget only what your documents allow you to charge.', basis: 'practice' },
    { text: 'Income line 3: a bad-debt allowance for assessments you do not expect to collect.', detail: 'If an account is headed to an attorney, keep the attorney’s-fee notice steps on the calendar.', basis: 'practice' },
    { text: 'Expense: insurance premiums, from the renewal quotes in hand, not last year’s bill.', basis: 'practice' },
    { text: 'Expense: utilities, such as water, electric for common areas and street lights.', basis: 'practice' },
    { text: 'Expense: landscaping, pool, gate and other contracts, with each contract’s renewal date and any scheduled increase.', basis: 'practice' },
    { text: 'Expense: repairs and maintenance of common areas, based on a walk-through list and the open maintenance tickets.', basis: 'practice' },
    { text: 'Expense: management or bookkeeping, accounting and the annual tax return.', basis: 'practice' },
    { text: 'Expense: legal and collection costs, based on last year’s actual and any known dispute.', basis: 'practice' },
    { text: 'Expense: administration, such as postage, printing, meeting space, software and registration fees.', basis: 'practice' },
    { text: 'List every large item the community will need to repair or replace: roofs, pools, paving, fencing, signs. Add the expected cost and the year.', detail: 'This list drives the reserve line.', basis: 'practice' },
    { text: 'Reserve contribution: for each item, the cost to replace minus what is already set aside, divided by the years left.', detail: 'Add the lines up to the yearly contribution. If you have no reserve study, say so on the worksheet and flag a study as a task.', basis: 'practice' },
    { text: 'Enter the reserve contribution as its own line, above the surplus or deficit line.', basis: 'practice' },
    { text: 'Total income, total expense plus the reserve contribution, and the difference.', detail: 'If the difference is a deficit, decide whether to raise dues, cut a line or draw on reserves. Write down which one and why.', basis: 'practice' },
    { text: 'Dues math: total required from assessments divided by homes. Compare it to this year’s dues and write the dollar and percent change.', basis: 'practice' },
    { text: 'For every line that moves more than 10 percent, write one sentence for owners saying why.', basis: 'practice' },
    { text: 'A second board member checks the arithmetic and the sources.', basis: 'practice' },
    { text: 'Check your bylaws and your state’s rules for when and how owners get the proposed budget, and for any owner vote on a dues increase.', detail: 'Notice and vote rules differ by state and by document.', basis: 'practice' },
    { text: 'Prepare the budget summary for owners and put the budget, the dues change and the meeting date on one page.', basis: 'practice' },
    { text: 'Present the budget projections for the coming year at the annual meeting.', detail: 'Georgia’s Property Owners’ Association Act calls for this report.', basis: 'statute' },
  ],
  letter: {
    heading: 'Budget summary for owners (fill-in)',
    intro: 'Fill the blanks in brackets, keep it to one page and attach the line-by-line budget. Do not list any home’s balance or owner name on it.',
    lines: [
      'Dear neighbors,',
      '',
      'The board has prepared the [year] budget for [association name]. It will be voted on at [meeting date and time] at [place]. The full budget is attached.',
      '',
      'Total income planned: $[amount]. Total expenses planned: $[amount]. Reserve contribution: $[amount], to be set aside for [list of items].',
      '',
      'Annual dues per home would be $[amount], compared with $[amount] this year, a change of [percent] percent.',
      '',
      'The biggest changes are: [line and one-line reason], [line and one-line reason], [line and one-line reason].',
      '',
      'Reserves today stand at $[amount]. We are setting aside $[amount] a year for [items] because [one-line reason].',
      '',
      'Questions can be sent to [board contact] before [date]. We will answer them at the meeting.',
      '',
      '[Name], [role], on behalf of the board',
    ],
  },
  quotes: ['meetingReports'],
  quotesHeading: 'The Georgia text behind the last step',
  faqs: [
    {
      q: 'How much should an HOA put into reserves each year?',
      a: 'The statute text we hold sets no figure. The worksheet’s method is to list each big item, estimate its replacement cost and year, and spread what is not yet saved over the years left. A reserve study by a professional is a better basis.',
    },
    {
      q: 'Does a Georgia HOA have to present a budget to owners?',
      a: 'The Property Owners’ Association Act says comprehensive reports of the affairs, finances and budget projections shall be made to the lot owners at the annual meeting. See the quote above. Your bylaws may add requirements.',
    },
    {
      q: 'Is this worksheet legal advice or a required form?',
      a: 'No. No law we hold prescribes this layout. It is a working tool for a volunteer board. Have your attorney or CPA review the final budget.',
    },
    {
      q: 'Should the board show owners each home’s balance with the budget?',
      a: 'We suggest not. A document that goes to all owners should carry totals and counts only.',
    },
  ],
  related: ['georgia-annual-meeting-report-checklist', 'hoa-treasurer-duties', 'attorney-fee-notice-checklist', 'annual-meeting-notice-checklist'],
  datePublished: '2026-10-31',
  dateModified: '2026-10-31',
  howTo: true,
  hoaDoes: [
    {
      text: 'Accounting has a budget editor. You can draft next year’s budget from the last 12 months of actuals plus an inflation percentage you choose, edit every line, and save it as a draft.',
      route: '/accounting/budget/[id]',
      release: '2026-10-18-0305-arc-ai-budget',
    },
    {
      text: 'The budget against actual report shows the year’s plan next to what was spent, so you can fill in the last-year column from the books.',
      route: '/accounting/reports/budget-vs-actual',
      release: '2026-10-18-0425-books-limits',
    },
    {
      text: 'Once a budget is approved, the board can prepare the owner budget notice from it. Reserve figures in the notice are blanks you fill in, and nothing prints until you tick that you have checked the figures.',
      route: '/accounting/budget/[id]/notice',
      release: '2026-10-19-1606-budget-notice',
    },
  ],
}
