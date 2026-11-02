/**
 * Hand-written row and RPC types for migrations/0074_polls.sql (M9).
 *
 * Why not database.types.ts: `pnpm gen:types` reads the LIVE database, where
 * 0074 is not applied (CLAUDE.md footgun 3). Code reaches these tables through
 * a narrow cast and checks M9_APPLIED first. After the owner applies 0074,
 * regenerate and delete this file.
 *
 * Type-only: no imports, no runtime.
 */

export type PollStatus = 'draft' | 'open' | 'closed'
export type PollResultsVisibility = 'after_close' | 'live'

export interface PollRow {
  id: string
  organization_id: string
  association_id: string
  title: string
  description: string | null
  allow_multiple: boolean
  results_visibility: PollResultsVisibility
  status: PollStatus
  closes_at: string | null
  opened_at: string | null
  closed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PollOptionRow {
  id: string
  organization_id: string
  poll_id: string
  label: string
  position: number
  created_at: string
}

/** One row of poll_results(): a tally per option, never a name. */
export interface PollResultRow {
  option_id: string
  label: string
  option_position: number
  votes: number
  homes_answered: number
}
