// BL-116 — every motion the board has recorded, across all meetings.
//
// Where motions live. `hoa_meeting_minutes.motions` (jsonb) is the
// structured home, and the meeting page renders it, but nothing in the app
// writes it today: saving minutes stores `motions: null` and the minutes
// text (`ai_summary`, the canonical minutes) carries the decisions, under
// the "Decisions Made" heading the minutes prompt asks for. So a meeting's
// motions come from:
//
//   1. the structured `motions` array when it has entries (older rows,
//      imports) — read defensively, tolerating every shape seen so far; or
//   2. otherwise, the minutes text, parsed CONSERVATIVELY: bullets under a
//      Decisions / Motions / Votes heading, plus any other line that plainly
//      states a motion ("Motion to…", "moved to…", "Resolved that…").
//      Those rows are labelled "From minutes text" so nobody mistakes a
//      parsed line for a recorded vote.
//
// A meeting dated after today is skipped: its text is an agenda, and a
// "motion to approve the budget" on an agenda has not happened yet.
//
// Pure module apart from `loadAllMotions`; no React.

import { readAll } from '@/lib/supabase/read-all'
import { MEETING_STATUS, MEETING_TYPE } from '@/lib/status/community'

export type MotionResult = 'passed' | 'failed' | 'tabled' | 'withdrawn'
export type MotionSource = 'structured' | 'minutes_text'

export const MOTION_RESULT_LABEL: Record<MotionResult, string> = {
  passed: 'Passed',
  failed: 'Failed',
  tabled: 'Tabled',
  withdrawn: 'Withdrawn',
}
export const MOTION_RESULTS: readonly MotionResult[] = ['passed', 'failed', 'tabled', 'withdrawn']
export const MOTION_SOURCE_LABEL: Record<MotionSource, string> = {
  structured: 'Recorded motion',
  minutes_text: 'From minutes text',
}

export const MOTION_TEXT_MAX = 500

export interface Votes {
  yea: number | null
  nay: number | null
  abstain: number | null
}

export interface ParsedMotion {
  text: string
  movedBy: string | null
  secondedBy: string | null
  result: MotionResult | null
  votes: Votes | null
}

export interface Motion extends ParsedMotion {
  /** `${meetingId}:${index}` — stable for a given minutes text. */
  id: string
  meetingId: string
  meetingDate: string
  meetingType: string | null
  minutesStatus: string | null
  source: MotionSource
}

// ── Shared extraction ────────────────────────────────────────────────

/** Map a free-form outcome to a result. Negative forms are checked first ("did not pass"). */
export function normalizeResult(raw: unknown): MotionResult | null {
  if (typeof raw !== 'string') return null
  const s = raw.toLowerCase()
  if (/\b(failed|fails|defeated|rejected|did not (pass|carry)|not (carried|approved|adopted)|denied)\b/.test(s)) return 'failed'
  if (/\b(withdrawn|withdrew)\b/.test(s)) return 'withdrawn'
  if (/\b(tabled|postponed|deferred)\b/.test(s)) return 'tabled'
  if (/\b(passed|passes|carried|carries|approved|adopted|ratified|unanimous(ly)?)\b/.test(s)) return 'passed'
  return null
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, MOTION_TEXT_MAX)
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? clean(v) : null
}

function count(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1000) return v
  if (typeof v === 'string' && /^\d{1,3}$/.test(v.trim())) return Number(v.trim())
  return null
}

function firstOf(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (o[k] != null) return o[k]
  return undefined
}

// ── 1. Structured jsonb ──────────────────────────────────────────────

/**
 * The structured `motions` column, defensively: not an array → none; a
 * string entry is its text; an object is read through known aliases. An
 * entry with no text is dropped.
 */
