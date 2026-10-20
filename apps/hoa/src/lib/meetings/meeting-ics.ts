/**
 * BL-118: the calendar invite for a meeting notice. Pure.
 *
 * What goes in: the association's name, the meeting type label, its date,
 * the start time and place the board typed into the notice, and a link to
 * the resident portal's meetings page. Nothing about any person — no
 * names, emails, addresses of homes, attendees, transcript or minutes.
 */
import { instantAtLocalTime } from '@/lib/association-time'
import { meetingTypeLabel } from '@/lib/resident-meetings/select'
import { buildIcs } from '@/lib/ics'
import { CALENDAR_TIME_RE } from './notice-prefill'

/** Calendar length when only a start time is known. */
export const DEFAULT_MEETING_MINUTES = 60

export interface MeetingIcsInput {
  meetingId: string
  meetingDate: string
  meetingType: string | null
  associationName: string
  timeZone: string
  /** HH:MM in the association's zone; absent = an all-day event. */
  start?: string | null
  where?: string | null
  origin: string
  now?: Date
}

export function meetingIcsFilename(meetingDate: string): string {
  return `meeting-${/^\d{4}-\d{2}-\d{2}$/.test(meetingDate) ? meetingDate : 'notice'}.ics`
}

export function buildMeetingIcs(input: MeetingIcsInput): string {
  let start: { at: Date; minutes: number } | undefined
  const m = input.start ? CALENDAR_TIME_RE.exec(input.start) : null
  if (m) {
    const [h, min] = input.start!.split(':').map(Number)
    // Fractional hours land on the minute (instantAtLocalTime adds hour × 1h).
    start = { at: instantAtLocalTime(input.meetingDate, h + min / 60, input.timeZone), minutes: DEFAULT_MEETING_MINUTES }
  }
  const host = input.origin.replace(/^https?:\/\//, '').replace(/[:/].*$/, '') || 'homeownerhub'
  const portal = `${input.origin}/resident/meetings`
  return buildIcs({
    uid: `meeting-${input.meetingId}@${host}`,
    summary: `${input.associationName}: ${meetingTypeLabel(input.meetingType)}`,
    date: input.meetingDate,
    start,
    location: input.where ?? null,
    description: `Meeting notice from ${input.associationName}. The agenda and notices are in the resident portal: ${portal}`,
    url: portal,
    now: input.now,
  })
}
