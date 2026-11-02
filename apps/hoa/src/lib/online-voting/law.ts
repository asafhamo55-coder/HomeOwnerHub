/**
 * BL-156: what the board must acknowledge before an online ballot opens.
 * Pure and client-safe. Citations come from lib/elections/law.ts, which
 * checks every quote against the official fixtures. Never legal advice.
 */
import {
  FL_ABSENTEE_ENVELOPES,
  FL_ONE_BALLOT_PER_PARCEL,
  GA_CO_OWNERS,
  electionJurisdiction,
  type ElectionJurisdiction,
  type StatuteCitation,
} from '@/lib/elections/law'

/** Bump when the acknowledgement wording changes; stored with each opened ballot. */
export const ACK_TEXT_VERSION = 'online-vote-2026-11'

export type OnlineVotingSupport = 'supported' | 'not_supported'

export interface OnlineVotingRule {
  jurisdiction: ElectionJurisdiction
  support: OnlineVotingSupport
  /** Plain words shown above the acknowledgement. */
  summary: string
  citations: StatuteCitation[]
}

export function onlineVotingRule(state: string | null | undefined): OnlineVotingRule {
  const j = electionJurisdiction(state)
  switch (j) {
    case 'GA':
      return {
        jurisdiction: j,
        support: 'supported',
        summary:
          'Georgia’s Property Owners’ Association Act lets an owner vote by proxy, ballot or written consent, but the text we have does not say electronic voting is allowed. Your bylaws decide. Confirm them before you open this ballot.',
        citations: [GA_CO_OWNERS],
      }
    case 'FL':
      return {
        jurisdiction: j,
        support: 'supported',
        summary:
          'Florida allows absentee secret ballots only if your governing documents permit them. Each owner gets one ballot per home; a second ballot for the same home is disqualified. Confirm your documents allow online ballots before you open this one.',
        citations: [FL_ABSENTEE_ENVELOPES, FL_ONE_BALLOT_PER_PARCEL],
      }
    case 'CA':
    case 'TX':
      return {
        jurisdiction: j,
        support: 'not_supported',
        summary:
          'Your state has inspector, envelope or signed-ballot rules that online voting here does not meet yet. Use the paper election kit and ask your association’s attorney.',
        citations: [],
      }
    default:
      return {
        jurisdiction: j,
        support: 'supported',
        summary:
          'HomeownerHub does not have your state’s election rules loaded. Check your declaration, bylaws and state law, and ask your association’s attorney, before you open this ballot.',
        citations: [],
      }
  }
}

/** The statements the board ticks. All must be true to open. */
export const ACK_STATEMENTS: readonly { id: string; text: string }[] = [
  { id: 'allowed', text: 'Our governing documents or our state’s law allow owners to vote electronically on this.' },
  { id: 'one_vote', text: 'Each home gets one vote, and any co-owner may cast it. This matches our documents.' },
  { id: 'notice', text: 'We have given, or will give, every owner the notice our documents require.' },
  { id: 'secret', text: 'We understand votes are secret and nobody, including the board, can see them until voting ends.' },
]
