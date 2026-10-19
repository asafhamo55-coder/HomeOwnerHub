// Single source of truth for the workflows on /roadmap, /honesty-bars, the
// homepage workflow grid and the site search.
//
// Truth rule (BL-002, BL-042): `shipped` means a board can use it in
// apps/hoa today. Anything else is `building` or `planned`, and every list
// renders it with that status, never as available. Planned HOA items carry
// no bar ('—') until they exist. When a workflow ships or its bar moves,
// update this file in the same change. PM and Eviction rows are outside the
// HOA truth pass and unchanged.

import { OTHER_HUBS_ENABLED } from '@homeowner-portal/ui/hubs'

export type Bar = 'C' | 'B' | 'A' | '—'
export type Status = 'shipped' | 'building' | 'planned'
export type Hub = 'HOA' | 'PM' | 'Eviction' | 'All' | 'Build'

export interface Workflow {
  id: number
  name: string
  hub: Hub
  bar: Bar
  status: Status
  /** Month bucket when this is on the line. */
  month: 'M1' | 'M2' | 'M3' | 'M4' | 'M5-6' | 'M7+'
  description: string
  /**
   * Evidence for a shipped HOA workflow: the apps/hoa page or API route a
   * board uses. workflows.test.ts checks that it exists.
   */
  route?: string
}

