/**
 * BL-101 A4 — the acknowledgement line a reply can carry after a convert
 * ("We've logged this…"). Fixed templates, never model-written (SEC-004),
 * and none of them promises the resident can see the record in their
 * portal: a board-filed ticket's submitter is the board member, so it is
 * not in /resident/tickets until on-behalf filing (B4) exists.
 *
 * No imports: the violation wizard (a client component) and the convert
 * menu both read these.
 */

export const TICKET_CATEGORIES = [
  'maintenance',
  'noise',
  'parking',
  'common_area',
  'billing',
  'access',
  'safety',
  'general',
  'other',
] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]

export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = {
  maintenance: 'Maintenance',
  noise: 'Noise',
  parking: 'Parking',
  common_area: 'Common area',
  billing: 'Billing / dues',
  access: 'Access / key / gate',
  safety: 'Safety',
  general: 'General',
  other: 'Other',
}

export function ticketAck(category: TicketCategory): string {
  const kind = category === 'general' || category === 'other' ? '' : `${TICKET_CATEGORY_LABEL[category].toLowerCase()} `
  return `Thank you for letting us know. We've logged this with the board as a ${kind}request and will follow up by email.`
}

export const VIOLATION_ACK = 'Thank you for the report. The board has recorded it and will follow up as needed.'

export const CONTACT_ACK =
  "Thank you. We've passed your new contact details to the board, and they will be updated once approved."

export function arcAck(url: string): string {
  return `To ask for approval, please start an ARC application in the resident portal. We've filled in what you sent us, so you only need to review it, add any plans or photos, and submit: ${url}`
}
