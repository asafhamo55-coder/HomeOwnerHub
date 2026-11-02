// BL-034 amenity notices: the pure parts (wording, the bell row, who may be
// emailed). No database, no sender, so tests and notify.ts share it.

import type { BoardBellInput } from '@/lib/board-in-app-notify'
import type { ConsentState } from '@/lib/email-consent'

export type AmenityEmailKind = 'approved' | 'denied' | 'canceled_by_board'

export const AMENITY_REQUEST_KIND = 'amenity.requested'

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The bell the board sees when a resident asks for a time that needs an answer. */
export function requestBell(args: {
  organizationId: string
  actorId: string
  reservationId: string
  amenityName: string
}): BoardBellInput {
  return {
    organizationId: args.organizationId,
    actorId: args.actorId,
    kind: AMENITY_REQUEST_KIND,
    title: `New request for ${clip(args.amenityName, 60) || 'a space'}`,
    body: 'A resident asked to book a space. Open Amenities to answer.',
    link: '/amenities',
    entityType: 'amenity_reservation',
    entityId: args.reservationId,
  }
}

/** The email wording. Plain, no dashes, ends with what to do next. */
export function buildAmenityEmail(
  kind: AmenityEmailKind,
  args: { amenityName: string; slot: string; note: string | null; link: string },
): { subject: string; text: string; html: string } {
  const what = `${args.amenityName} on ${args.slot}`
  const note = args.note ? clip(args.note, 500) : null
  let subject: string
  let lines: string[]
  if (kind === 'approved') {
    subject = `Your booking is confirmed: ${args.amenityName}`
    lines = [`Your request for ${what} was approved.`, 'You can cancel any time before it starts.']
    if (note) lines.splice(1, 0, `Note from the board: ${note}`)
  } else if (kind === 'denied') {
    subject = `Your request was not approved: ${args.amenityName}`
    lines = [`The board could not approve ${what}.`, note ? `Their note: ${note}` : '', 'You can pick another time.'].filter(Boolean)
  } else {
    subject = `Your booking was canceled: ${args.amenityName}`
    lines = [`The board canceled your booking for ${what}.`, note ? `Their note: ${note}` : '', 'You can pick another time.'].filter(Boolean)
  }
  const text = `${lines.join('\n\n')}\n\nSee your bookings: ${args.link}`
  const html = `${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}<p><a href="${escapeHtml(args.link)}">See your bookings</a></p>`
  return { subject, text, html }
}

/**
 * May this member be emailed? A member who turned email off is never emailed.
 * For a California association an official channel needs the member's consent
 * on record; when the consent table is not live (M1 off) nothing changes from
 * how the rest of the app behaves.
 */
export function mayEmailMember(args: {
  state: string | null | undefined
  emailOptIn: boolean
  consent: ConsentState | undefined
  consentAvailable: boolean
}): boolean {
  if (!args.emailOptIn) return false
  if (args.consent && args.consent.granted === false) return false
  const california = (args.state ?? '').trim().toUpperCase() === 'CA'
  if (california && args.consentAvailable && args.consent?.granted !== true) return false
  return true
}

