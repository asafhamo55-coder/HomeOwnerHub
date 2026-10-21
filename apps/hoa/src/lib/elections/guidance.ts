/**
 * BL-141: the planner's plain-language verdicts — what the number of
 * candidates means, what a candidate's ledger means, how winners are read —
 * per state. Pure and browser-safe. Every quote comes from ./law.ts.
 */

import { centsLabel } from '@/lib/dues-rates/model'
import { formatDay } from '@/lib/money/format'
import {
  CA_ACCLAMATION,
  CA_ACCLAMATION_ACKNOWLEDGE,
  CA_ACCLAMATION_BOARD_VOTE,
  CA_ACCLAMATION_INITIAL,
  CA_ACCLAMATION_LAST_ELECTION,
  CA_ACCLAMATION_REMINDER,
  CA_CURRENT_IN_ASSESSMENTS,
  CA_NOT_FOR_FINES,
  FL_ANY_PARCEL,
  FL_DELINQUENT_CANDIDATE,
  FL_NO_ELECTION,
  FL_PLURALITY,
  FL_SEATED_WITHOUT_QUORUM,
  TX_UNCONTESTED,
  type ElectionJurisdiction,
  type ElectionNote,
} from './law'
import type { CandidateCheck, Contest, Tally } from './model'

const seatsWord = (n: number) => `${n} ${n === 1 ? 'seat' : 'seats'}`
const candidatesWord = (n: number) => `${n} ${n === 1 ? 'candidate' : 'candidates'}`

/** What the number of candidates on the ballot means for this state. */
export function contestNote(j: ElectionJurisdiction, c: Contest): ElectionNote {
  if (c.state === 'needs_seats') {
    return { tone: 'info', text: 'Enter how many seats are up for election to see whether a vote is needed.', citations: [] }
  }
  const count = `${candidatesWord(c.onBallot)} on the ballot for ${seatsWord(c.seats!)}`
  const open = c.state === 'short' ? ` ${seatsWord(c.openSeats)} ${c.openSeats === 1 ? 'has' : 'have'} no candidate; check your bylaws for how an unfilled seat is filled.` : ''
  if (c.state === 'contested') {
    if (j === 'FL') {
      return { tone: 'info', text: `${count}: an election is held. Unless your documents say otherwise, the candidates with the most votes win.`, citations: [FL_NO_ELECTION, FL_PLURALITY] }
    }
    if (j === 'TX') return { tone: 'info', text: `${count}: a contested race, so each vote must be in writing and signed (or cast under your secret-ballot rules).`, citations: [] }
    return { tone: 'info', text: `${count}: a contested election.`, citations: [] }
  }
  switch (j) {
    case 'FL':
      return {
        tone: 'info',
        text: `${count}: no election is needed. Unless your bylaws require nominations from the floor, the candidates take their seats at the annual meeting, even if it doesn’t reach quorum.${open}`,
        citations: [FL_NO_ELECTION, FL_SEATED_WITHOUT_QUORUM],
      }
    case 'CA':
      return {
        tone: 'warn',
        text: `${count}. You may seat them by acclamation only if every § 5103 condition is met: a regular election in the last three years, the 90-day and reminder notices, written replies to each nomination within 7 business days, and a board vote at a meeting whose agenda names each candidate. Otherwise, hold the election.${open}`,
        citations: [CA_ACCLAMATION, CA_ACCLAMATION_LAST_ELECTION, CA_ACCLAMATION_INITIAL, CA_ACCLAMATION_REMINDER, CA_ACCLAMATION_ACKNOWLEDGE, CA_ACCLAMATION_BOARD_VOTE],
      }
    case 'TX':
      return { tone: 'info', text: `${count}: an uncontested race, so written and signed ballots aren’t required.${open}`, citations: [TX_UNCONTESTED] }
    case 'GA':
      return {
        tone: 'info',
        text: `${count}. Georgia’s Act (as loaded) doesn’t say whether a vote is still needed when there are no more candidates than seats. Check your bylaws.${open}`,
        citations: [],
      }
    default:
      return { tone: 'info', text: `${count}. Check your bylaws for whether a vote is still needed.${open}`, citations: [] }
  }
}

export interface LedgerVerdict {
  tone: 'ok' | 'warn' | 'info'
  /** Short pill text. */
  label: string
  /** One sentence for the board. */
  text: string
}

/** One candidate's ledger on the check day, in this state's terms. Board-only. */
export function ledgerVerdict(j: ElectionJurisdiction, c: CandidateCheck, day: string): LedgerVerdict {
  const on = formatDay(day)
  if (c.state === 'no_home') return { tone: 'info', label: 'No home linked', text: 'Link the candidate’s home to check the ledger.' }
  if (c.state === 'unknown') return { tone: 'info', label: 'Home not found', text: 'The linked home isn’t on the roster any more. Check the ledger by hand.' }
  if (c.state === 'clear') return { tone: 'ok', label: 'Nothing past due', text: `Nothing past due on ${on} on the linked home.` }
  const owed = `${centsLabel(c.pastDueCents)} past due on ${on} (oldest ${c.daysPastDue} ${c.daysPastDue === 1 ? 'day' : 'days'} late)`
  switch (j) {
    case 'FL':
      return { tone: 'warn', label: 'Delinquent', text: `${owed}. A candidate who owes anything on the last day to nominate can’t run or be listed on the ballot.` }
    case 'CA':
      return {
        tone: 'info',
        label: 'Past due',
        text: `${owed}. This matters only if your bylaws or election rules require nominees to be current in regular and special assessments, and never for fines, late charges or collection costs.`,
      }
    case 'GA':
      return { tone: 'info', label: 'Past due', text: `${owed}. Georgia’s Act (as loaded) doesn’t bar a delinquent owner from running. Check your bylaws.` }
    default:
      return { tone: 'info', label: 'Past due', text: `${owed}. Check your bylaws for whether this affects the nomination.` }
  }
}

/** The statute behind the ledger check, for the candidate card. */
export function ledgerRule(j: ElectionJurisdiction): ElectionNote | null {
  switch (j) {
    case 'FL':
      return {
        tone: 'warn',
        text: 'The check reads the home linked to each candidate. A candidate who owes on any other home, or a fine not on the ledger, can’t run either: check those by hand.',
        citations: [FL_DELINQUENT_CANDIDATE, FL_ANY_PARCEL],
      }
    case 'CA':
      return {
        tone: 'info',
        text: 'A nominee can be disqualified for unpaid regular or special assessments only if your bylaws or election rules say so, and not while they pay under protest or keep to a payment plan.',
        citations: [CA_CURRENT_IN_ASSESSMENTS, CA_NOT_FOR_FINES],
      }
    default:
      return null
  }
}

/** How the tally is read. */
export function tallyNote(j: ElectionJurisdiction, t: Tally): ElectionNote {
  const tie = t.tieAtCutoff ? ' Candidates are tied for the last seat: your bylaws decide how a tie is broken. HomeownerHub doesn’t pick a winner.' : ''
  if (j === 'FL') {
    return { tone: t.tieAtCutoff ? 'warn' : 'info', text: `Unless your governing documents say otherwise, the candidates with the most votes win.${tie}`, citations: [FL_PLURALITY] }
  }
  return {
    tone: t.tieAtCutoff ? 'warn' : 'info',
    text: `Ranked by votes. Check your bylaws for how winners are decided (for example, cumulative voting).${tie}`,
    citations: [],
  }
}
