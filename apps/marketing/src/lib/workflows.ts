// Single source of truth for the 17 workflows displayed on /roadmap.
// Mirrors PROJECT_FOUNDATION §3 + PRODUCT_STRATEGY_CPO.md month-by-month plan.
// When workflow Bar moves in the product, update this file in lockstep.

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
}

export const WORKFLOWS: Workflow[] = [
  { id: 1, name: 'Onboarding Agent', hub: 'All', bar: 'C', status: 'shipped', month: 'M1',
    description: 'Ingests an HOA\'s full doc set in one pass. Outputs structured "here\'s your HOA" summary in under 20 min.' },
  { id: 2, name: 'Covenant Brain', hub: 'HOA', bar: 'C', status: 'shipped', month: 'M1',
    description: 'Ask any rule question in plain English. Cited answer in 4 seconds. <1% hallucination rate.' },
  { id: 3, name: 'Violation Drafter', hub: 'HOA', bar: 'B', status: 'building', month: 'M2',
    description: 'Photo + caption → notice ready for board approval. Human review gate is mandatory.' },
  { id: 4, name: 'ARC Recommender', hub: 'HOA', bar: 'B', status: 'building', month: 'M2',
    description: 'Architectural review packets with citations. Faster, more defensible decisions.' },
  { id: 5, name: 'Multilingual Comms', hub: 'All', bar: 'C', status: 'building', month: 'M2',
    description: 'Outbound email/SMS auto-translated to each recipient\'s preferred language.' },
  { id: 6, name: 'Conversational Resident Portal', hub: 'HOA', bar: 'C', status: 'building', month: 'M2',
    description: 'Residents ask the AI before they email the board. FAQ chat with full doc context.' },
  { id: 7, name: 'Minutes Engine', hub: 'HOA', bar: 'B', status: 'planned', month: 'M3',
    description: 'Records meeting → drafts board-ready minutes. Captures every motion, vote, decision.' },
  { id: 8, name: 'Lease & Document Q&A', hub: 'PM', bar: 'C', status: 'planned', month: 'M3',
    description: '"What does Section 4.2 say about pet deposits?" Answered in 3 seconds with lease section cited.' },
  { id: 9, name: 'Vendor Oracle', hub: 'HOA', bar: 'B', status: 'planned', month: 'M3',
    description: 'Past spend, ratings, and the recommended vendor for the next job.' },
  { id: 10, name: 'Delinquency Coach (day 5–30)', hub: 'PM', bar: 'B', status: 'planned', month: 'M3',
    description: 'Notices, follow-ups, payment-plan offers. Calibrated by tenant history.' },
  { id: 11, name: 'Tenant Risk Score', hub: 'PM', bar: 'A', status: 'planned', month: 'M3',
    description: 'Demo-only screening tool. Bar A in v1 — not safe for business decisions yet.' },
  { id: 12, name: 'Reserve Live', hub: 'HOA', bar: 'B', status: 'planned', month: 'M3',
    description: 'Real-time reserve fund projection. Updates with every invoice.' },
  { id: 13, name: 'Budget Anomaly Detection', hub: 'HOA', bar: 'B', status: 'planned', month: 'M3',
    description: 'Flags spend more than 10% over budget YTD. Before tax season, not during.' },
  { id: 14, name: 'Support Agent (tier-1)', hub: 'All', bar: 'C', status: 'planned', month: 'M4',
    description: 'Internal Tier-1 support. Knows every workflow and every doc you\'ve uploaded.' },
  { id: 15, name: 'Predictive Maintenance', hub: 'PM', bar: 'B', status: 'planned', month: 'M5-6',
    description: 'Component-failure forecasting 30–60 days out (HVAC, roof, plumbing).' },
  { id: 16, name: 'Board Copilot', hub: 'HOA', bar: 'B', status: 'planned', month: 'M4',
    description: 'Pre-meeting brief: what happened, what\'s pending, what needs a vote.' },
  { id: 17, name: 'Court-filing Templates', hub: 'Eviction', bar: 'A', status: 'planned', month: 'M4',
    description: 'County-correct templates, watermarked DEMO until your attorney signs off.' },
]

export const BAR_TARGETS = {
  C: { name: 'Production', threshold: '>95% accuracy · no human gate required · audit logged' },
  B: { name: 'Human-reviewed', threshold: '>90% accuracy · mandatory human review before send' },
  A: { name: 'Demo only', threshold: 'Sandbox / watermarked · not safe for live use' },
}
