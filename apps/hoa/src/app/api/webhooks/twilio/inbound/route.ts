import { createAdminClient } from '@homeowner-portal/db'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { applyStart, applyStop, classifyKeyword, type InboundKeyword } from '@/lib/sms-inbound'
import { emptyTwiml, readTwilioWebhook } from '@/lib/twilio-webhook'

/**
 * BL-111 — Twilio inbound SMS (Messaging Service webhook) → STOP / START / HELP.
 *
 * Off unless SMS_INBOUND_ENABLED is "true": while off the route answers
 * 404, as if absent. Spec and console setup:
 * docs/specs/2026-10-20-sms-inbound.md.
 *
 * Order (RC-3): flag (404) → TWILIO_AUTH_TOKEN configured (503
 * not_configured) → X-Twilio-Signature present (403, no body read) → form
 * body read, size-capped (413) → signature verified over the public URL and
 * fields (403) → work. See lib/twilio-webhook.ts for the URL choice.
 *
 * Differences from the JSON routes, and why: the body is
 * application/x-www-form-urlencoded (parseForm, not parseJson); the
 * signature failure is 403 `forbidden` (the brief's choice for Twilio) not
 * 401; and success is empty TwiML (`<Response/>`, text/xml) rather than a
 * JSON body, because Twilio expects TwiML and ignores anything else.
 *
 *   STOP-family → sms_opt_in = false + an `sms_consent_revoked` row for
 *                 every resident whose consent names the sender's number.
 *   START       → back on only where a prior consent row names the number.
 *   HELP / other → acknowledged, nothing written. Twilio's Advanced Opt-Out
 *                 sends the STOP / HELP auto-replies itself, so we never
 *                 send a text from here (empty TwiML on every path).
 *
 * Twilio's OptOutType (STOP / START / HELP) wins over our own reading of
 * Body. Idempotent on MessageSid (see lib/sms-inbound.ts). Persistence
 * failures answer 500 so Twilio retries (RC-6). Logs carry the message id,
 * keyword and counts, never the number, its hash or the text.
 */

function keywordFromOptOutType(value: string | undefined): InboundKeyword | null {
  switch (value?.trim().toUpperCase()) {
    case 'STOP':
      return 'stop'
    case 'START':
      return 'start'
    case 'HELP':
      return 'help'
    default:
      return null
  }
}

export const POST = withRoute('webhooks.twilio_inbound', async (request: Request) => {
  if (process.env.SMS_INBOUND_ENABLED !== 'true') throw new ApiRouteError('not_found')
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) throw new ApiRouteError('not_configured')

  const f = await readTwilioWebhook(request, '/api/webhooks/twilio/inbound', authToken)

  const optOut = f.get('OptOutType')
  const keyword = keywordFromOptOutType(optOut) ?? classifyKeyword(f.get('Body'))
  const from = f.get('From')?.trim() || null
  const messageId = f.get('MessageSid')?.trim() || null
  if (!keyword || keyword === 'help' || !from || from.toLowerCase().startsWith('whatsapp:')) {
    // Deliberately ignored: not a keyword we act on (HELP is Twilio's).
    return emptyTwiml()
  }
  if (!messageId) {
    // No id to dedupe on: refusing would make Twilio retry, so ack.
    console.warn('[api:webhooks.twilio_inbound] keyword without message id', { keyword })
    return emptyTwiml()
  }

  const db = createAdminClient()
  // The word the resident sent (e.g. UNSUBSCRIBE), recorded on the audit row.
  const bodyWord = (f.get('Body') ?? '').trim().split(/\s+/)[0].toUpperCase().replace(/[^A-Z]/g, '')
  const word = bodyWord || (optOut ?? '').toUpperCase().replace(/[^A-Z]/g, '')
  const args = { fromRaw: from, messageId, keyword: word, now: new Date() }
  const outcome = keyword === 'stop' ? await applyStop(db, args) : await applyStart(db, args)
  console.info('[api:webhooks.twilio_inbound] keyword applied', {
    messageId,
    keyword,
    matched: outcome.matched,
    changed: outcome.changed,
  })
  return emptyTwiml()
})
