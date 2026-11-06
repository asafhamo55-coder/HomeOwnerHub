# Inbound STOP / START / HELP over SMS (BL-111)

- **Date:** 2026-10-20 (provider changed to Twilio, 2026-11-06)
- **Status:** Built. **Off by default** (`SMS_INBOUND_ENABLED`). Needs the owner to configure Twilio before it is turned on.
- **Code:**
  - `apps/hoa/src/app/api/webhooks/twilio/inbound/route.ts` (the route)
  - `apps/hoa/src/lib/twilio-webhook.ts` (form read, signature check, empty TwiML reply)
  - `apps/hoa/src/lib/sms-inbound.ts` (the keyword logic and `verifyTwilioSignature`)
  - `apps/hoa/src/lib/sms-consent-ledger.ts` (number → resident)

## What it does

Twilio posts each text a resident sends to our Messaging Service to
`POST https://www.homeownerledger.com/api/webhooks/twilio/inbound` as
`application/x-www-form-urlencoded`. The fields we read are `From`, `Body`, `MessageSid` and, with
Advanced Opt-Out, `OptOutType` (`STOP`, `START` or `HELP`). `OptOutType` wins over our own reading
of `Body`.

| Message | Effect |
|---|---|
| **STOP-family:** `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`. Matched as the first word, so "Stop please" counts. | `sms_opt_in = false`, plus an `sms_consent_revoked` audit row (`method: 'sms_keyword'`). This applies to every resident, in any org, whose consent rows name the sender's number. |
| **START:** `START` or `UNSTOP` as the whole message | Re-enables texts **only** where a prior `sms_consent_granted` row names that number. It writes a new grant first (`method: 'sms_keyword'`, the prior disclosure version and hash, `restores_grant_id`, the number's hash plus any numbers still covered), and then sets `sms_opt_in = true`. If there is no prior consent, nothing changes. |
| **HELP:** `HELP` or `INFO` | Nothing is written and nothing is sent by us. Twilio's Advanced Opt-Out sends the help reply. |
| Anything else | Acknowledged and ignored. |

**The reply is always empty TwiML** (`<Response/>`, `Content-Type: text/xml`). Twilio sends the
STOP, START and HELP auto-replies itself, so this route never sends a second text. Errors (flag
off, bad signature, failed write) use the normal JSON error envelope and a non-2xx status.

**Number → resident.** The sender is normalised to E.164 and hashed with SHA-256. The hash is
looked up in `audit_log.metadata.phone_sha256` on `sms_consent_granted` rows, across all orgs,
with the service role. Under BL-111 a number is only ever texted when a consent row names it, so
every number we could have texted can be found this way. The raw number is never stored or
logged.

**Safety.**

- Writes go through the service role. The BL-110 trigger exempts the service role, and audit_log
  inserts are board/admin-only under RLS.
- Every write is checked. A failed write answers 500, so Twilio retries.
- Retries are idempotent:
  - The preference update just sets a value.
  - Each audit row carries Twilio's `MessageSid` and is skipped if one already exists for the
    same resident, action and message.
- Logs carry the `MessageSid`, the keyword and counts. They never carry the number, its hash or
  the text.

## Request checks, in order

1. `SMS_INBOUND_ENABLED !== 'true'` → **404**. The route behaves as if it does not exist.
2. `TWILIO_AUTH_TOKEN` unset → **503** `not_configured`.
3. No `X-Twilio-Signature` header → **403** `missing_signature`. The body is not read.
4. Form body read with a 64 KB cap (**413** over it).
5. Signature verified → **403** `invalid_signature` on failure. The signature is
   `base64(HMAC-SHA1(TWILIO_AUTH_TOKEN, URL + every POST field name and value, sorted by name))`,
   compared in constant time.
6. The keyword is acted on.

**Which URL is signed.** Twilio signs the exact URL it called. Behind Vercel the incoming `Host`
header is not trusted for that. The route builds the URL from the app's public origin
(`appOrigin()` in `lib/app-origin.ts`, which reads `NEXT_PUBLIC_APP_URL` and falls back to
`https://www.homeownerledger.com` in production), plus the fixed route path, plus the request's
own query string. This is the same helper that builds every other absolute link in the app. So the
URL entered in the Twilio console must be on that origin. If `NEXT_PUBLIC_APP_URL` ever moves,
change the Twilio console URLs at the same time, or every webhook will answer 403.

## Environment variables (Vercel → hoa project → Production)

| Name | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio console → Account info. Already needed for sending. |
| `TWILIO_AUTH_TOKEN` | Twilio console → Account info. Also the webhook signing key. |
| `TWILIO_MESSAGING_SERVICE_SID` | The Messaging Service (`MG…`). Already needed for sending. |
| `SMS_INBOUND_ENABLED` | `true`, set only after the console steps below are done and one test passes |

## Twilio console config (owner)

1. **Messaging Service.** Messaging → Services → create one (or open the existing one). Add the
   registered 10DLC sender number to its **Sender Pool**, and attach the approved A2P 10DLC
   campaign. Copy the Service SID (`MG…`) into `TWILIO_MESSAGING_SERVICE_SID`.
2. **Inbound URL.** Service → **Integration**. Choose **Send a webhook** and set the request URL to
   `https://www.homeownerledger.com/api/webhooks/twilio/inbound`, method `HTTP POST`.
3. **Advanced Opt-Out.** Service → **Opt-Out Management**. Keep the default STOP, UNSUBSCRIBE,
   CANCEL, END, QUIT, START and HELP keywords. Set the **HELP reply** to name the program and give
   a contact. Example: "HomeownerHub texts for your association. Help: support@homeownerledger.com.
   Msg & data rates may apply. Reply STOP to stop." Twilio sends these replies. We never do.
4. **Turn it on and test.**
   1. Set `SMS_INBOUND_ENABLED=true` and redeploy.
   2. From a phone that agreed to texts in the portal, text `STOP`.
   3. Check that the resident's Account → Text messages panel shows texts off, and that an
      `sms_consent_revoked` row with `method = 'sms_keyword'` exists.
   4. Text `START` and check that texts are back on.

## Not in scope

- Replying to residents' other texts. These are ignored; a future inbox could take them.
- WhatsApp senders (`whatsapp:` prefix). They are ignored.
- A STOP from a number with no consent row. Such a number cannot be texted anyway under BL-111.
