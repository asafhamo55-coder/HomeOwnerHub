/**
 * BL-032: the shape of the real Lob adapter. NOT WIRED: nothing imports this
 * (config.ts does not return it), no key is read here, and no test calls it.
 * The api key and the fetch function are constructor arguments, so this file
 * compiles and loads with no key and no network.
 *
 * Wiring it is the owner's step once a provider is chosen and a key is set:
 * return createLobMailProvider({ apiKey, pricing }) from getMailProvider.
 * Field names follow Lob's public API reference (POST /v1/letters, GET
 * /v1/letters/{id}); check them against the live docs before wiring.
 */

import { letterCostCents, type MailPricing } from './cost'
import type { MailLetterRequest, MailProvider, MailQuote, MailSendResult, MailStatus, MailTrackingUpdate } from './provider'
import { toLobLetterBody } from './provider'

const BASE = 'https://api.lob.com/v1'

export interface LobOptions {
  apiKey: string
  pricing: MailPricing
  fetchImpl?: typeof fetch
}

const STATUS_BY_EVENT: Record<string, MailStatus> = {
  'letter.created': 'queued',
  'letter.rendered_pdf': 'queued',
  'letter.rendered_thumbnails': 'queued',
  'letter.in_transit': 'in_transit',
  'letter.in_local_area': 'in_transit',
  'letter.processed_for_delivery': 'in_transit',
  'letter.delivered': 'delivered',
  'letter.re-routed': 'in_transit',
  'letter.returned_to_sender': 'returned',
  'letter.failed': 'failed',
}

interface LobLetter {
  id: string
  tracking_number?: string | null
  expected_delivery_date?: string | null
  send_date?: string | null
  tracking_events?: Array<{ name?: string; time?: string }>
}

export function createLobMailProvider(opts: LobOptions): MailProvider {
  const doFetch = opts.fetchImpl ?? fetch
  const auth = `Basic ${Buffer.from(`${opts.apiKey}:`).toString('base64')}`
  return {
    name: 'lob',
    async quote(req): Promise<MailQuote> {
      // Lob has no quote call: the price is the owner's table, the same one the board saw.
      return { totalCents: letterCostCents(opts.pricing, req), expectedDeliveryOn: null }
    },
    async send(req: MailLetterRequest): Promise<MailSendResult> {
      const body = toLobLetterBody(req, '')
      const form = new FormData()
      for (const [k, v] of Object.entries({ ...flat(body, ''), file: undefined })) if (v !== undefined) form.append(k, String(v))
      form.append('file', new Blob([req.pdf as BlobPart], { type: 'application/pdf' }), 'letter.pdf')
      const res = await doFetch(`${BASE}/letters`, {
        method: 'POST',
        headers: { Authorization: auth, 'Idempotency-Key': req.idempotencyKey },
        body: form,
      })
      if (!res.ok) throw new Error(`lob send failed (${res.status})`)
      const j = (await res.json()) as LobLetter
      return {
        providerLetterId: j.id,
        status: 'queued',
        trackingNumber: j.tracking_number ?? null,
        expectedDeliveryOn: j.expected_delivery_date ?? null,
        chargedCents: letterCostCents(opts.pricing, req),
      }
    },
    async track(id): Promise<MailTrackingUpdate> {
      const res = await doFetch(`${BASE}/letters/${encodeURIComponent(id)}`, { headers: { Authorization: auth } })
      if (!res.ok) throw new Error(`lob track failed (${res.status})`)
      const j = (await res.json()) as LobLetter
      const events = j.tracking_events ?? []
      const last = events[events.length - 1]
      const status = (last?.name && STATUS_BY_EVENT[last.name]) || 'queued'
      const day = (t?: string) => (t ? t.slice(0, 10) : null)
      return {
        status,
        trackingNumber: j.tracking_number ?? null,
        mailedOn: day(events.find((e) => e.name === 'letter.in_transit')?.time) ?? (j.send_date ? j.send_date.slice(0, 10) : null),
        deliveredOn: day(events.find((e) => e.name === 'letter.delivered')?.time),
      }
    },
  }
}

/** Lob's multipart form wants nested objects as to[name], from[name]. */
function flat(o: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}[${k}]` : k
    if (v && typeof v === 'object') Object.assign(out, flat(v as Record<string, unknown>, key))
    else out[key] = v
  }
  return out
}
