# SMS delivery receipts from Vonage (BL-146)

- **Date:** 2026-10-21
- **Status:** Built. **Off by default** (`SMS_STATUS_WEBHOOK_ENABLED`). Owner setup: OA-27.
- **Code:**
  - `apps/hoa/src/app/api/webhooks/vonage/status/route.ts` (the route)
  - `apps/hoa/src/lib/sms-status.ts` (the row update)
  - `apps/hoa/src/lib/sms-inbound.ts` → `verifyVonageSignedWebhook` (the signature check, shared with the inbound route)

## What it does

Vonage posts a status for each text to `POST /api/webhooks/vonage/status`. The route finds the
text's `communication_recipients` row by Vonage's message id alone (`external_id`, channel `sms`)
and moves it forward:

| Vonage `status` | Row |
|---|---|
| `submitted` | `sent` (from `queued`), `sent_at` |
| `delivered` | `delivered` (from `queued` / `sent`), `delivered_at` |
| `rejected`, `undeliverable`, `failed` | `failed` (from `queued` / `sent`), `failed_at`, and a fixed `error_message` ("The carrier did not deliver this text (code 1320).") |
| anything else (`read`, …) | nothing |

- **Idempotent.** Timestamps are first-write-wins (`… is null`), and the status only moves forward.
  A retried or late receipt is a no-op. A `delivered` row never becomes `failed`.
- **No PII.** The row is matched on the provider id only. Logs carry the message id, the status
  and a count. The number, the text and Vonage's error detail are never logged. The stored reason
  is fixed wording plus Vonage's code when it is a short code.
- **Failures.** A failed write answers 500, so Vonage retries.

## Request checks, in order (the same as the inbound route)

1. `SMS_STATUS_WEBHOOK_ENABLED !== 'true'` → **404**.
2. `VONAGE_SIGNATURE_SECRET` unset → **503** `not_configured`.
3. No `Authorization` header → **401** `missing_signature`. The body is not read.
4. Body read with the 1 MB cap (**413** over it).
5. Vonage signed-webhook JWT (`Authorization: Bearer <jwt>`) → **401** on failure:
   - HS256 with the signature secret, compared timing-safe;
   - `payload_hash` must be the SHA-256 of the exact body;
   - `iat` within 24 h, at most 5 min in the future;
   - `api_key` must equal `VONAGE_API_KEY` when that is set.
6. JSON parse (**400** `invalid_json`), then the receipt is applied.

## Known gap: outbound texts use the legacy SMS API

`lib/sms.ts` sends with the legacy SMS API (`vonage.sms.send`), so `external_id` holds the SMS API
`messageId`. Only the Messages API sends JWT-signed status webhooks carrying `message_uuid`. The
legacy SMS API's delivery receipts are signed differently (a `sig` parameter), and this route
refuses them.

So receipts match only once outbound texts go through the Messages API, which stores its
`message_uuid` in `external_id`. Until that switch lands, turning this route on is harmless: an
unmatched receipt updates nothing and answers 200. It is also pointless. Turn it on only after the
send switch (backlog: BL-146 follow-up).

## Environment variables (Vercel → hoa project → Production)

| Name | Value |
|---|---|
| `VONAGE_SIGNATURE_SECRET` | Already set if OA-23 is done. Vonage dashboard → Settings → Signature secret. |
| `SMS_STATUS_WEBHOOK_ENABLED` | `true`, only after the dashboard step below and the send switch |
| `VONAGE_API_KEY` | Already set for sending. When present, the JWT's `api_key` claim must match it. |

## Vonage dashboard config (owner)

1. Use the same Application as OA-23 (Messages capability). Set its **Status URL** to
   `https://www.homeownerledger.com/api/webhooks/vonage/status`, method `POST`.
2. Make sure signed webhooks use the signature secret in `VONAGE_SIGNATURE_SECRET` (HS256).
3. Set `SMS_STATUS_WEBHOOK_ENABLED=true` in Vercel production and redeploy.
