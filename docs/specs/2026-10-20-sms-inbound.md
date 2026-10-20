# Inbound STOP / START / HELP over SMS (BL-111)

- **Date:** 2026-10-20
- **Status:** Built. **Off by default** (`SMS_INBOUND_ENABLED`). Needs the owner to configure Vonage before it is turned on.
- **Code:**
  - `apps/hoa/src/app/api/webhooks/vonage/inbound/route.ts` (the route)
  - `apps/hoa/src/lib/sms-inbound.ts` (the logic)
  - `apps/hoa/src/lib/sms-consent-ledger.ts` (number → resident)

## What it does

Vonage posts each text a resident sends to our number to `POST /api/webhooks/vonage/inbound`.

| Message | Effect |
|---|---|
| **STOP-family:** `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`. Matched as the first word, so "Stop please" counts. | `sms_opt_in = false`, plus an `sms_consent_revoked` audit row (`method: 'sms_keyword'`). This applies to every resident, in any org, whose consent rows name the sender's number. |
| **START:** `START` or `UNSTOP` as the whole message | Re-enables texts **only** where a prior `sms_consent_granted` row names that number. It writes a new grant first (`method: 'sms_keyword'`, the prior disclosure version and hash, `restores_grant_id`, the number's hash plus any numbers still covered), and then sets `sms_opt_in = true`. If there is no prior consent, nothing changes. |
| **HELP:** `HELP` or `INFO` | Nothing is written and nothing is sent by us. Vonage's keyword auto-reply answers it (see dashboard config). |
| Anything else | Acknowledged (200) and ignored. |

**Number → resident.** The sender is normalised to E.164 and hashed with SHA-256. The hash is
looked up in `audit_log.metadata.phone_sha256` on `sms_consent_granted` rows, across all orgs,
with the service role. Under BL-111 a number is only ever texted when a consent row names it, so
every number we could have texted can be found this way. The raw number is never stored or
logged.

**Safety.**

- Writes go through the service role. The BL-110 trigger exempts the service role, and audit_log
  inserts are board/admin-only under RLS.
- Every write is checked. A failed write answers 500, so Vonage retries.
- Retries are idempotent:
  - The preference update just sets a value.
  - Each audit row carries Vonage's `message_uuid` and is skipped if one already exists for the
    same resident, action and message.
- Logs carry `message_uuid`, the keyword and counts. They never carry the number, its hash or the
  text.

## Request checks, in order

1. `SMS_INBOUND_ENABLED !== 'true'` → **404**. The route behaves as if it does not exist.
2. `VONAGE_SIGNATURE_SECRET` unset → **503** `not_configured`.
3. No `Authorization` header → **401** `missing_signature`. The body is not read.
4. Body read with the 1 MB cap (**413** over it).
5. Signed-webhook JWT verified → **401** on failure:
   - HS256, timing-safe.
   - `payload_hash` must be the SHA-256 of the exact body.
   - `iat` must be within 24 h, and no more than 5 min in the future.
   - `api_key` must equal `VONAGE_API_KEY` when that is set.
6. JSON parse (**400** `invalid_json`), then the keyword is acted on.

## Environment variables (Vercel → hoa project → Production)

| Name | Value |
|---|---|
| `VONAGE_SIGNATURE_SECRET` | Vonage dashboard → **Settings → Signature secret**. Copy the secret value. |
| `SMS_INBOUND_ENABLED` | `true`, set only after the dashboard steps below are done and one test passes |
| `VONAGE_API_KEY` | Already set for sending. When present, the JWT's `api_key` claim must match it. |

## Vonage dashboard config (owner)

1. **Use the Messages API for SMS.** Go to Dashboard → **Settings → API settings → SMS settings**
   and choose **"Messages API"**. Save.
   - Only Messages API webhooks are signed with a JWT. The legacy SMS API's inbound webhook is not
     verified by this route and would be refused (401).
   - Outbound sending (`lib/sms.ts`, legacy `sms.send` with key/secret) is unaffected.
2. **Signature secret.** Go to **Settings → Signature secret**. Note the secret and put it in
   `VONAGE_SIGNATURE_SECRET`. Use the method Vonage applies to Messages API JWTs, which is HS256
   with this secret.
3. **Create or choose an Application** with the **Messages** capability:
   - **Inbound URL:** `https://<hoa production domain>/api/webhooks/vonage/inbound`, method `POST`.
   - **Status URL:** may point at the same URL. Status callbacks carry no `text`, so they are
     acknowledged and ignored.
4. **Link the number.** Link the `VONAGE_FROM_NUMBER` virtual number to that Application, under
   **Numbers → Your numbers → Link**.
5. **HELP and STOP auto-replies.** For US 10DLC numbers, the campaign registration's opt-out and
   help keywords make the carrier or Vonage send the standard replies. Make sure the HELP reply
   names the association program and gives a contact. Example: "HomeownerHub texts for your
   association. Help: support@homeownerledger.com. Msg & data rates may apply. Reply STOP to
   stop." We never send a reply from this route.
6. **Turn it on and test.**
   1. Set `SMS_INBOUND_ENABLED=true` and redeploy.
   2. From a phone that agreed to texts in the portal, text `STOP`.
   3. Check that the resident's Account → Text messages panel shows texts off, and that an
      `sms_consent_revoked` row with `method = 'sms_keyword'` exists.
   4. Text `START` and check that texts are back on.

## Not in scope

- Replying to residents' other texts. These are ignored; a future inbox could take them.
- Legacy SMS API signed webhooks (`sig` parameter).
- A STOP from a number with no consent row. Such a number cannot be texted anyway under BL-111.
