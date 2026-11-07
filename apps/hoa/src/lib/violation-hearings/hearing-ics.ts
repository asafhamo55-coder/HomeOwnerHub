/**
 * Round 31: the calendar file for one scheduled violation hearing. Pure.
 *
 * What goes in: the title "Violation hearing", the date, the time, the
 * place and the association's name. Nothing else: no violation text, no
 * home address, no resident, no board member, no link. The resident has
 * already been shown exactly these on their home page.
 */
import { buildIcs, type IcsEvent } from '@/lib/ics'
import { DEFAULT_HEARING_MINUTES, HEARING_ICS_TITLE, hearingStartsAt, type UpcomingHearing } from './upcoming'

export interface HearingIcsInput
  extends Pick<UpcomingHearing, 'violationId' | 'hearingOn' | 'hearingTime' | 'location' | 'timeZone'> {
  associationName: string | null
  /** Used only for the UID's host part. */
  origin: string
  now?: Date
}

export function hearingIcsFilename(hearingOn: string): string {
  return `violation-hearing-${/^\d{4}-\d{2}-\d{2}$/.test(hearingOn) ? hearingOn : 'notice'}.ics`
}

export function hearingIcsEvent(input: HearingIcsInput): IcsEvent {
  const at = hearingStartsAt(input.hearingOn, input.hearingTime, input.timeZone)
  const host = input.origin.replace(/^https?:\/\//, '').replace(/[:/].*$/, '') || 'homeownerhub'
  const name = input.associationName?.trim() || 'Your association'
  return {
    uid: `hearing-${input.violationId}@${host}`,
    summary: HEARING_ICS_TITLE,
    date: input.hearingOn,
    start: at ? { at, minutes: DEFAULT_HEARING_MINUTES } : undefined,
    location: input.location ?? null,
    description: name,
    now: input.now,
  }
}

export function buildHearingIcs(input: HearingIcsInput): string {
  return buildIcs(hearingIcsEvent(input))
}
