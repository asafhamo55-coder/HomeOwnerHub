/**
 * BL-118: a scheduled meeting → the communications composer, prefilled.
 * Pure and client-safe (the wizard imports it).
 *
 * The composer opens on the built-in "Meeting notice" template
 * (lib/communications/built-in-templates.ts) with the type, date and
 * agenda answered from the meeting, the audience set to all owners and
 * the category 'meeting'. Start time and place are not stored on a
 * meeting, so the board enters them there. Nothing is sent until the board
 * presses Send through the normal guarded path (sendCommunication).
 *
 * The calendar invite: the communications email path sends through
 * Resend's batch endpoint, which does not take attachments (lib/email.ts),
 * so the notice carries an "Add to calendar" link instead, to
 * /resident/meetings/<id>/calendar — a route that needs a signed-in member
 * of the meeting's own HOA (see that route for why that beats an
 * unguessable public token). The link carries only the start time and the
 * place the board typed, both bounded; the date comes from the meeting row.
 */

export const MEETING_NOTICE_TEMPLATE_ID = 'builtin:meeting-notice'

/** The built-in template's `meeting_type` options, by hoa_meeting_minutes.meeting_type. */
export const TEMPLATE_MEETING_TYPE: Readonly<Record<string, string>> = {
  regular: 'Board meeting',
  emergency: 'Board meeting',
  annual: 'Annual members’ meeting',
  special: 'Special members’ meeting',
}

/** Longest agenda the prefill carries; the rest stays on the meeting page. */
export const MAX_PREFILL_AGENDA = 4000
/** Longest place the calendar link carries. */
export const MAX_CALENDAR_WHERE = 200
export const CALENDAR_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `?meeting=<uuid>` → the id, or null. */
export function parseMeetingParam(v: string | null | undefined): string | null {
  return typeof v === 'string' && UUID_RE.test(v) ? v : null
}

export interface MeetingNoticeSource {
  id: string
  meetingDate: string
  meetingType: string | null
  /** The agenda text (ai_summary on an upcoming draft row), or null. */
  agenda: string | null
}

export interface MeetingNoticePrefill {
  meetingId: string
  meetingDate: string
  templateId: typeof MEETING_NOTICE_TEMPLATE_ID
  baseCategory: 'meeting'
  audience: 'owners_only'
  /** Template answers keyed by question id; time and place left for the board. */
  answers: Record<string, string>
}

export function buildMeetingNoticePrefill(m: MeetingNoticeSource): MeetingNoticePrefill {
  const answers: Record<string, string> = {
    meeting_type: TEMPLATE_MEETING_TYPE[m.meetingType ?? 'regular'] ?? 'Board meeting',
    meeting_date: m.meetingDate,
  }
  const agenda = (m.agenda ?? '').trim()
  if (agenda) answers.agenda = agenda.slice(0, MAX_PREFILL_AGENDA)
  return {
    meetingId: m.id,
    meetingDate: m.meetingDate,
    templateId: MEETING_NOTICE_TEMPLATE_ID,
    baseCategory: 'meeting',
    audience: 'owners_only',
    answers,
  }
}

/** The calendar route's path and query for this meeting, from the board's answers. */
export function calendarLinkPath(meetingId: string, answers: { time?: unknown; where?: unknown }): string {
  const q = new URLSearchParams()
  if (typeof answers.time === 'string' && CALENDAR_TIME_RE.test(answers.time)) q.set('start', answers.time)
  if (typeof answers.where === 'string') {
    const where = answers.where.replace(/\s+/g, ' ').trim().slice(0, MAX_CALENDAR_WHERE)
    if (where) q.set('where', where)
  }
  const qs = q.toString()
  return `/resident/meetings/${meetingId}/calendar${qs ? `?${qs}` : ''}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * The paragraph added under the board's message at send time: the
 * calendar invite and where owners find the agenda. Plain links, no merge
 * fields, so a resumed draft or an edited body can't break the send.
 */
export function calendarParagraphHtml(origin: string, meetingId: string, answers: { time?: unknown; where?: unknown }): string {
  const ics = `${origin}${calendarLinkPath(meetingId, answers)}`
  const portal = `${origin}/resident/meetings`
  return (
    `<p><strong>Add it to your calendar:</strong> <a href="${escapeHtml(ics)}">download the calendar invite</a> ` +
    `(sign in to the resident portal if asked).<br>` +
    `<strong>Agenda and notices:</strong> <a href="${escapeHtml(portal)}">${escapeHtml(portal)}</a></p>`
  )
}
