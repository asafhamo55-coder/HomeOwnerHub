// What goes in the subscribable feed, and the file itself (Round 29). Pure.
//
// The window is the last 30 days plus everything upcoming. Each item is a
// title and a date: no attendee, no minutes, no agenda text, no person.
//
//   meeting      upcoming: status 'draft' dated today or later (the rule the
//                resident meetings page uses, lib/resident-meetings/select.ts).
//                recent: status 'approved' inside the window. A meeting the
//                board deleted or cancelled, dated inside the window, stays in
//                the feed as STATUS:CANCELLED so phones drop it.
//                A past 'draft' is withheld: it may be draft minutes.
//   event        a board reminder whose audience the board set to "everyone".
//                Board-only and specific-resident reminders never appear.
//                Switched off inside the window = CANCELLED.

import { buildIcsCalendar, type IcsEvent } from '../ics'
import { meetingIcsEvent } from '../meetings/meeting-ics'

export const FEED_LOOKBACK_DAYS = 30
export const FEED_REFRESH_MINUTES = 60
export const FEED_PRODID = '-//HomeownerHub//Calendar feed//EN'

export interface FeedMeetingRow {
  id: string
  meeting_date: string
  meeting_type: string | null
  status: string | null
  deleted_at: string | null
}

export interface FeedEventRow {
  id: string
  title: string
  event_date: string
  is_active: boolean
  notify_audience: unknown
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10)
}

export function feedWindowStart(today: string): string {
  return addDays(today, -FEED_LOOKBACK_DAYS)
}

export function isEveryoneAudience(audience: unknown): boolean {
  return !!audience && typeof audience === 'object' && (audience as { kind?: unknown }).kind === 'everyone'
}

export interface FeedInput {
  associationName: string
  timeZone: string
  origin: string
  today: string
  meetings: readonly FeedMeetingRow[]
  events: readonly FeedEventRow[]
  now?: Date
}

export function feedEvents(input: FeedInput): IcsEvent[] {
  const from = feedWindowStart(input.today)
  const out: IcsEvent[] = []

  for (const m of input.meetings) {
    const date = m.meeting_date?.slice(0, 10) ?? ''
    if (!DAY.test(date) || date < from) continue
    const cancelled = m.deleted_at !== null || m.status === 'cancelled'
    const upcoming = m.status === 'draft' && date >= input.today
    const recent = m.status === 'approved' && date < input.today
    if (!cancelled && !upcoming && !recent) continue
    out.push(
      meetingIcsEvent({
        meetingId: m.id,
        meetingDate: date,
        meetingType: m.meeting_type,
        associationName: input.associationName,
        timeZone: input.timeZone,
        origin: input.origin,
        status: cancelled ? 'CANCELLED' : 'CONFIRMED',
        now: input.now,
      }),
    )
  }

  const host = input.origin.replace(/^https?:\/\//, '').replace(/[:/].*$/, '') || 'homeownerhub'
  for (const e of input.events) {
    const date = e.event_date?.slice(0, 10) ?? ''
    if (!DAY.test(date) || date < from || !isEveryoneAudience(e.notify_audience)) continue
    const title = e.title?.trim()
    if (!title) continue
    out.push({
      uid: `event-${e.id}-${date}@${host}`,
      summary: title,
      date,
      status: e.is_active ? 'CONFIRMED' : 'CANCELLED',
      now: input.now,
    })
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid))
}

export function buildFeedIcs(input: FeedInput): string {
  return buildIcsCalendar(feedEvents(input), {
    prodId: FEED_PRODID,
    name: `${input.associationName} meetings and events`,
    timeZone: input.timeZone,
    refreshMinutes: FEED_REFRESH_MINUTES,
  })
}
