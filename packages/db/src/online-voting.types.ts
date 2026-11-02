/**
 * Hand-written row and RPC types for migrations/0075_online_voting.sql (M10).
 * Not in database.types.ts: gen:types reads the live database, where 0075 is
 * not applied (CLAUDE.md footgun 3). Delete after the owner applies 0075 and
 * types are regenerated. Type-only.
 */
export type BallotKind = 'election' | 'question'
export type BallotStatus = 'draft' | 'open' | 'closed'
export type BallotAuthorityBasis = 'governing_documents' | 'state_law' | 'both'

export interface BallotRow {
  id: string
  organization_id: string
  association_id: string
  meeting_id: string | null
  kind: BallotKind
  title: string
  description: string | null
  max_selections: number
  status: BallotStatus
  opens_at: string | null
  closes_at: string | null
  authority_basis: BallotAuthorityBasis | null
  authority_text_version: string | null
  authority_ack_by: string | null
  authority_ack_at: string | null
  opened_at: string | null
  closed_at: string | null
}

export interface BallotOptionRow {
  id: string
  ballot_id: string
  label: string
  position: number
}

export interface BallotResultsRpc {
  homes_voted: number
  ballots_in_box: number
  matches: boolean
  options: { option_id: string; label: string; position: number; votes: number }[]
}
