/**
 * Pure evaluation for the FL § 720.303 compliance check (BL-015): which
 * record categories have a document on file, which are stale, which
 * meetings were added too late for a 14-day notice, and whether each
 * statute quote is in the stored statute text. No I/O — load.ts feeds it.
 */
import { InvalidCitationError, UnsupportedQuoteError, validateCitations } from '@homeowner-portal/workflows/citations'
import {
  FL_RECORDS_CODE_CITATION,
  RECORD_CATEGORIES,
  noticeRuleFor,
  type NoticeRule,
  type RecordCategory,
  type StatuteQuote,
} from './rules'

// ─── Statute text + quote validation ───────────────────────────────

export interface StoredStatute {
  body: string | null
  /** NULL = curated/starter text, not the official verbatim ingestion. */
  source_name: string | null
}

/**
 * The official § 720.303 text, or null when it is not loaded. Curated rows
 * (source_name NULL) do not count: quotes are only ever checked against
 * text the W30 refresh fetched from the official source.
 */
export function officialStatuteText(row: StoredStatute | null | undefined): string | null {
  if (!row || !row.source_name) return null
  const body = row.body?.trim()
  return body ? body : null
}

export type CitationCheck =
  | { kind: 'validated'; subsection: string; quote: string }
  /** Statute text not ingested yet — show no quote, ask to verify. */
  | { kind: 'not_loaded'; subsection: string }
  /** Text is loaded but the quote is not in it (the statute changed). */
  | { kind: 'mismatch'; subsection: string }

/**
 * The W32 validator (validateCitations), applied to one quote: it passes
 * only when the quote occurs in the statute text (whitespace- and
 * case-insensitive, nothing fuzzier).
 */
export function checkQuote(q: StatuteQuote, statuteText: string | null): CitationCheck {
  if (statuteText == null) return { kind: 'not_loaded', subsection: q.subsection }
  try {
    validateCitations(
      [{ refId: FL_RECORDS_CODE_CITATION, quote: q.quote }],
      [{ refId: FL_RECORDS_CODE_CITATION, text: statuteText }],
    )
    return { kind: 'validated', subsection: q.subsection, quote: q.quote }
  } catch (e) {
    if (e instanceof UnsupportedQuoteError || e instanceof InvalidCitationError) {
      return { kind: 'mismatch', subsection: q.subsection }
    }
    throw e
  }
}

// ─── Records ───────────────────────────────────────────────────────

export interface ComplianceDoc {
  source: 'hoa' | 'governing'
  id: string
  title: string
  type: string
  /** ISO date or timestamp: governing effective_date, else created_at. */
  date: string | null
}

export type MatchedBy = 'type' | 'title'

export interface MatchedDoc extends ComplianceDoc {
  matchedBy: MatchedBy
}

export type RecordStatus = 'present' | 'stale' | 'missing' | 'none_on_file'

export interface RecordLine {
  category: RecordCategory
  status: RecordStatus
  /** Matching documents, newest first. */
  matches: MatchedDoc[]
  /** Whole months since the newest match's date, when it has one. */
  ageMonths: number | null
}

/** governing_documents types that are never one of these records. */
const NEVER_A_RECORD = new Set(['state_statute', 'minutes'])

export function matchCategory(category: RecordCategory, doc: ComplianceDoc): MatchedBy | null {
  if (doc.source === 'governing' && NEVER_A_RECORD.has(doc.type)) return null
  const types = doc.source === 'hoa' ? category.match.hoaTypes : category.match.govTypes
  if (types.includes(doc.type)) return 'type'
  if (category.match.titlePatterns.some((re) => re.test(doc.title))) return 'title'
  return null
}

function time(d: string | null): number {
  if (!d) return Number.NEGATIVE_INFINITY
  const t = Date.parse(d)
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
}

/** Whole calendar months from `from` to `to` (UTC), never negative. */
export function monthsBetween(from: Date, to: Date): number {
  let m = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  if (to.getUTCDate() < from.getUTCDate()) m -= 1
  return Math.max(0, m)
}

export function evaluateRecord(category: RecordCategory, docs: readonly ComplianceDoc[], now: Date): RecordLine {
  const matches: MatchedDoc[] = []
  for (const doc of docs) {
    const by = matchCategory(category, doc)
    if (by) matches.push({ ...doc, matchedBy: by })
  }
  matches.sort((a, b) => time(b.date) - time(a.date))

  if (matches.length === 0) {
    return { category, status: category.conditional ? 'none_on_file' : 'missing', matches, ageMonths: null }
  }

  const newest = matches[0]
  const t = time(newest.date)
  const ageMonths = Number.isFinite(t) ? monthsBetween(new Date(t), now) : null
  const stale =
    category.staleAfterMonths != null && ageMonths != null && ageMonths > category.staleAfterMonths
  return { category, status: stale ? 'stale' : 'present', matches, ageMonths }
}

