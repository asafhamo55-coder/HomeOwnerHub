# SMS delivery receipts from Twilio (BL-146)

- **Date:** 2026-10-21 (provider changed to Twilio, 2026-11-06)
- **Status:** Built. **Off by default** (`SMS_STATUS_WEBHOOK_ENABLED`). Owner setup: OA-27.
- **Code:**
  - `apps/hoa/src/app/api/webhooks/twilio/status/route.ts` (the route)
  - `apps/hoa/src/lib/sms-status.ts` (the row update)
  - `apps/hoa/src/lib/twilio-webhook.ts` and `apps/hoa/src/lib/sms-inbound.ts` → `verifyTwilioSignature` (the signature check, shared with the inbound route)

## What it does

Twilio posts a status for each text to `POST https://www.homeownerledger.com/api/webhooks/twilio/status`
(the `StatusCallback` that `lib/sms.ts` sets on every send), as
`application/x-www-form-urlencoded`. The route reads `MessageSid`, `MessageStatus` and `ErrorCode`,
finds the text's `communication_recipients` row by the `MessageSid` alone (`external_id`, channel
`sms`) and moves it forward:

| Twilio `MessageStatus` | Row |
|---|---|
| `sent` | `sent` (from `queued`), `sent_at` |
| `delivered` | `delivered` (from `queued` / `sent`), `delivered_at` |
| `undelivered`, `failed` | `failed` (from `queued` / `sent`), `failed_at`, and a fixed `error_message` ("The carrier did not deliver this text (code 30003).") |
| anything else (`queued`, `accepted`, `sending`, `read`, …) | nothing |

- **Idempotent and out-of-order safe.** Timestamps are first-write-wins (`… is null`), and the
  status only moves forward. A retried or late callback is a no-op. A `delivered` row never
  becomes `sent` or `failed`, even if Twilio's callbacks arrive in the wrong order.
- **No PII.** The row is matched on the provider id only. Logs carry the message id, the status
  and a count. The number, the text and Twilio's error text are never logged. The stored reason
  is fixed wording plus Twilio's `ErrorCode` when it is a short code.
- **Failures.** A failed write answers 500, so Twilio retries.
- **Reply.** `200` with a small JSON body. Twilio ignores the body of a status callback.

## Request checks, in order (the same as the inbound route)

1. `SMS_STATUS_WEBHOOK_ENABLED !== 'true'` → **404**.
2. `TWILIO_AUTH_TOKEN` unset → **503** `not_configured`.
3. No `X-Twilio-Signature` header → **403** `missing_signature`. The body is not read.
4. Form body read with a 64 KB cap (**413** over it).
5. Signature verified → **403** `invalid_signature` on failure:
   `base64(HMAC-SHA1(TWILIO_AUTH_TOKEN, URL + every POST field name and value, sorted by name))`,
   compared in constant time.
6. The callback is applied.

**Which URL is signed.** The URL is built from the app's public origin (`appOrigin()` in
`lib/app-origin.ts`: `NEXT_PUBLIC_APP_URL`, falling back to `https://www.homeownerledger.com` in
production) plus the route path. The incoming `Host` header is not trusted. The `StatusCallback`
that `sendSms` sends is built from the same helper, so the two always agree.

## Outbound texts (BL-146b)

`lib/sms.ts` sends with Twilio's REST API through `fetch` (no SDK):
`POST https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json`, form
encoded, Basic auth (Account SID : Auth Token). The fields are `To`, `Body`,
`MessagingServiceSid` (never a raw `From` number, which US 10DLC does not allow) and
`StatusCallback`. Twilio answers 201 with the message `sid`; `sendSms` returns it as `messageSid`,
and every caller (broadcast delivery, event alerts, resident notifications) stores it in
`communication_recipients.external_id`. That is the id this route matches callbacks on.

Errors: a non-2xx answer is turned into a short code (`Twilio error 21211`, or
`Twilio HTTP 401` when there is no code). Twilio's message text, which can echo a number, is never
read, stored or logged. The request has a 10 second timeout. Gates in front of the provider
(outbound guard, sandbox org, allowance, consent) are unchanged. Texts stay at 279 characters or
fewer; email is unlimited.

## Environment variables (Vercel → hoa project → Production)

| Name | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio console → Account info |
| `TWILIO_AUTH_TOKEN` | Twilio console → Account info. Also the webhook signing key. |
| `TWILIO_MESSAGING_SERVICE_SID` | The Messaging Service (`MG…`) with the 10DLC campaign attached |
| `SMS_STATUS_WEBHOOK_ENABLED` | `true`, after the console steps below |

## Twilio console config (owner)

1. Create or open the Messaging Service (see `2026-10-20-sms-inbound.md`, step 1).
2. Nothing else is needed for receipts. Every send carries its own `StatusCallback`
   (`https://www.homeownerledger.com/api/webhooks/twilio/status`), so no per-service callback URL
   is required. If you also set a **Delivery Status Callback** on the service, use that same URL.
3. Set `SMS_STATUS_WEBHOOK_ENABLED=true` in Vercel production and redeploy. Check that the first
   test text's row moves to "delivered". If the route logs 403s instead, the URL Twilio called
   does not match `NEXT_PUBLIC_APP_URL`, or `TWILIO_AUTH_TOKEN` is wrong.
