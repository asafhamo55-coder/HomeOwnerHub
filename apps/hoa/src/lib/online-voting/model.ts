/**
 * BL-156: pure rules for an online ballot. The database enforces the same
 * rules (migrations/0075); this gives the board and voter plain-word errors
 * before a call is made.
 */
import { ACK_STATEMENTS } from './law'

export const MAX_OPTIONS = 40
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type BallotKind = 'election' | 'question'

export interface DraftInput {
  kind: BallotKind
  title: string
  maxSelections: number
  options: string[]
  opensAt: string
  closesAt: string
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

const clean = (s: unknown) =>
  typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : ''

/** A draft as the database will see it, or a plain-word reason it can't be saved. */
export function checkDraft(input: DraftInput, nowMs: number): Checked<DraftInput> {
  const title = clean(input.title)
  if (title.length < 1 || title.length > 200) return { ok: false, error: 'Give the ballot a short title.' }
  if (input.kind !== 'election' && input.kind !== 'question') return { ok: false, error: 'Choose what kind of vote this is.' }
  const options = input.options.map(clean).filter((o) => o.length > 0)
  if (options.some((o) => o.length > 120)) return { ok: false, error: 'Each choice must be 120 characters or fewer.' }
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { ok: false, error: 'Each choice can be listed once.' }
  if (options.length > MAX_OPTIONS) return { ok: false, error: `A ballot can list up to ${MAX_OPTIONS} choices.` }
  const max = input.kind === 'question' ? 1 : input.maxSelections
  if (!Number.isInteger(max) || max < 1 || max > 25) return { ok: false, error: 'Enter how many seats are open (1 to 25).' }
  if (options.length < 2 || options.length <= max) {
    return { ok: false, error: 'A vote needs more choices than seats. If there are no more candidates than seats, no election is needed.' }
  }
  const o = Date.parse(input.opensAt)
  const c = Date.parse(input.closesAt)
  if (!Number.isFinite(o) || !Number.isFinite(c)) return { ok: false, error: 'Choose when voting opens and closes.' }
  if (c <= o) return { ok: false, error: 'Voting must close after it opens.' }
  if (c <= nowMs) return { ok: false, error: 'The closing time is already past.' }
  return { ok: true, value: { kind: input.kind, title, maxSelections: max, options, opensAt: input.opensAt, closesAt: input.closesAt } }
}

/** True only when every acknowledgement statement is ticked. */
export function acknowledgementComplete(ticked: readonly string[]): boolean {
  const set = new Set(ticked)
  return ACK_STATEMENTS.every((s) => set.has(s.id))
}

/** A voter's picks against the ballot's rules. */
export function checkSelections(selected: readonly string[], optionIds: readonly string[], max: number): Checked<string[]> {
  const unique = [...new Set(selected)]
  if (unique.length !== selected.length) return { ok: false, error: 'Each choice can be picked once.' }
  if (unique.length === 0) return { ok: false, error: 'Pick at least one choice.' }
  if (unique.length > max) return { ok: false, error: max === 1 ? 'Pick one choice.' : `Pick up to ${max} choices.` }
  const valid = new Set(optionIds)
  if (unique.some((id) => !valid.has(id))) return { ok: false, error: 'That choice is not on this ballot.' }
  return { ok: true, value: unique }
}

export type VotingWindow = 'not_yet' | 'open' | 'ended'

export function votingWindow(opensAt: string, closesAt: string, nowMs: number): VotingWindow {
  if (nowMs < Date.parse(opensAt)) return 'not_yet'
  return nowMs < Date.parse(closesAt) ? 'open' : 'ended'
}

export interface OptionResult {
  optionId: string
  label: string
  votes: number
  outcome: 'elected' | 'tied' | 'not_elected'
}

/** Plurality over ballot_results(). Ties across the last seat are flagged, never broken. */
export function rankResults(
  options: { option_id: string; label: string; position: number; votes: number }[],
  seats: number,
): OptionResult[] {
  const sorted = [...options].sort((a, b) => b.votes - a.votes || a.position - b.position)
  const cutoff = sorted.length > seats ? sorted[seats - 1]!.votes : null
  const firstOut = sorted.length > seats ? sorted[seats]!.votes : null
  const tie = cutoff !== null && cutoff === firstOut
  return sorted.map((r, i) => ({
    optionId: r.option_id,
    label: r.label,
    votes: r.votes,
    outcome: tie && r.votes === cutoff ? 'tied' : i < seats ? 'elected' : 'not_elected',
  }))
}
