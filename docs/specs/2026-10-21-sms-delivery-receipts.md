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

## Outbound texts use the Messages API (BL-146b, done)

`lib/sms.ts` sends with the Messages API (`vonage.messages.send`, channel `sms`, type `text`). It
authenticates with Basic auth from the existing `VONAGE_API_KEY` / `VONAGE_API_SECRET`, so no new
env var or key is needed. Vonage answers 202 with `message_uuid`; `sendSms` returns it as
`messageSid`, and every caller (broadcast delivery, event alerts, resident notifications) stores it
in `communication_recipients.external_id`. That is the id this route matches receipts on.

Before BL-146b, texts went through the legacy SMS API (`vonage.sms.send`), whose `messageId` never
matched a Messages API receipt, and whose own receipts are signed differently (a `sig` parameter)
and are refused here. Rows sent before the switch keep their legacy id and will never match.

Errors: a non-2xx from the Messages API throws a `VetchError`; `sendSms` reads its RFC 7807 body
and stores the `title` (else the `detail`, with any 7+ digit run masked) as the row's reason, as it
stored the legacy `errorText` before. Gates in front of the provider are unchanged.

**Where the receipts go.** With Basic auth there is no Application in the request, so Vonage
posts Messages API status webhooks to the **account-level** Status URL (Dashboard → API Settings →
Messages API), not the Application's Status URL. Set the same URL in both places (OA-27).

## Environment variables (Vercel → hoa project → Production)

| Name | Value |
|---|---|
| `VONAGE_SIGNATURE_SECRET` | Already set if OA-23 is done. Vonage dashboard → Settings → Signature secret. |
| `SMS_STATUS_WEBHOOK_ENABLED` | `true`, after the dashboard steps below (the send switch has landed) |
| `VONAGE_API_KEY` | Already set for sending. When present, the JWT's `api_key` claim must match it. |

## Vonage dashboard config (owner)

1. Use the same Application as OA-23 (Messages capability). Set its **Status URL** to
   `https://www.homeownerledger.com/api/webhooks/vonage/status`, method `POST`.
2. Also set the account-level Messages API **Status URL** (Dashboard → API Settings) to the same
   URL. Sends use Basic auth, so this is where Vonage actually posts their receipts.
3. Make sure signed webhooks use the signature secret in `VONAGE_SIGNATURE_SECRET` (HS256).
4. Set `SMS_STATUS_WEBHOOK_ENABLED=true` in Vercel production and redeploy. Check that the first
   test text's row moves to "delivered"; if the route logs 401s instead, the account-level
   webhooks are not being signed, and the signed-webhooks setting needs checking in the dashboard.
