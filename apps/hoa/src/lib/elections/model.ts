/**
 * BL-141 — the election planner, paper-first. Pure and browser-safe.
 * Signing and storage: ./store.ts. The law: ./law.ts. Dates: ./timeline.ts.
 *
 * For the election of directors at a members' meeting (the annual meeting,
 * or a special meeting the board confirmed is the members' — the same gate
 * as the BL-122 quorum kit). The board records the seats, the nomination
 * deadline, the day ballots go out, the inspectors (CA) and the candidates;
 * after the count, the votes and the day the results were announced. No
 * e-voting: ballots are printed, mailed or handed out, and counted by hand.
 *
 * STORAGE. No migration (decision: docs/decisions/2026-10-21-election-
 * planner-no-migration.md). Like the quorum kit, the election lives in the
 * primary association's compliance_settings[ELECTIONS_KEY], keyed by
 * meeting id, signed with the server-only secret so only a board save
 * counts (any org member could PATCH compliance_settings before 0063).
 *
 * WHAT IS STORED, and why it is safe in compliance_settings (which any org
 * member may be able to read): the number of seats and the dates; the
 * inspectors' names (CA § 5115(b) puts the return address — the
 * inspector — in the general notice to every member); each candidate's
 * name as it appears on the ballot (CA § 5115(b)(4) and every state's
 * ballot show it to every member), the home id they were nominated from
 * (an id, never an address), the day nominated, on/off the ballot, and
 * the vote count after the tally (results go to every member). NEVER a
 * reason a candidate came off the ballot, a balance, an email or a phone:
 * the ledger check is computed on each page load and shown to the board
 * only.
 *
 * LIMITS: last write wins (the whole compliance_settings object is read,
 * changed and written back); at most MAX_STORED_ELECTIONS meetings keep an
 * election (the oldest-updated is dropped).
 */

export const MAX_SEATS = 25
export const MAX_CANDIDATES = 40
export const MAX_INSPECTORS = 3
export const MAX_NAME_LENGTH = 80
export const MAX_VOTES = 100_000

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/

export function isCalendarDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY.test(v)) return false
  const [y, m, d] = v.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export interface Candidate {
  id: string
  /** As it appears on the ballot. */
  name: string
  /** The home the candidate was nominated from (hoa_properties.id), for the ledger check. */
  propertyId: string | null
  nominatedOn: string | null
  /** false = withdrawn or taken off the ballot (no reason is stored). */
  onBallot: boolean
  /** Recorded after the count; null before. */
  votes: number | null
}

export interface Election {
  seats: number | null
  nominationDeadline: string | null
  /** The day ballots are mailed or handed out (CA § 5115(c); elsewhere if the bylaws use mailed ballots). */
  ballotsOutOn: string | null
  /** CA § 5110: one or three inspectors of elections. Elsewhere: tellers, optional. */
  inspectors: string[]
  candidates: Candidate[]
  resultsAnnouncedOn: string | null
  /** CA § 5115(d): whether the count met quorum; null = not recorded / not required. */
  quorumReached: boolean | null
  /** CA § 5115(d)(2): the reconvened meeting when quorum was not reached. */
  reconvenedOn: string | null
}

export const EMPTY_ELECTION: Election = {
  seats: null,
  nominationDeadline: null,
  ballotsOutOn: null,
  inspectors: [],
  candidates: [],
  resultsAnnouncedOn: null,
  quorumReached: null,
  reconvenedOn: null,
}

// ─── Input cleaning ──────────────────────────────────────────────────

