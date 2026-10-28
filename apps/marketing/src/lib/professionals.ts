// Content for /professionals (BL-172 batch 2): HOA attorneys and CPAs.
//
// Truth rules (BL-002, BL-168):
// - Professional seats (a CPA role and an Attorney role, BL-168) are LIVE as
//   of the 2026-10-27 prod deploy (release 2026-10-27-1758-roles-payments-holidays).
//   The page describes only what that release shipped.
// - What a board can do today is limited to shipped features: each names an
//   apps/hoa route and the docs/releases note that announced it. The tests
//   check both exist.
// - No partners, no named firms, no customer or testimonial claims.
//
// No "@/..." imports: marketing-truth tests import this module.

export const PROFESSIONALS_PATH = '/professionals'
export const PROFESSIONALS_UPDATED = '2026-10-27'

export const PROFESSIONALS_META = {
  title: 'HOA attorneys and CPAs: work with boards',
  description:
    'A board can invite you as its CPA or attorney with limited, time-boxed access: read-only books for a CPA, assigned matters only for an attorney.',
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

export interface AccessItem {
  role: 'CPA' | 'Attorney' | 'Both'
  text: string
}

/**
 * What shipped on 2026-10-27 (docs/releases/2026-10-27-1758-roles-payments-holidays.md,
 * docs/specs/2026-10-26-professional-roles.md). Settings -> Professionals in apps/hoa.
 */
export const ACCESS_LIVE: readonly AccessItem[] = [
  { role: 'Both', text: 'The board invites you from Settings → Professionals with a signed, single-use link that is good for 7 days.' },
  { role: 'Both', text: 'Every invitation carries an end date, at most a year out. The board sets it.' },
  { role: 'CPA', text: 'Read-only access to the association’s books. Owners appear by name only, with no email, phone or address.' },
  { role: 'Attorney', text: 'You see only the matters the board assigns you: collections cases, violations and records requests.' },
]

/** Officer controls a board has, so money approvals reach the right person. */
export const OFFICER_CONTROLS: readonly string[] = [
  'Officer titles: President, Treasurer, Secretary and others.',
  'Money approvals can be routed to the Treasurer.',
  'An optional amount above which two board members must approve a money item.',
]

export const PROFESSIONALS_FAQS: readonly { q: string; a: string }[] = [
  {
    q: 'Can I get a login to a client’s HomeownerHub?',
    a: 'Yes, if the board invites you. A board member sends a signed, single-use link from Settings → Professionals. The link works for 7 days, and the access ends on the date the board sets, at most a year out.',
  },
  {
    q: 'What does a CPA see?',
    a: 'The association’s books, read-only. Owners appear by name only, with no email, phone or address. The year-end package, monthly report and meeting packet are also still available as exports.',
  },
  {
    q: 'What does an attorney see?',
    a: 'Only the matters the board assigns: collections cases, violations and records requests. Nothing else in the association is opened to you.',
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