export function structuredMotions(raw: unknown): ParsedMotion[] {
  if (!Array.isArray(raw)) return []
  const out: ParsedMotion[] = []
  for (const entry of raw.slice(0, 200)) {
    if (typeof entry === 'string') {
      const text = str(entry)
      if (text) out.push({ text, movedBy: null, secondedBy: null, result: normalizeResult(text), votes: null })
      continue
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const o = entry as Record<string, unknown>
    const text = str(firstOf(o, ['text', 'motion', 'description', 'title', 'summary']))
    if (!text) continue
    const votesObj = o.votes && typeof o.votes === 'object' && !Array.isArray(o.votes) ? (o.votes as Record<string, unknown>) : {}
    const yea = count(firstOf(o, ['yea', 'yes', 'for', 'votes_for', 'ayes']) ?? firstOf(votesObj, ['yea', 'yes', 'for']))
    const nay = count(firstOf(o, ['nay', 'no', 'against', 'votes_against', 'nays']) ?? firstOf(votesObj, ['nay', 'no', 'against']))
    const abstain = count(firstOf(o, ['abstain', 'abstentions', 'abstained']) ?? firstOf(votesObj, ['abstain', 'abstentions']))
    out.push({
      text,
      movedBy: str(firstOf(o, ['moved_by', 'movedBy', 'mover', 'moved'])),
      secondedBy: str(firstOf(o, ['seconded_by', 'secondedBy', 'seconder', 'seconded'])),
      result: normalizeResult(firstOf(o, ['result', 'outcome', 'status', 'disposition'])),
      votes: yea != null || nay != null || abstain != null ? { yea, nay, abstain } : null,
    })
  }
  return out
}

// ── 2. Minutes text ──────────────────────────────────────────────────

const NAME = "[A-Z][A-Za-z.'’-]*(?:\\s+[A-Z][A-Za-z.'’-]*){0,2}"
/** Capitalised words that start a sentence, not a person. */
const NOT_A_NAME = /^(motion|the|it|this|a|an|board|president|treasurer|secretary|director|member|owner|resolved|vote|all|none)\b/i

function name(m: RegExpExecArray | null): string | null {
  const n = m?.[1]?.trim()
  if (!n || NOT_A_NAME.test(n)) return null
  return n
}

export function extractMover(line: string): string | null {
  return (
    name(new RegExp(`\\b(?:moved by|motion (?:made )?by|made by)\\s+(${NAME})`, 'i').exec(line)) ??
    name(new RegExp(`^(${NAME})\\s+(?:moved|made a motion)\\b`).exec(line)) ??
    name(new RegExp(`[.;,]\\s*(${NAME})\\s+(?:moved|made a motion)\\b`).exec(line))
  )
}

export function extractSeconder(line: string): string | null {
  return (
    name(new RegExp(`\\bseconded by\\s+(${NAME})`, 'i').exec(line)) ??
    name(new RegExp(`\\b(${NAME})\\s+seconded\\b`).exec(line))
  )
}

export function extractVotes(line: string): Votes | null {
  const tally = /(?:\bvotes?d?\b\s*:?\s*|\()\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})(?:\s*[-–—]\s*(\d{1,2}))?/i.exec(line)
  if (tally) {
    return { yea: Number(tally[1]), nay: Number(tally[2]), abstain: tally[3] != null ? Number(tally[3]) : null }
  }
  const yea = /\b(\d{1,2})\s+(?:in favou?r|yeas?|ayes?|for)\b/i.exec(line)
  const nay = /\b(\d{1,2})\s+(?:opposed|against|nays?|no)\b/i.exec(line)
  const abs = /\b(\d{1,2})\s+(?:abstain(?:ed|ing|tions?)?)\b/i.exec(line)
  if (!yea && !nay && !abs) return null
  return { yea: yea ? Number(yea[1]) : null, nay: nay ? Number(nay[1]) : null, abstain: abs ? Number(abs[1]) : null }
}

