// Content for /professionals (BL-172 batch 2): HOA attorneys and CPAs.
//
// Truth rules (BL-002, BL-168):
// - Professional seats (a CPA role and an Attorney role, BL-168) are NOT
//   deployed. The page says "coming soon" and promises no date. The planned
//   behavior is described only as planned.
// - What a board can do today is limited to shipped features: each names an
//   apps/hoa route and the docs/releases note that announced it. The tests
//   check both exist.
// - No partners, no named firms, no customer or testimonial claims.
//
// No "@/..." imports: marketing-truth tests import this module.

export const PROFESSIONALS_PATH = '/professionals'
export const PROFESSIONALS_UPDATED = '2026-10-26'

export const PROFESSIONALS_META = {
  title: 'HOA attorneys and CPAs: work with boards',
  description:
    'Seats for HOA attorneys and CPAs are coming soon. A board can hand you the year-end package, monthly report, meeting packet. Ask for early access.',
}

export interface ShippedShare {
  title: string
  text: string
  route: string
  release: string
  /** Who it helps. */
  audience: 'CPA' | 'Attorney' | 'Both'
}

/** What a board can hand a professional today. Each item is live in apps/hoa. */
export const SHARE_TODAY: readonly ShippedShare[] = [
  {
    title: 'Year-end package',
    text: 'One zip with the financial statements, the ledger, amounts owed at year end, bank reconciliation status, vendor payments and budget against actual. It includes a Form 1120-H worksheet and a list of vendors who may need a 1099, with anything uncertain left blank for you. No tax ID numbers are included. It is not tax advice, and the app does not file the return.',
    route: '/accounting/reports/year-end',
    release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    audience: 'CPA',
  },
  {
    title: 'Monthly board report',
    text: 'The month-end report the board receives on the 1st: cash, dues billed and collected, overdue balances, income and expenses, the budget lines furthest from plan, violations and approvals waiting. The board can preview it and forward it.',
    route: '/accounting/reports',
    release: '2026-10-17-2210-speed-board-report',
    audience: 'CPA',
  },
  {
    title: 'Board packet',
    text: 'A packet for the meeting month, with budget against actual and delinquency as of the last day of that month, so the numbers do not shift after the fact.',
    route: '/meetings/[id]/packet',
    release: '2026-10-17-1700-board-packet-ai-privacy',
    audience: 'Both',
  },
  {
    title: 'Georgia registration kit',
    text: 'A printable board-only kit for the SB 406 Secretary of State registration: the register-or-opt-out decision with the law’s own words, a filing sheet filled in from the association’s records, and a governing-documents checklist. It does not file anything.',
    route: '/compliance/ga-registration',
    release: '2026-10-22-1445-ga-registration-kit-digest-fix',
    audience: 'Attorney',
  },
  {
    title: 'Collections letters for the board to approve',
    text: 'Drafts of the Georgia attorney’s-fee notice and the notice before foreclosure, for the board to approve. A letter that claims attorney’s fees stays blocked until the fee notice has gone out.',
    route: '/properties/[id]/collections-letter',
    release: '2026-10-21-2255-dues-rates-late-fees-georgia',
    audience: 'Attorney',
  },
]

export interface PlannedItem {
  role: 'CPA' | 'Attorney' | 'Both'
  text: string
}

/**
 * What the BL-168 design intends. Shown under a "Planned, not live" label.
 * Nothing here is promised for a date.
 */
export const PLANNED: readonly PlannedItem[] = [
  { role: 'CPA', text: 'Read-only access to the association’s accounting, with exports.' },
  { role: 'CPA', text: 'Mark a period as reviewed, and propose adjusting entries that post only after the board approves.' },
  { role: 'Attorney', text: 'See only the matters the board assigns, such as a collections case or a records request.' },
  { role: 'Attorney', text: 'Add notes and documents, and draft letters that the board approves.' },
  { role: 'Both', text: 'Access that the board grants for a set period and can end at any time.' },
]

export const PROFESSIONALS_FAQS: readonly { q: string; a: string }[] = [
  {
    q: 'Can I get a login to a client’s HomeownerHub today?',
    a: 'Not as a professional seat. Seats for HOA attorneys and CPAs are coming soon and are not live. Today a board member can export the year-end package, the monthly report or the meeting packet and send it to you.',
  },
  {
    q: 'When will professional seats launch?',
    a: 'We have not set a date and will not promise one here. Tell us you are interested and we will write to you when they are available.',
  },
  {
    q: 'Does HomeownerHub give legal or tax advice?',
    a: 'No. It prepares paperwork and cites the law. The board approves every draft, and you advise the board. The year-end tax helpers leave uncertain items blank for the CPA.',
  },
  {
    q: 'Does HomeownerHub file anything with the state or the IRS?',
    a: 'No. The Georgia registration kit prepares the filing sheet and records the board’s own filings. The board or its attorney files with the Secretary of State.',
  },
  {
    q: 'Is there a referral program or a partner list?',
    a: 'No. We have not announced one, and this page names no firms.',
  },
]
