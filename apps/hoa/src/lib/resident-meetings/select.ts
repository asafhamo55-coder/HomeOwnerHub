/**
 * Which meetings a resident may see (BL-088), and how. Pure, no I/O.
 *
 * FL §720.303(2): an association with 100+ parcels posts meeting notices
 * and agendas in an owners-only area at least 14 days ahead, and owners
 * may see approved minutes. Everything else on hoa_meeting_minutes is
 * board-only: drafts of minutes, raw transcripts, attendees, motions,
 * action items and anything said in an executive session.
 *
 * How board-side rows are shaped (lib/meetings.ts):
 *   - scheduleMeeting inserts status 'draft' with the AGENDA in ai_summary;
 *   - approveMeetingMinutes inserts status 'approved' with the APPROVED
 *     MINUTES in ai_summary (raw_transcript holds the transcript);
 *   - updateMeeting can overwrite ai_summary on ANY row, draft included,
 *     without approving it. So a draft row's text is the agenda only while
 *     it was last edited before the meeting day. Once someone edits it on
 *     or after that day it may be draft minutes, and it is withheld.
 *
 * The resident rule, applied here and again in the query (query.ts) and,
 * once the proposed function is applied, in the database:
 *   upcoming  status 'draft', meeting_date >= the association's today;
 *             the text is shown as the agenda only if the row was last
 *             edited before the meeting day (in the association's zone).
 *   past      status 'approved', meeting_date < today; text = minutes.
 *   anything else (a past draft, a future "approved" row, a deleted row,
 *   another org's row, an unknown status) is dropped.
 *
 * No 'use server' and no Next imports: tests/integration imports this.
 */
import { dayOf } from '@homeowner-portal/jobs/association-time'

/** The only columns a resident read may name. Never raw_transcript, attendees, motions or action_items. */
export const RESIDENT_MEETING_COLUMNS = 'id, org_id, meeting_date, meeting_type, status, body, updated_at'

/** A row as the resident read returns it. `body` is ai_summary under a neutral name. */
export interface ResidentMeetingRow {
  id: string
  org_id: string
  meeting_date: string
  meeting_type: string | null
  status: string | null
  body: string | null
  updated_at: string | null
  deleted_at?: string | null
}

export type MeetingKind = 'regular' | 'special' | 'annual' | 'emergency'

const KIND_LABELS: Record<MeetingKind, string> = {
  regular: 'Board meeting',
  special: 'Special meeting',
  annual: 'Annual meeting',
  emergency: 'Emergency meeting',
}

export interface UpcomingMeeting {
  id: string
  date: string
  typeLabel: string
  /** The posted agenda, or null when none is posted (or it was withheld). */
  agenda: string | null
}

export interface PastMeeting {
  id: string
  date: string
  typeLabel: string
  /** The board-approved minutes. Rows without any are dropped. */
  minutes: string
}

export interface ResidentMeetings {
  upcoming: UpcomingMeeting[]
  past: PastMeeting[]
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function meetingTypeLabel(type: string | null | undefined): string {
  return KIND_LABELS[(type ?? 'regular') as MeetingKind] ?? 'Meeting'
}

function base(row: ResidentMeetingRow, orgId: string): boolean {
  return (
    row.org_id === orgId &&
    !row.deleted_at &&
    typeof row.meeting_date === 'string' &&
    DATE_ONLY.test(row.meeting_date.slice(0, 10))
  )
}

/**
 * A draft row's text is the agenda only if nobody touched it on or after
 * the meeting day. A row with no updated_at is treated as touched: there
 * is no proof the text is still the agenda.
 */
export function agendaIsSafe(row: Pick<ResidentMeetingRow, 'meeting_date' | 'updated_at'>, timeZone: string): boolean {
  const edited = dayOf(row.updated_at, timeZone)
  if (!edited) return false
  return edited < row.meeting_date.slice(0, 10)
}

export function isUpcomingForResident(row: ResidentMeetingRow, orgId: string, today: string): boolean {
  return base(row, orgId) && row.status === 'draft' && row.meeting_date.slice(0, 10) >= today
}

export function isPastForResident(row: ResidentMeetingRow, orgId: string, today: string): boolean {
  return base(row, orgId) && row.status === 'approved' && row.meeting_date.slice(0, 10) < today
}

function text(value: string | null | undefined): string | null {
  const t = value?.trim()
  return t ? t : null
}

/**
 * Re-applies the resident rule to whatever the read returned, and projects
 * each row to only what the page shows. Upcoming soonest first; past
 * newest first.
 */
export function selectResidentMeetings(
  rows: readonly ResidentMeetingRow[],
  opts: { orgId: string; today: string; timeZone: string },
): ResidentMeetings {
  const upcoming: UpcomingMeeting[] = []
  const past: PastMeeting[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    const date = row.meeting_date?.slice(0, 10)
    if (isUpcomingForResident(row, opts.orgId, opts.today)) {
      upcoming.push({
        id: row.id,
        date,
        typeLabel: meetingTypeLabel(row.meeting_type),
        agenda: agendaIsSafe(row, opts.timeZone) ? text(row.body) : null,
      })
    } else if (isPastForResident(row, opts.orgId, opts.today)) {
      const minutes = text(row.body)
      if (minutes) past.push({ id: row.id, date, typeLabel: meetingTypeLabel(row.meeting_type), minutes })
    }
  }
  upcoming.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  past.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0))
  return { upcoming, past }
}

const WEEKDAY_DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * A calendar date → "Thursday, November 5, 2026". meeting_date is a DATE
 * column (no time), so it is formatted on its Y-M-D parts and never
 * shifted by a zone. "Today" itself comes from the association's zone.
 */
export function formatMeetingDate(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  if (!m) return day
  return WEEKDAY_DATE.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))))
}