const BULLET = /^\s*(?:[-*•·–—]|\d{1,2}[.)]|[a-z][.)])\s+/
const DECISION_HEADING =
  /^(?:#+\s*)?(?:\d{1,2}[.)]\s*)?(?:decisions?(?:\s+made)?|motions?(?:\s+(?:and|&)\s+votes?)?|votes?(?:\s+taken)?|resolutions?(?:\s+adopted)?|actions?\s+taken)\s*:?\s*$/i
/** Any other heading of the minutes (ends a decisions section). */
const OTHER_HEADING =
  /^(?:#+\s*)?(?:\d{1,2}[.)]\s*)?(?:attendees|attendance|present|topics(?:\s+discussed)?|discussion|action items?|next meeting|call to order|adjourn(?:ment|ed)?|old business|new business|reports?|open forum|owner comments)\b[^.]{0,40}:?\s*$/i
const EXPLICIT_MOTION =
  /\b(?:motion\s+(?:to|that|by|made|was|carried|passed|failed)|moved\s+(?:to|that|by)|made a motion|resolved,?\s+that|be it resolved)\b/i
const NOTHING = /^(?:none|n\/a|no (?:decisions?|motions?|votes?)\b|nothing\b)/i

/**
 * Motions found in a minutes text. Conservative: a bullet under a
 * Decisions/Motions/Votes heading, or any line that plainly states a
 * motion. Headings, "None" and lines under other headings are skipped.
 */
export function motionsFromText(text: string | null | undefined): ParsedMotion[] {
  if (!text) return []
  const out: ParsedMotion[] = []
  let inDecisions = false
  for (const rawLine of text.slice(0, 100_000).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (DECISION_HEADING.test(line)) {
      inDecisions = true
      continue
    }
    if (OTHER_HEADING.test(line)) {
      inDecisions = false
      continue
    }
    const body = clean(line.replace(BULLET, ''))
    if (!body || NOTHING.test(body)) continue
    const isBullet = BULLET.test(line)
    if (!(inDecisions && isBullet) && !EXPLICIT_MOTION.test(body)) continue
    out.push({
      text: body,
      movedBy: extractMover(body),
      secondedBy: extractSeconder(body),
      result: normalizeResult(body),
      votes: extractVotes(body),
    })
    if (out.length >= 200) break
  }
  return out
}

// ── Per meeting ──────────────────────────────────────────────────────

export interface MinutesRow {
  id: string
  meeting_date: string
  meeting_type: string | null
  status: string | null
  motions: unknown
  ai_summary: string | null
}

export function motionsForMeeting(row: MinutesRow): Motion[] {
  const structured = structuredMotions(row.motions)
  const source: MotionSource = structured.length > 0 ? 'structured' : 'minutes_text'
  const parsed = structured.length > 0 ? structured : motionsFromText(row.ai_summary)
  return parsed.map((m, i) => ({
    ...m,
    id: `${row.id}:${i}`,
    meetingId: row.id,
    meetingDate: row.meeting_date,
    meetingType: row.meeting_type,
    minutesStatus: row.status,
    source,
  }))
}

/** Every motion from meetings held on or before `today`, newest meeting first. */
export function collectMotions(rows: MinutesRow[], today: string): Motion[] {
  return rows
    .filter((r) => typeof r.meeting_date === 'string' && r.meeting_date <= today)
    .sort((a, b) => (a.meeting_date < b.meeting_date ? 1 : a.meeting_date > b.meeting_date ? -1 : a.id < b.id ? 1 : -1))
    .flatMap(motionsForMeeting)
}

// ── Filters ──────────────────────────────────────────────────────────

export interface MotionFilters {
  q: string | null
  year: string | null
  result: MotionResult | 'none' | null
}

export const MOTION_SEARCH_MAX = 100

function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return s && s.trim() ? s.trim() : undefined
}

export function parseMotionFilters(sp: Record<string, string | string[] | undefined>): MotionFilters {
  const q = first(sp.q)?.slice(0, MOTION_SEARCH_MAX) ?? null
  const yearRaw = first(sp.year)
  const year = yearRaw && /^\d{4}$/.test(yearRaw) ? yearRaw : null
  const resultRaw = first(sp.result)
  const result =
    resultRaw === 'none' ? 'none' : resultRaw && (MOTION_RESULTS as readonly string[]).includes(resultRaw) ? (resultRaw as MotionResult) : null
  return { q, year, result }
}

export function motionFiltersToSearch(f: MotionFilters): URLSearchParams {
  const qs = new URLSearchParams()
  if (f.q) qs.set('q', f.q)
  if (f.year) qs.set('year', f.year)
  if (f.result) qs.set('result', f.result)
  return qs
}

/** Case-insensitive match on the motion text, mover and seconder. */
export function motionMatches(m: ParsedMotion, needle: string): boolean {
  const n = needle.trim().toLowerCase()
  if (!n) return true
  return [m.text, m.movedBy, m.secondedBy].some((v) => !!v && v.toLowerCase().includes(n))
}

export function filterMotions(all: Motion[], f: MotionFilters): Motion[] {
  return all.filter(
    (m) =>
      (!f.year || m.meetingDate.startsWith(f.year)) &&
      (!f.result || (f.result === 'none' ? m.result === null : m.result === f.result)) &&
      (!f.q || motionMatches(m, f.q)),
  )
}

export function motionYears(all: Motion[]): string[] {
  return [...new Set(all.map((m) => m.meetingDate.slice(0, 4)))].sort().reverse()
}

// ── Labels and CSV ───────────────────────────────────────────────────

export function meetingTypeLabel(type: string | null): string {
  return `${type ? (MEETING_TYPE[type] ?? type) : 'Board'} meeting`
}

export function minutesStatusLabel(status: string | null): string {
  const s = status ?? 'draft'
  return (MEETING_STATUS.labels as Record<string, string>)[s] ?? s
}

export function resultLabel(r: MotionResult | null): string {
  return r ? MOTION_RESULT_LABEL[r] : 'Not recorded'
}

export function votesLabel(v: Votes | null): string | null {
  if (!v) return null
  const parts = [
    v.yea != null ? `${v.yea} for` : null,
    v.nay != null ? `${v.nay} against` : null,
    v.abstain != null ? `${v.abstain} abstaining` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

export const MOTION_CSV_HEADER = [
  'Meeting date',
  'Meeting',
  'Minutes',
  'Motion',
  'Moved by',
  'Seconded by',
  'Result',
  'For',
  'Against',
  'Abstaining',
  'Source',
  'Link',
] as const

export function motionCsvRow(m: Motion): Array<string | number | null> {
  return [
    m.meetingDate,
    meetingTypeLabel(m.meetingType),
    minutesStatusLabel(m.minutesStatus),
    m.text,
    m.movedBy,
    m.secondedBy,
    resultLabel(m.result),
    m.votes?.yea ?? null,
    m.votes?.nay ?? null,
    m.votes?.abstain ?? null,
    MOTION_SOURCE_LABEL[m.source],
    `/meetings/${m.meetingId}`,
  ]
}

// ── Load ─────────────────────────────────────────────────────────────

export const MOTION_MINUTES_COLUMNS = 'id, meeting_date, meeting_type, status, motions, ai_summary'

interface MinutesQuery extends PromiseLike<{ data: MinutesRow[] | null; error: { code?: string } | null }> {
  select(cols: string): MinutesQuery
  eq(col: string, value: unknown): MinutesQuery
  is(col: string, value: null): MinutesQuery
  order(col: string, opts: { ascending: boolean }): MinutesQuery
  range(from: number, to: number): MinutesQuery
}

export interface MinutesClient {
  from(table: 'hoa_meeting_minutes'): MinutesQuery
}

/**
 * Every live meeting's minutes for the org (RLS client; 0063 makes
 * hoa_meeting_minutes board-only), read in full (RC-9), then flattened.
 * Throws on a failed read so the page shows LoadFailed, never "no motions".
 */
export async function loadAllMotions(db: MinutesClient, orgId: string, today: string): Promise<Motion[]> {
  const rows = await readAll<MinutesRow>(
    (from, to) =>
      db
        .from('hoa_meeting_minutes')
        .select(MOTION_MINUTES_COLUMNS)
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('meeting_date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    (e) => new Error(`hoa_meeting_minutes read failed (${e.code ?? 'no code'})`),
    20_000,
  )
  return collectMotions(rows, today)
}
