/**
 * BL-032: an in-memory MailProvider for tests and for every environment that
 * has no provider keys. Never touches the network. Prices come from the
 * pricing table passed in, so the quote and the charge always agree.
 */

import { letterCostCents, type MailPricing } from './cost'
import type { MailLetterRequest, MailProvider, MailQuote, MailSendResult, MailTrackingUpdate } from './provider'

export interface FakeMailProvider extends MailProvider {
  /** Every distinct letter received, in order. */
  readonly sent: MailLetterRequest[]
  /** Make the next send throw (a provider outage). */
  failNextSend(): void
  /** Set what track() returns for a letter. */
  setTracking(providerLetterId: string, update: MailTrackingUpdate): void
}

export function createFakeMailProvider(pricing: MailPricing): FakeMailProvider {
  const sent: MailLetterRequest[] = []
  const byKey = new Map<string, MailSendResult>()
  const tracking = new Map<string, MailTrackingUpdate>()
  let fail = false
  return {
    name: 'fake',
    sent,
    async quote(req): Promise<MailQuote> {
      return { totalCents: letterCostCents(pricing, req), expectedDeliveryOn: null }
    },
    async send(req): Promise<MailSendResult> {
      if (fail) {
        fail = false
        throw new Error('fake provider outage')
      }
      // Like a real idempotency key: the same key never creates a second letter.
      const prior = byKey.get(req.idempotencyKey)
      if (prior) return prior
      sent.push(req)
      const result: MailSendResult = {
        providerLetterId: `fake_ltr_${sent.length}`,
        status: 'queued',
        trackingNumber: req.service === 'first_class' ? null : `FAKE${String(sent.length).padStart(8, '0')}`,
        expectedDeliveryOn: null,
        chargedCents: letterCostCents(pricing, req),
      }
      byKey.set(req.idempotencyKey, result)
      return result
    },
    async track(id): Promise<MailTrackingUpdate> {
      return tracking.get(id) ?? { status: 'queued', trackingNumber: null, mailedOn: null, deliveredOn: null }
    },
    failNextSend() {
      fail = true
    },
    setTracking(id, update) {
      tracking.set(id, update)
    },
  }
}