/** A name as typed: trimmed, inner whitespace collapsed; null when empty, too long or not text. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (s.length === 0 || s.length > MAX_NAME_LENGTH) return null
  return s
}

export function isValidSeats(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_SEATS
}

export function isValidVotes(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_VOTES
}

// ─── Changes ─────────────────────────────────────────────────────────

export type ElectionChange =
  | { kind: 'setup'; seats: number | null; nominationDeadline: string | null; ballotsOutOn: string | null }
  | { kind: 'inspectors'; names: string[] }
  | { kind: 'add_candidate'; name: string; propertyId: string | null; nominatedOn: string | null }
  | { kind: 'candidate_on_ballot'; candidateId: string; onBallot: boolean }
  | { kind: 'remove_candidate'; candidateId: string }
  | { kind: 'results'; votes: Record<string, number>; announcedOn: string | null }
  | { kind: 'clear_results' }
  | { kind: 'quorum'; reached: boolean | null; reconvenedOn: string | null }

/** Shape check for a change from the client (a server action's input is untrusted). */
export function isElectionChange(c: unknown): c is ElectionChange {
  if (typeof c !== 'object' || c === null || Array.isArray(c)) return false
  const v = c as Record<string, unknown>
  const dayOrNull = (x: unknown) => x === null || isCalendarDay(x)
  switch (v.kind) {
    case 'setup':
      return (v.seats === null || isValidSeats(v.seats)) && dayOrNull(v.nominationDeadline) && dayOrNull(v.ballotsOutOn)
    case 'inspectors':
      return Array.isArray(v.names) && v.names.length <= MAX_INSPECTORS && v.names.every((n) => cleanName(n) !== null)
    case 'add_candidate':
      return (
        cleanName(v.name) !== null &&
        (v.propertyId === null || (typeof v.propertyId === 'string' && UUID.test(v.propertyId))) &&
        dayOrNull(v.nominatedOn)
      )
    case 'candidate_on_ballot':
      return typeof v.candidateId === 'string' && UUID.test(v.candidateId) && typeof v.onBallot === 'boolean'
    case 'remove_candidate':
      return typeof v.candidateId === 'string' && UUID.test(v.candidateId)
    case 'results': {
      if (typeof v.votes !== 'object' || v.votes === null || Array.isArray(v.votes)) return false
      const entries = Object.entries(v.votes as Record<string, unknown>)
      return entries.length <= MAX_CANDIDATES && entries.every(([k, n]) => UUID.test(k) && isValidVotes(n)) && dayOrNull(v.announcedOn)
    }
    case 'clear_results':
      return true
    case 'quorum':
      return (v.reached === null || typeof v.reached === 'boolean') && dayOrNull(v.reconvenedOn)
    default:
      return false
  }
}

export type ApplyResult = { ok: true; election: Election } | { ok: false; error: string }

/**
 * The election after one change, or why the change can't be made.
 * `meetingDate` is the election (count) day; `newId` names a new candidate.
 * Never mutates.
 */
