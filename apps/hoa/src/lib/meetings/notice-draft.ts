/**
 * The meeting notice as words, for the email and for paper.
 *
 * Both start from the built-in "Meeting notice" template the composer uses
 * (lib/communications/built-in-templates.ts), so the two cannot drift. Print
 * mode changes only what paper cannot do: the "Hi {{ recipient_name }}"
 * greeting becomes "Dear Homeowner,", the "reply to this email" line points
 * to the board contacts. The agenda keeps the email's fallback line. Pure and client-safe.
 */

import { BUILT_IN_TEMPLATES } from '@/lib/communications/built-in-templates'
import { renderTemplate } from '@/lib/communications/templates'
import { MAX_PREFILL_AGENDA, MEETING_NOTICE_TEMPLATE_ID, TEMPLATE_MEETING_TYPE } from './notice-prefill'

export interface MeetingNoticeDraftInput {
  associationName: string
  /** hoa_meeting_minutes.meeting_type */
  meetingType: string | null
  /** YYYY-MM-DD */
  meetingDate: string
  /** HH:MM, 24 hour */
  meetingTime: string
  location: string
  /** The agenda text, or null when none is written. */
  agenda: string | null
  /** Omitted, the output is the email draft. */
  mode?: 'email' | 'print'
  /** Print only: one plain-text line per board contact. */
  contactLines?: string[]
}

/** The two lines of the email that paper replaces. */
export const EMAIL_GREETING = '<p>Hi {{ recipient_name }},</p>'
export const EMAIL_REPLY_LINE =
  '<p>All owners are welcome. If you have a question for the board, bring it to the meeting or reply to this email.</p>'
const CONTACT_MARK = '@@CONTACTS@@'
const CONTACT_LINE = `<p>All owners are welcome. If you have a question for the board, bring it to the meeting or ${CONTACT_MARK}</p>`
const PRINT_GREETING = '<p>Dear Homeowner,</p>'

function escapeHtml(s: string): string {
  // The contact marker is ours alone: strip it from anything a person typed.
  return s.split(CONTACT_MARK).join('').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function longMeetingDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function meetingClock(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const suffix = h! >= 12 ? 'PM' : 'AM'
  const h12 = h! % 12 === 0 ? 12 : h! % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function buildMeetingNoticeDraft(input: MeetingNoticeDraftInput): { subject: string; bodyHtml: string } {
  const t = BUILT_IN_TEMPLATES.find((b) => b.id === MEETING_NOTICE_TEMPLATE_ID)
  if (!t) throw new Error('meeting notice template missing')
  const print = input.mode === 'print'
  const agenda = (input.agenda ?? '').trim().slice(0, MAX_PREFILL_AGENDA)
  const typeLabel = TEMPLATE_MEETING_TYPE[input.meetingType ?? 'regular'] ?? 'Board meeting'
  const dayLabel = longMeetingDay(input.meetingDate)
  const bag = {
    meeting_type: escapeHtml(typeLabel),
    meeting_date: escapeHtml(dayLabel),
    meeting_time: escapeHtml(meetingClock(input.meetingTime)),
    meeting_location: escapeHtml(input.location.trim()),
    agenda: agenda
      ? escapeHtml(agenda).replace(/\r?\n/g, '<br>')
      : escapeHtml(t.questions.find((q) => q.id === 'agenda')?.fallback ?? ''),
    association_name: escapeHtml(input.associationName.trim() || 'The association'),
    // In email mode the send path fills this per owner, so it stays as written.
    recipient_name: '{{ recipient_name }}',
  }
  const subject = renderTemplate(t.subject, { meeting_type: typeLabel, meeting_date: dayLabel }).rendered

  let lines = t.bodyHtml.split('\n')
  if (print) {
    lines = lines.map((l) => (l === EMAIL_GREETING ? PRINT_GREETING : l === EMAIL_REPLY_LINE ? CONTACT_LINE : l))
    // Keep the closing together so it never splits across pages.
    const last = lines.length - 1
    lines[last] = `<div style="break-inside:avoid">${lines[last]}</div>`
  }
  const rendered = renderTemplate(lines.join('\n'), bag).rendered
  if (!print) return { subject, bodyHtml: rendered }
  // Contacts go in after the render, so a "{{" in a contact name is never expanded.
  const contacts = (input.contactLines ?? []).map((l) => l.trim()).filter(Boolean)
  const tail = contacts.length ? `contact the board:<br>${contacts.map(escapeHtml).join('<br>')}` : 'contact the board.'
  return { subject, bodyHtml: (() => {
    const at = rendered.lastIndexOf(CONTACT_MARK)
    return at < 0 ? rendered : rendered.slice(0, at) + tail + rendered.slice(at + CONTACT_MARK.length)
  })() }
}

/**
 * Hours from now to the typed start, both read as wall-clock time in the
 * association's zone (an hour off across a clock change, which is fine for a
 * 48-hour warning). Null when the zone or the time is unreadable.
 */
export function hoursUntilStart(day: string, time: string, zone: string, now: Date = new Date()): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(now)
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    const nowMs = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'))
    const [y, mo, d] = day.split('-').map(Number)
    const [h, mi] = time.split(':').map(Number)
    const startMs = Date.UTC(y!, mo! - 1, d!, h!, mi!)
    return Number.isNaN(nowMs) || Number.isNaN(startMs) ? null : (startMs - nowMs) / 3_600_000
  } catch {
    return null
  }
}
