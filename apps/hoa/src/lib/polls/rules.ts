/**
 * Pure rules for informal polls (B1 / BL-023, migration 0074). No server
 * imports, no flag: client components and tests use this.
 *
 * A poll is NOT a vote. It has no quorum, no proxy and no legal effect. A
 * binding election has state rules and lives in the elections feature.
 */

export const POLL_NOT_A_VOTE =
  'This is an informal poll. It is not a vote or an election, and it does not bind the board or the association.'

export const POLL_ONE_ANSWER_NOTE =
  'Each home has one answer. Anyone in your home can change it until the poll closes.'

export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 20
export const MAX_TITLE = 140
export const MAX_DESCRIPTION = 2000
export const MAX_OPTION_LABEL = 140

export type PollStatus = 'draft' | 'open' | 'closed'
export type ResultsVisibility = 'after_close' | 'live'

export interface PollInput {
  title: string
  description: string
  /** One option per line. */
  optionsText: string
  allowMultiple: boolean
  resultsVisibility: ResultsVisibility
  /** YYYY-MM-DD, the last day residents can answer. Empty: no end date. */
  closesOn: string
}

export interface ParsedPoll {
  title: string
  description: string | null
  options: string[]
  allowMultiple: boolean
  resultsVisibility: ResultsVisibility
  closesOn: string | null
}

export type ParseResult = { ok: true; value: ParsedPoll } | { ok: false; error: string }

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function parsePollInput(input: PollInput, today: string): ParseResult {
  const title = input.title.trim()
  if (title.length < 3) return { ok: false, error: 'Write the question in at least 3 letters.' }
  if (title.length > MAX_TITLE) return { ok: false, error: `Keep the question under ${MAX_TITLE} characters.` }
  const description = input.description.trim()
  if (description.length > MAX_DESCRIPTION) {
    return { ok: false, error: `Keep the details under ${MAX_DESCRIPTION} characters.` }
  }
  const seen = new Set<string>()
  const options: string[] = []
  for (const line of input.optionsText.split('\n')) {
    const label = line.trim()
    if (!label) continue
    if (label.length > MAX_OPTION_LABEL) {
      return { ok: false, error: `Keep each answer under ${MAX_OPTION_LABEL} characters.` }
    }
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    options.push(label)
  }
  if (options.length < MIN_OPTIONS) return { ok: false, error: 'Add at least two answers, one on each line.' }
  if (options.length > MAX_OPTIONS) return { ok: false, error: `Use no more than ${MAX_OPTIONS} answers.` }
  if (input.resultsVisibility !== 'after_close' && input.resultsVisibility !== 'live') {
    return { ok: false, error: 'Choose when residents see the results.' }
  }
  const closesOn = input.closesOn.trim()
  if (closesOn) {
    if (!DAY.test(closesOn)) return { ok: false, error: 'Pick the last day as a date.' }
    if (closesOn < today) return { ok: false, error: 'The last day cannot be in the past.' }
  }
  return {
    ok: true,
    value: {
      title,
      description: description || null,
      options,
      allowMultiple: input.allowMultiple,
      resultsVisibility: input.resultsVisibility,
      closesOn: closesOn || null,
    },
  }
}

export interface PollLike {
  status: PollStatus
  closes_at: string | null
  results_visibility: ResultsVisibility
}

/** A poll past its end date is finished even if nobody pressed Close. */
export function effectiveStatus(poll: Pick<PollLike, 'status' | 'closes_at'>, now: Date): PollStatus {
  if (poll.status === 'open' && poll.closes_at && new Date(poll.closes_at).getTime() <= now.getTime()) {
    return 'closed'
  }
  return poll.status
}

export function acceptsAnswers(poll: Pick<PollLike, 'status' | 'closes_at'>, now: Date): boolean {
  return effectiveStatus(poll, now) === 'open'
}

/** Mirrors poll_results(): the board always, residents when live or finished. */
export function canSeeResults(poll: PollLike, viewer: 'board' | 'resident', now: Date): boolean {
  if (viewer === 'board') return true
  const eff = effectiveStatus(poll, now)
  if (eff === 'draft') return false
  return poll.results_visibility === 'live' || eff === 'closed'
}

export interface TallyRow {
  optionId: string
  label: string
  votes: number
  /** Whole percent of homes that answered; 0 when nobody has. */
  percent: number
  leading: boolean
}

export function buildTally(
  rows: { option_id: string; label: string; option_position: number; votes: number; homes_answered: number }[],
): { rows: TallyRow[]; homesAnswered: number } {
  const sorted = [...rows].sort((a, b) => a.option_position - b.option_position)
  const homes = sorted.reduce((m, r) => Math.max(m, Number(r.homes_answered)), 0)
  const top = sorted.reduce((m, r) => Math.max(m, Number(r.votes)), 0)
  return {
    homesAnswered: homes,
    rows: sorted.map((r) => ({
      optionId: r.option_id,
      label: r.label,
      votes: Number(r.votes),
      percent: homes > 0 ? Math.round((Number(r.votes) / homes) * 100) : 0,
      leading: top > 0 && Number(r.votes) === top,
    })),
  }
}

export function homesLabel(n: number): string {
  return n === 1 ? '1 home has answered' : `${n} homes have answered`
}
