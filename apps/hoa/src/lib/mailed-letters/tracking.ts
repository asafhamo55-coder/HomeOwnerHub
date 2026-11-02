/**
 * BL-032: turn provider tracking into the existing collections mail
 * tracking record (collections/mail-tracking.ts), so a mailed letter shows
 * the same way and starts the Georgia clocks the same way a hand-entered one
 * does. Pure. Certified and certified-with-receipt are statutory methods;
 * plain first class is not and never starts a clock there.
 */

import type { MailMethod, MailRecord } from '../collections/mail-tracking'
import type { MailService, MailTrackingUpdate } from './provider'

export const mailMethodFor = (s: MailService): MailMethod => (s === 'first_class' ? 'first_class' : 'certified')

export function mailRecordFromProvider(service: MailService, u: MailTrackingUpdate): MailRecord {
  return {
    method: mailMethodFor(service),
    trackingNumber: u.trackingNumber,
    mailedOn: u.mailedOn,
    deliveredOn: u.status === 'delivered' ? u.deliveredOn : null,
  }
}
