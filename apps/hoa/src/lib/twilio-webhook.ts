/**
 * Shared front half of the two Twilio webhooks (inbound, status):
 * read the form body, check X-Twilio-Signature, hand back the fields.
 *
 * Order (RC-3): signature header present (403, body not read) → body read
 * and size-capped (413) → signature verified over the exact public URL and
 * the posted fields (403) → fields returned. Nothing is parsed into
 * domain values until the signature holds.
 *
 * The public URL. Twilio signs the URL it requested. Behind Vercel the
 * incoming Host / x-forwarded-* headers are not something to trust for
 * that, so the URL is built from the app's configured public origin
 * (appOrigin(): NEXT_PUBLIC_APP_URL, falling back to
 * https://www.homeownerledger.com in production) plus the route's fixed
 * path, plus the request's own query string if Twilio was given one. This
 * is the same helper every other absolute link in the app uses, so the
 * Twilio console URLs must be on that origin. If NEXT_PUBLIC_APP_URL moves,
 * the console URLs must move with it, or every webhook answers 403.
 *
 * Logs a reason code only. Never a field value.
 */
import { ApiRouteError } from '@/lib/api/errors'
import { parseForm } from '@/lib/api/parse'
import { appUrl } from '@/lib/app-origin'
import { verifyTwilioSignature } from '@/lib/sms-inbound'

/** Twilio webhook bodies are tiny; cap well under the shared form limit. */
const MAX_TWILIO_BODY_BYTES = 64 * 1024
const MAX_FIELD = 2000

export async function readTwilioWebhook(
  request: Request,
  path: string,
  authToken: string,
): Promise<Map<string, string>> {
  const signature = request.headers.get('x-twilio-signature')
  if (!signature) {
    throw new ApiRouteError('forbidden', 'Missing webhook signature.', { reason: 'missing_signature' })
  }
  const form = await parseForm(request, { maxBytes: MAX_TWILIO_BODY_BYTES })
  const params: Array<[string, string]> = []
  for (const [k, v] of form.entries()) {
    if (typeof v === 'string') params.push([k, v])
  }
  const search = new URL(request.url).search
  const check = verifyTwilioSignature({ signature, url: appUrl(path) + search, params, authToken })
  if (!check.ok) {
    console.warn('[api:webhooks.twilio] signature refused', { reason: check.reason })
    throw new ApiRouteError('forbidden', 'Invalid webhook signature.', { reason: check.reason })
  }
  // Provider-controlled strings are clipped, never a reason to 400 a genuine signed message.
  return new Map(params.map(([k, v]) => [k, v.slice(0, MAX_FIELD)]))
}

/** An empty TwiML reply: Twilio's own opt-out auto-replies answer the resident. */
export function emptyTwiml(): Response {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    status: 200,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  })
}
