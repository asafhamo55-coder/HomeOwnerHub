// Pure helpers for the board meetings list: the ?view= filter and the summary
// strip. No server imports, so a 'use client' file may use it too.

import { todayIn } from '../association-time'

export type MeetingsView = 'all' | 'upcoming' | 'past' | 'needs-minutes'

export const MEETINGS_VIEWS: readonly MeetingsView[] = ['all', 'upcoming', 'past', 'needs-minutes']

/** Unknown or missing values fall back to the default view, All. */
export function parseMeetingsView(raw: string | null | undefined): MeetingsView {
  return (MEETINGS_VIEWS as readonly string[]).includes(raw ?? '') ? (raw as MeetingsView) : 'all'
}

export interface MeetingSummaryRow {
  meeting_date: string
  meeting_type: string | null
  status: string | null
  approved_at: string | null
}

/** Minutes count as approved when the status says so or an approval time is stamped. */
export function minutesApproved(m: Pick<MeetingSummaryRow, 'status' | 'approved_at'>): boolean {
  return m.status === 'approved' || m.approved_at != null
}

function dayKey(d: string): string {
  return d.slice(0, 10)
}

/** A past meeting whose minutes still need the board's approval. Archived meetings are set aside. */
export function needsMinutes(m: MeetingSummaryRow, today: string): boolean {
  return dayKey(m.meeting_date) < today && m.status !== 'archived' && !minutesApproved(m)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Nov 5, 2026" from a YYYY-MM-DD day, with no timezone arithmetic. */
export function formatMeetingDay(day: string): string {
  const [y, m, d] = dayKey(day).split('-').map(Number)
  if (!y || !m || !d) return day
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

export interface MeetingsSummary {
  today: string
  next: { day: string; type: string | null } | null
  thisYear: number
  needsMinutes: number
}

/**
 * Strip counts. "Today" and "this year" are the association's calendar day, so
 * a meeting dated Jan 1 belongs to the new year the moment the association's
 * clock turns, whatever the server's zone is.
 */
export function summarizeMeetings(
  rows: readonly MeetingSummaryRow[],
  timeZone: string,
  now: Date = new Date(),
): MeetingsSummary {
  const today = todayIn(timeZone, now)
  const year = today.slice(0, 4)
  let next: MeetingsSummary['next'] = null
  let thisYear = 0
  let needs = 0
  for (const m of rows) {
    const day = dayKey(m.meeting_date)
    if (day.slice(0, 4) === year) thisYear += 1
    if (day >= today && (!next || day < next.day)) next = { day, type: m.meeting_type }
    if (needsMinutes(m, today)) needs += 1
  }
  return { today, next, thisYear, needsMinutes: needs }
}
