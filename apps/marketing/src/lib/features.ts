// Shipped HOA capabilities that aren't AI workflows (those live in
// workflows.ts). /hoa renders this list under "Also included".
//
// Truth rule (BL-002, BL-042): each entry is something a board can use in
// apps/hoa today, and names the apps/hoa page or API route that proves it.
// marketing-truth.test.ts checks every route exists. `release` is the
// docs/releases note that announced it, where there is one; the test
// checks that file exists too.

export interface ShippedFeature {
  text: string
  /** apps/hoa page or API route a board uses. Dynamic segments as [id]. */
  route: string
  /** docs/releases/<release>.md that announced it. */
  release?: string
}

export const SHIPPED_FEATURES: readonly ShippedFeature[] = [
  // Communications (releases 2026-10-19-2259, 2026-10-20-0850, 2026-10-20-0900)
  {
    text: 'Announcements to all homes, owners, renters, homes behind on dues, one home or a single street',
    route: '/communications/new',
    release: '2026-10-20-0850-saved-replies-street-messages',
  },
  {
    text: 'Phone preview of the email, text, portal and Spanish versions, and a test send to yourself',
    route: '/communications/new',
    release: '2026-10-20-0850-saved-replies-street-messages',
  },
  {
    text: 'Scheduled sends in your time zone, and built-in templates (dues reminder, meeting notice, water shutoff and more)',
    route: '/communications/new',
    release: '2026-10-19-2259-inbox-comms',
  },
  {
    text: 'Results by home: who received and opened a message, and a reminder email to those who haven’t, ready for you to review',
    route: '/communications/[id]',
    release: '2026-10-20-0850-saved-replies-street-messages',
  },
  // Inbox
  {
    text: 'Inbox saved replies, and Create from email: a ticket, violation report or ARC link from a resident’s message',
    route: '/inbox/[id]',
    release: '2026-10-20-0900-convert-composer-billing',
  },
  {
    text: 'A phone-friendly inbox, with Approve, Edit and Close at the bottom of the screen',
    route: '/inbox/[id]',
    release: '2026-10-20-0850-saved-replies-street-messages',
  },
  // State-law paperwork (releases 2026-10-19-1539, -1606, -1759,
  // 2026-10-20-1053, 2026-10-21-1130, -1930, -2255). Georgia's own items are
  // in lib/state-law.ts and render in the "Georgia first" section.
  {
    text: 'Estoppel certificates and home-sale paperwork from the home’s account: Georgia’s statement of amounts due, Florida and California estoppel and the Texas resale certificate, each with its deadline and fee limit',
    route: '/properties/[id]/estoppel',
    release: '2026-10-20-1053-state-law-resale-roster',
  },
  {
    text: 'Collections letters that follow Georgia, Florida, California or Texas law, approved in Approvals and printed',
    route: '/properties/[id]/collections-letter',
    release: '2026-10-19-1759-collections-letters',
  },
  {
    text: 'A Compliance page listing what state law asks of your association, with an overdue banner, Georgia first',
    route: '/compliance',
    release: '2026-10-21-1930-elections-compliance',
  },
  {
    text: 'Election planner: dates worked back from the meeting for your state, candidates, results, and a print kit with secret ballots',
    route: '/meetings/[id]/election',
    release: '2026-10-21-1930-elections-compliance',
  },
  {
    text: 'Annual meeting kit: live quorum counter, check-in, proxy tracking, sign-in sheet and proxy forms',
    route: '/meetings/[id]/quorum',
    release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
  },
  {
    text: 'Budget adoption checklist, with Florida and California notice deadlines, and fine hearings recorded before a fine',
    route: '/accounting/budget/[id]',
    release: '2026-10-21-1130-budget-hearings-directors',
  },
  {
    text: 'Dues rates and a late-fee policy the board sets, held to the state cap; no late fee until you save one',
    route: '/settings/late-fees',
    release: '2026-10-21-2255-dues-rates-late-fees-georgia',
  },
  {
    text: 'Insurance and fidelity bond tracker with renewal reminders, and an insurance summary for owners',
    route: '/insurance',
    release: '2026-10-21-1700-insurance-and-georgia-law',
  },
  {
    text: 'The owner budget notice, prepared from your approved budget',
    route: '/accounting/budget/[id]/notice',
    release: '2026-10-19-1606-budget-notice',
  },
  {
    text: 'Follow-up violation letters (second notice, hearing, fine, decision), through Approvals',
    route: '/violations/[id]',
    release: '2026-10-19-1404-follow-up-letters',
  },
  // Setup, records and money
  { text: 'Import your roster from CSV or Excel, CINC exports included, with a row-by-row preview', route: '/properties/import' },
  { text: 'Set up the association and open the books yourself, from Accounting', route: '/accounting' },
  { text: 'Monthly board packet, reported as of month end', route: '/meetings/[id]/packet' },
  {
    text: 'Board tasks from meetings and tickets, a board handover checklist, and a year-end package for your accountant',
    route: '/tasks',
    release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
  },
  {
    text: 'Reserve snapshot on the dashboard and in the monthly report: balance, contributions against budget, withdrawals',
    route: '/accounting/reports/monthly-report',
    release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
  },
  { text: 'Month-end board report emailed to the board on the 1st', route: '/accounting/reports/monthly-report' },
  { text: '⌘K search across owners, units, violations, ARC, tickets, documents and meetings', route: '/api/search' },
  { text: 'A built-in user guide with step-by-step articles, and Ask the guide', route: '/help' },
  { text: 'Dues, reminders and a resident ledger in your association’s own time zone', route: '/dues' },
  { text: 'Download all your data any time, as one zip of spreadsheets', route: '/settings/data' },
  { text: 'Mobile inspection mode: walk the community, photograph issues, drafts land in Approvals', route: '/inspect' },
  {
    text: 'Payment plans and recurring journal entries in Accounting',
    route: '/accounting/payment-plans',
    release: '2026-10-19-2220-plans-speed',
  },
  {
    text: 'Invite a CPA or attorney with a signed, single-use link: read-only books for a CPA, assigned matters only for an attorney',
    route: '/settings/professionals',
    release: '2026-10-27-1758-roles-payments-holidays',
  },
  {
    text: 'Officer titles, Treasurer routing and an optional amount that needs two board members to approve',
    route: '/settings/professionals',
    release: '2026-10-27-1758-roles-payments-holidays',
  },
]
