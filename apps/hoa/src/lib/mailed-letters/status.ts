/**
 * BL-032: plain-words status of a mailed letter, for the letter page. Pure
 * and browser-safe (no I/O). Georgia's waiting periods are not decided here:
 * they run from the delivery day recorded by collections/mail-tracking.ts,
 * which tracking.ts feeds. This only describes where the envelope is.
 */

import type { MailService, MailStatus } from './provider'

export interface MailedLetterView {
  /** Exactly one of these two is set: the letter's source. */
  approvalRequestId: string | null
  violationId: string | null
  mailService: MailService
  status: MailStatus
  trackingNumber: string | null
  expectedDeliveryOn: string | null
  mailedOn: string | null
  deliveredOn: string | null
  confirmedCents: number
  color: boolean
  pages: number
}

export const MAIL_SERVICE_LABELS: Record<MailService, string> = {
  first_class: 'First class',
  certified: 'Certified mail',
  certified_return_receipt: 'Certified mail with return receipt',
}

export const MAIL_STATUS_LABELS: Record<MailStatus, string> = {
  queued: 'Waiting to be printed and mailed',
  in_transit: 'In the mail',
  delivered: 'Delivered',
  returned: 'Came back undelivered',
  failed: 'The mailing service could not send it',
}

export function describeMailedLetter(m: MailedLetterView, formatDay: (d: string) => string): string[] {
  const lines = [`${MAIL_SERVICE_LABELS[m.mailService]}: ${MAIL_STATUS_LABELS[m.status]}.`]
  if (m.trackingNumber) lines.push(`Tracking number ${m.trackingNumber}.`)
  if (m.mailedOn) lines.push(`Mailed ${formatDay(m.mailedOn)}.`)
  if (m.status === 'delivered' && m.deliveredOn) lines.push(`Delivered ${formatDay(m.deliveredOn)}.`)
  else if (m.expectedDeliveryOn && (m.status === 'queued' || m.status === 'in_transit')) lines.push(`Expected by ${formatDay(m.expectedDeliveryOn)}.`)
  if (m.status === 'returned' || m.status === 'failed') lines.push('Check the address, then print the letter and mail it yourself, or ask for help.')
  return lines
}