export const ALL_WORKFLOWS: Workflow[] = [
  { id: 1, name: 'Document onboarding', hub: 'HOA', bar: 'C', status: 'shipped', month: 'M1', route: '/documents/upload',
    description: 'Upload your CC&R, bylaws and rules. Each document is read and indexed section by section, so answers can cite it.' },
  { id: 2, name: 'Covenant Brain', hub: 'HOA', bar: 'C', status: 'shipped', month: 'M1', route: '/ai/ask',
    description: 'Ask any rule question in plain English. The answer cites the section, and says so when your documents don\'t cover it.' },
  { id: 22, name: 'Daily Digest', hub: 'HOA', bar: 'C', status: 'shipped', month: 'M1', route: '/api/ai/daily-digest',
    description: 'A daily summary of what needs the board, with a compliance heat map on the dashboard.' },
  { id: 3, name: 'Violation Drafter', hub: 'HOA', bar: 'B', status: 'shipped', month: 'M2', route: '/violations/new',
    description: 'Photo + caption → a drafted letter with the rule cited. It waits in Approvals: approve or reject in one click. Approving never emails the homeowner by itself.' },
  { id: 6, name: 'Conversational Resident Portal', hub: 'HOA', bar: 'C', status: 'shipped', month: 'M2', route: '/resident/ask',
    description: 'Residents see their balance and statement, file ARC and maintenance requests, and ask the governing documents before they email the board.' },
  { id: 7, name: 'AI meeting minutes', hub: 'HOA', bar: 'B', status: 'shipped', month: 'M2', route: '/meetings/new',
    description: 'Paste the meeting transcript. AI drafts board-ready minutes; the board edits and approves them.' },
  { id: 16, name: 'Board Copilot', hub: 'HOA', bar: 'B', status: 'shipped', month: 'M2', route: '/api/ai/ask-community',
    description: 'Ask about your community (who is overdue, open violations, an owner\'s contact, recent meetings) and get answers from your records and documents.' },
  { id: 19, name: 'Inbox reply drafts', hub: 'HOA', bar: 'B', status: 'shipped', month: 'M2', route: '/inbox',
    description: 'Your HOA\'s Gmail as one shared inbox. AI drafts each reply after contact details are removed; a person edits and sends.' },
  { id: 21, name: 'State-law answers', hub: 'HOA', bar: 'C', status: 'shipped', month: 'M2', route: '/legal/ask',
    description: 'HOA-law questions answered with citations to the state statute. Georgia today; Florida is being added.' },
  { id: 14, name: 'Ask the guide', hub: 'HOA', bar: 'C', status: 'shipped', month: 'M2', route: '/api/help/ask',
    description: 'Ask the built-in user guide how to do something. Answers come from its own articles, with the steps and a button to the right screen, and it says so when the app can\'t do it.' },
  { id: 18, name: 'Bill scan', hub: 'HOA', bar: 'B', status: 'shipped', month: 'M3', route: '/accounting/invoices/new',
    description: 'Scan a vendor bill. The AI reads the vendor, invoice number, dates, total and expense account into Approvals; nothing is entered until the board approves.' },
  { id: 20, name: 'Vendor RFPs and bid comparison', hub: 'HOA', bar: 'B', status: 'shipped', month: 'M3', route: '/rfps/new',
    description: 'Vendor onboarding, AI-written requests for proposal, and the bids that come back compared side by side.' },
  { id: 4, name: 'AI ARC review', hub: 'HOA', bar: 'B', status: 'shipped', month: 'M3', route: '/arc',
    description: 'Residents can check a request against your guidelines before they submit. The board sees a cited review, findings from the photos and editable decision letters. The board decides; nothing is sent until it does.' },
  { id: 5, name: 'Spanish announcements', hub: 'HOA', bar: 'B', status: 'shipped', month: 'M3', route: '/communications/new',
    description: 'Add an AI-drafted Spanish version to an announcement. The board reads and can edit it, and must confirm it before sending; the email carries both languages.' },
  { id: 8, name: 'Lease & Document Q&A', hub: 'PM', bar: 'C', status: 'planned', month: 'M3',
    description: '"What does Section 4.2 say about pet deposits?" Answered in 3 seconds with lease section cited.' },
  { id: 10, name: 'Delinquency Coach (day 5–30)', hub: 'PM', bar: 'B', status: 'planned', month: 'M3',
    description: 'Notices, follow-ups, payment-plan offers. Calibrated by tenant history.' },
  { id: 11, name: 'Tenant Risk Score', hub: 'PM', bar: 'A', status: 'planned', month: 'M3',
    description: 'Demo-only screening tool. Bar A in v1 — not safe for business decisions yet.' },
  { id: 17, name: 'Court-filing Templates', hub: 'Eviction', bar: 'A', status: 'planned', month: 'M4',
    description: 'County-correct templates, watermarked DEMO until your attorney signs off.' },
  { id: 15, name: 'Predictive Maintenance', hub: 'PM', bar: 'B', status: 'planned', month: 'M5-6',
    description: 'Component-failure forecasting 30–60 days out (HVAC, roof, plumbing).' },
  { id: 12, name: 'Reserve Live', hub: 'HOA', bar: '—', status: 'planned', month: 'M7+',
    description: 'Reserve fund tracking and projection. Not built yet: today the reserve is its own fund in the general ledger.' },
  { id: 13, name: 'Budget Anomaly Detection', hub: 'HOA', bar: '—', status: 'planned', month: 'M7+',
    description: 'Flags spend running over budget during the year. Not built yet: the month-end board report lists the budget lines furthest from plan.' },
  { id: 9, name: 'Vendor Oracle', hub: 'HOA', bar: '—', status: 'planned', month: 'M7+',
    description: 'Past spend, ratings and a recommended vendor for the next job. Not built yet.' },
]

/**
 * The workflows the site lists. BL-097: PM and Eviction rows are left out
 * while those hubs are not offered (OTHER_HUBS_ENABLED).
 */
export const WORKFLOWS: Workflow[] = OTHER_HUBS_ENABLED
  ? ALL_WORKFLOWS
  : ALL_WORKFLOWS.filter((w) => w.hub !== 'PM' && w.hub !== 'Eviction')

/** HOA workflows a board can use today. Counts on the site derive from this. */
export const SHIPPED_HOA_WORKFLOWS = WORKFLOWS.filter((w) => w.hub === 'HOA' && w.status === 'shipped')

export const BAR_TARGETS = {
  C: { name: 'Production', threshold: '>95% accuracy · no human gate required · audit logged' },
  B: { name: 'Human-reviewed', threshold: '>90% accuracy · mandatory human review before send' },
  A: { name: 'Demo only', threshold: 'Sandbox / watermarked · not safe for live use' },
}
