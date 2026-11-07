/**
 * The meeting notice as words, for the email and for paper.
 *
 * Both start from the built-in "Meeting notice" template the composer uses
 * (lib/communications/built-in-templates.ts), so the two cannot drift. Print
 * mode changes only what paper cannot do: the "Hi {{ recipient_name }}"
 * greeting becomes "Dear Homeowner,", the "reply to this email" line points
 * to the board contacts, and an agenda nobody wrote is left out instead of
 * printing a promise. Pure and client-safe.
 */

import { BUILT_IN_TEMPLATES } from '@/lib/communications/built-in-templates'
import { renderTemplate } from '@/lib/communications/templates'
import { MEETING_NOTICE_TEMPLATE_ID, TEMPLATE_MEETING_TYPE } from './notice-prefill'

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
const PRINT_GREETING = '<p>Dear Homeowner,</p>'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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
  const agenda = (input.agenda ?? '').trim()
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
    const contacts = (input.contactLines ?? []).map((l) => l.trim()).filter(Boolean)
    const replyLine = contacts.length
      ? `<p>All owners are welcome. If you have a question for the board, bring it to the meeting or contact the board:<br>${contacts.map(escapeHtml).join('<br>')}</p>`
      : '<p>All owners are welcome. If you have a question for the board, bring it to the meeting or contact the board.</p>'
    lines = lines
      .filter((l) => !(l.startsWith('<p><strong>Agenda:</strong>') && !agenda))
      .map((l) => (l === EMAIL_GREETING ? PRINT_GREETING : l === EMAIL_REPLY_LINE ? replyLine : l))
    // Keep the closing together so it never splits across pages.
    const last = lines.length - 1
    lines[last] = `<div style="break-inside:avoid">${lines[last]}</div>`
  }
  return { subject, bodyHtml: renderTemplate(lines.join('\n'), bag).rendered }
}