export function applyElectionChange(e: Election, change: ElectionChange, ctx: { meetingDate: string; newId: string }): ApplyResult {
  const { meetingDate } = ctx
  switch (change.kind) {
    case 'setup': {
      if (change.nominationDeadline && change.nominationDeadline > meetingDate) {
        return { ok: false, error: 'Nominations must close on or before the meeting day.' }
      }
      if (change.ballotsOutOn && change.ballotsOutOn > meetingDate) {
        return { ok: false, error: 'Ballots must go out before the meeting day.' }
      }
      return { ok: true, election: { ...e, seats: change.seats, nominationDeadline: change.nominationDeadline, ballotsOutOn: change.ballotsOutOn } }
    }
    case 'inspectors': {
      const names = change.names.map(cleanName).filter((n): n is string => n !== null)
      const lower = names.map((n) => n.toLowerCase())
      if (new Set(lower).size !== lower.length) return { ok: false, error: 'Each inspector is listed once.' }
      const candidates = new Set(e.candidates.map((c) => c.name.toLowerCase()))
      if (lower.some((n) => candidates.has(n))) return { ok: false, error: 'A candidate can’t be an inspector of the election.' }
      return { ok: true, election: { ...e, inspectors: names } }
    }
    case 'add_candidate': {
      const name = cleanName(change.name)
      if (!name) return { ok: false, error: 'Enter the candidate’s name as it should appear on the ballot.' }
      if (e.candidates.length >= MAX_CANDIDATES) return { ok: false, error: `An election can list up to ${MAX_CANDIDATES} candidates.` }
      if (e.candidates.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        return { ok: false, error: 'That candidate is already listed.' }
      }
      if (e.inspectors.some((n) => n.toLowerCase() === name.toLowerCase())) {
        return { ok: false, error: 'That person is listed as an inspector. A candidate can’t be an inspector.' }
      }
      if (change.nominatedOn && change.nominatedOn > meetingDate) {
        return { ok: false, error: 'The nomination date can’t be after the meeting.' }
      }
      const c: Candidate = { id: ctx.newId, name, propertyId: change.propertyId, nominatedOn: change.nominatedOn, onBallot: true, votes: null }
      return { ok: true, election: { ...e, candidates: [...e.candidates, c] } }
    }
    case 'candidate_on_ballot': {
      if (!e.candidates.some((c) => c.id === change.candidateId)) return { ok: false, error: 'That candidate isn’t on this election.' }
      return {
        ok: true,
        election: {
          ...e,
          candidates: e.candidates.map((c) => (c.id === change.candidateId ? { ...c, onBallot: change.onBallot, votes: change.onBallot ? c.votes : null } : c)),
        },
      }
    }
    case 'remove_candidate': {
      if (!e.candidates.some((c) => c.id === change.candidateId)) return { ok: false, error: 'That candidate isn’t on this election.' }
      if (e.candidates.some((c) => c.id === change.candidateId && c.votes !== null)) {
        return { ok: false, error: 'Votes are recorded for this candidate. Clear the results first.' }
      }
      return { ok: true, election: { ...e, candidates: e.candidates.filter((c) => c.id !== change.candidateId) } }
    }
    case 'results': {
      const onBallot = e.candidates.filter((c) => c.onBallot)
      if (onBallot.length === 0) return { ok: false, error: 'Add the candidates on the ballot first.' }
      const ids = new Set(onBallot.map((c) => c.id))
      if (Object.keys(change.votes).some((id) => !ids.has(id))) return { ok: false, error: 'Votes can only be recorded for candidates on the ballot.' }
      if (onBallot.some((c) => change.votes[c.id] === undefined)) return { ok: false, error: 'Enter the votes for every candidate on the ballot (0 if none).' }
      if (change.announcedOn && change.announcedOn < meetingDate) {
        return { ok: false, error: 'Results can’t be announced before the meeting.' }
      }
      return {
        ok: true,
        election: {
          ...e,
          resultsAnnouncedOn: change.announcedOn,
          candidates: e.candidates.map((c) => ({ ...c, votes: c.onBallot ? change.votes[c.id]! : null })),
        },
      }
    }
    case 'clear_results':
      return { ok: true, election: { ...e, resultsAnnouncedOn: null, candidates: e.candidates.map((c) => ({ ...c, votes: null })) } }
    case 'quorum': {
      if (change.reached !== false && change.reconvenedOn) {
        return { ok: false, error: 'A reconvened meeting is only for a count that didn’t reach quorum.' }
      }
      if (change.reconvenedOn && change.reconvenedOn <= meetingDate) {
        return { ok: false, error: 'The reconvened meeting must be after the first one.' }
      }
      return { ok: true, election: { ...e, quorumReached: change.reached, reconvenedOn: change.reconvenedOn } }
    }
  }
}

// ─── Contest and results ─────────────────────────────────────────────

/**
 * needs_seats — the number of seats isn't entered.
 * contested   — more candidates on the ballot than seats.
 * uncontested — exactly as many candidates as seats.
 * short       — fewer candidates than seats (some seats stay open).
 */
export type ContestState = 'needs_seats' | 'contested' | 'uncontested' | 'short'

export interface Contest {
  state: ContestState
  seats: number | null
  onBallot: number
  /** Seats left open when there are fewer candidates than seats. */
  openSeats: number
}

export function contestOf(e: Election): Contest {
  const onBallot = e.candidates.filter((c) => c.onBallot).length
  if (e.seats === null) return { state: 'needs_seats', seats: null, onBallot, openSeats: 0 }
  if (onBallot > e.seats) return { state: 'contested', seats: e.seats, onBallot, openSeats: 0 }
  if (onBallot === e.seats) return { state: 'uncontested', seats: e.seats, onBallot, openSeats: 0 }
  return { state: 'short', seats: e.seats, onBallot, openSeats: e.seats - onBallot }
}

