/**
 * BL-032: the thin print-and-mail provider interface. Lob-shaped (a letter
 * has a recipient, a sender, a document, a color flag and a mail type with an
 * optional certified extra service) but it names no vendor SDK and reads no
 * key. The real adapter, once the owner picks a provider and sets keys, is
 * one file implementing MailProvider. Tests and every environment without
 * keys use the fake in fake-provider.ts.
 *
 * Pure and browser-safe: types and one mapper. No I/O, no Next imports.
 * Money is integer cents.
 */

export const MAIL_SERVICES = ['first_class', 'certified', 'certified_return_receipt'] as const
export type MailService = (typeof MAIL_SERVICES)[number]

/** A postal address. Passed to the provider only; never logged or stored in mailed_letters. */
export interface PostalAddress {
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  zip: string
}

export interface MailLetterRequest {
  to: PostalAddress
  from: PostalAddress
  /** Rendered letter, a PDF the app generated. */
  pdf: Uint8Array
  pages: number
  color: boolean
  service: MailService
  /** Our approval request id: the provider's idempotency key, so a retry never mails twice. */
  idempotencyKey: string
}

export interface MailQuote {
  /** Integer cents the provider will charge for this exact letter. */
  totalCents: number
  /** Provider-side estimate of delivery, YYYY-MM-DD, when known. */
  expectedDeliveryOn: string | null
}

export type MailStatus = 'queued' | 'in_transit' | 'delivered' | 'returned' | 'failed'

export interface MailSendResult {
  providerLetterId: string
  status: MailStatus
  trackingNumber: string | null
  expectedDeliveryOn: string | null
  /** Integer cents actually charged. */
  chargedCents: number
}

export interface MailTrackingUpdate {
  status: MailStatus
  trackingNumber: string | null
  mailedOn: string | null
  deliveredOn: string | null
}

export interface MailProvider {
  readonly name: 'lob' | 'postgrid' | 'fake'
  quote(req: MailLetterRequest): Promise<MailQuote>
  send(req: MailLetterRequest): Promise<MailSendResult>
  track(providerLetterId: string): Promise<MailTrackingUpdate>
}

/** Lob's POST /v1/letters body, for the future real adapter. Field names follow Lob's public API reference. */
export function toLobLetterBody(req: MailLetterRequest, fileUrlOrHtml: string) {
  const addr = (a: PostalAddress) => ({
    name: a.name,
    address_line1: a.line1,
    ...(a.line2 ? { address_line2: a.line2 } : {}),
    address_city: a.city,
    address_state: a.state,
    address_zip: a.zip,
  })
  return {
    to: addr(req.to),
    from: addr(req.from),
    file: fileUrlOrHtml,
    color: req.color,
    double_sided: false,
    mail_type: 'usps_first_class' as const,
    ...(req.service === 'certified' ? { extra_service: 'certified' as const } : {}),
    ...(req.service === 'certified_return_receipt' ? { extra_service: 'certified_return_receipt' as const } : {}),
  }
}