export function evaluateRecords(docs: readonly ComplianceDoc[], now: Date): RecordLine[] {
  return RECORD_CATEGORIES.map((c) => evaluateRecord(c, docs, now))
}

// ─── Meetings ──────────────────────────────────────────────────────

export interface ComplianceMeeting {
  id: string
  /** hoa_meeting_minutes.meeting_date, YYYY-MM-DD. */
  meetingDate: string
  meetingType: string | null
  /** hoa_meeting_minutes.created_at — when it was added to HomeownerHub. */
  addedAt: string | null
}

/**
 * HomeownerHub stores no "notice posted" timestamp for a meeting. What it
 * does store is when the meeting was added, which bounds what can be said:
 *
 *   added_late       added fewer days ahead than the rule requires — a
 *                    notice cannot have gone out through HomeownerHub in
 *                    time. Check whether it was posted elsewhere.
 *   maybe_late       board meeting added 2–13 days ahead: fine for the
 *                    48-hour rule, short of 14 days if special assessments
 *                    or parcel-use rules are on the agenda.
 *   not_recorded     added early enough; whether notice was posted, and
 *                    when, is not recorded.
 *   added_after      added after the meeting date (e.g. minutes
 *                    recorded later) — says nothing about notice.
 *   exempt           emergency meeting.
 */
export type NoticeFinding = 'added_late' | 'maybe_late' | 'not_recorded' | 'added_after' | 'exempt'

export interface MeetingLine {
  meeting: ComplianceMeeting
  rule: NoticeRule
  /** Days from being added to the meeting date (UTC calendar days). */
  daysAhead: number | null
  finding: NoticeFinding
  when: 'upcoming' | 'recent'
}

const DAY_MS = 24 * 60 * 60 * 1000

function utcDay(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function todayUtc(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
}

export function daysAhead(meeting: ComplianceMeeting): number | null {
  const meetingDay = utcDay(meeting.meetingDate)
  if (meetingDay == null || !meeting.addedAt) return null
  const added = Date.parse(meeting.addedAt)
  if (Number.isNaN(added)) return null
  const addedDay = todayUtc(new Date(added))
  return Math.round((meetingDay - addedDay) / DAY_MS)
}

export function noticeFinding(rule: NoticeRule, ahead: number | null): NoticeFinding {
  if (rule.minDays == null) return 'exempt'
  if (ahead == null) return 'not_recorded'
  if (ahead < 0) return 'added_after'
  if (ahead < rule.minDays) return 'added_late'
  if (rule.id === 'board_48h' && ahead < 14) return 'maybe_late'
  return 'not_recorded'
}

export interface MeetingWindow {
  pastDays: number
  futureDays: number
}

export const DEFAULT_MEETING_WINDOW: MeetingWindow = { pastDays: 30, futureDays: 90 }

/** Meetings in the window, upcoming first (soonest), then recent (latest). */
export function evaluateMeetings(
  meetings: readonly ComplianceMeeting[],
  now: Date,
  window: MeetingWindow = DEFAULT_MEETING_WINDOW,
): MeetingLine[] {
  const today = todayUtc(now)
  const from = today - window.pastDays * DAY_MS
  const to = today + window.futureDays * DAY_MS
  const lines: MeetingLine[] = []
  for (const meeting of meetings) {
    const day = utcDay(meeting.meetingDate)
    if (day == null || day < from || day > to) continue
    const rule = noticeRuleFor(meeting.meetingType)
    const ahead = daysAhead(meeting)
    lines.push({ meeting, rule, daysAhead: ahead, finding: noticeFinding(rule, ahead), when: day >= today ? 'upcoming' : 'recent' })
  }
  const upcoming = lines.filter((l) => l.when === 'upcoming').sort((a, b) => a.meeting.meetingDate.localeCompare(b.meeting.meetingDate))
  const recent = lines.filter((l) => l.when === 'recent').sort((a, b) => b.meeting.meetingDate.localeCompare(a.meeting.meetingDate))
  return [...upcoming, ...recent]
}

// ─── Report ────────────────────────────────────────────────────────

export type ComplianceGate =
  | { kind: 'not_florida' }
  | { kind: 'florida' }

/** Only Florida associations get the check; anything else (incl. unset) does not. */
export function complianceGate(state: string | null | undefined): ComplianceGate {
  return state === 'FL' ? { kind: 'florida' } : { kind: 'not_florida' }
}

export interface RecordsSummary {
  present: number
  stale: number
  missing: number
  noneOnFile: number
}

export function summarizeRecords(lines: readonly RecordLine[]): RecordsSummary {
  const s: RecordsSummary = { present: 0, stale: 0, missing: 0, noneOnFile: 0 }
  for (const l of lines) {
    if (l.status === 'present') s.present++
    else if (l.status === 'stale') s.stale++
    else if (l.status === 'missing') s.missing++
    else s.noneOnFile++
  }
  return s
}