export interface TallyRow {
  candidate: Candidate
  votes: number
  rank: number
  /** elected — within the seats; tied — level with others across the last seat; not_elected — below. */
  outcome: 'elected' | 'tied' | 'not_elected'
}

export interface Tally {
  rows: TallyRow[]
  /** Votes for every on-ballot candidate are recorded. */
  complete: boolean
  /** Candidates tied for the last seat(s): the bylaws decide (a runoff, lots, …). */
  tieAtCutoff: boolean
  totalVotes: number
}

/** Most votes first (plurality). Ties across the last seat are flagged, never broken. */
export function tallyOf(e: Election): Tally {
  const onBallot = e.candidates.filter((c) => c.onBallot)
  const complete = onBallot.length > 0 && onBallot.every((c) => c.votes !== null)
  const sorted = onBallot
    .map((c) => ({ candidate: c, votes: c.votes ?? 0 }))
    .sort((a, b) => b.votes - a.votes || a.candidate.name.localeCompare(b.candidate.name))
  const seats = e.seats ?? 0
  const cutoff = seats > 0 && sorted.length > seats ? sorted[seats - 1]!.votes : null
  const firstOut = seats > 0 && sorted.length > seats ? sorted[seats]!.votes : null
  const tieAtCutoff = cutoff !== null && firstOut !== null && cutoff === firstOut
  let rank = 0
  let prev: number | null = null
  const rows: TallyRow[] = sorted.map((r, i) => {
    if (prev === null || r.votes !== prev) rank = i + 1
    prev = r.votes
    let outcome: TallyRow['outcome']
    if (tieAtCutoff && r.votes === cutoff) outcome = 'tied'
    else if (i < seats) outcome = 'elected'
    else outcome = 'not_elected'
    return { candidate: r.candidate, votes: r.votes, rank, outcome }
  })
  return { rows, complete, tieAtCutoff, totalVotes: sorted.reduce((n, r) => n + r.votes, 0) }
}

// ─── Candidate ledger check ──────────────────────────────────────────

export interface LedgerFacts {
  pastDueCents: number
  daysPastDue: number
}

/**
 * clear     — nothing past due on the ledger on the check day.
 * past_due  — something past due on that day.
 * no_home   — no home linked, so the ledger can't be read.
 * unknown   — the home isn't on the roster any more.
 */
export type LedgerState = 'clear' | 'past_due' | 'no_home' | 'unknown'

export interface CandidateCheck {
  candidateId: string
  state: LedgerState
  pastDueCents: number
  daysPastDue: number
}

/** Each candidate against the ledger as of the check day (`byHome`: property id → facts on that day). */
export function candidateChecks(candidates: readonly Candidate[], byHome: ReadonlyMap<string, LedgerFacts>): CandidateCheck[] {
  return candidates.map((c) => {
    if (!c.propertyId) return { candidateId: c.id, state: 'no_home', pastDueCents: 0, daysPastDue: 0 }
    const f = byHome.get(c.propertyId)
    if (!f) return { candidateId: c.id, state: 'unknown', pastDueCents: 0, daysPastDue: 0 }
    return { candidateId: c.id, state: f.pastDueCents > 0 ? 'past_due' : 'clear', pastDueCents: f.pastDueCents, daysPastDue: f.daysPastDue }
  })
}

/**
 * The day the ledger check is made: FL § 720.306(9)(b) "the day that he or
 * she could last nominate" — the nomination deadline, or the meeting day
 * when nominations are taken from the floor. Never after today (a future
 * deadline is checked as of today and re-checked on the day).
 */
export function ledgerCheckDay(e: Pick<Election, 'nominationDeadline'>, meetingDate: string, today: string): { day: string; provisional: boolean } {
  const target = e.nominationDeadline ?? meetingDate
  return target > today ? { day: today, provisional: true } : { day: target, provisional: false }
}
