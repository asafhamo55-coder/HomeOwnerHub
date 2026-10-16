---
name: api-route-conventions
description: Use when writing, fixing or reviewing any apps/hoa/src/app/api/**/route.ts handler — the numbered RC-1..RC-13 checklist every route handler must satisfy, and the shared helpers in apps/hoa/src/lib/api/ that implement it.
---

# API route conventions (apps/hoa)

Every HOA route handler under `apps/hoa/src/app/api/**/route.ts` meets **every** rule below. The
rules come from the 2026-10-16 audit (`PROBLEMS.md`: R-01..R-22, C-01..C-18, X-01). The shared
helpers implement them, so following a rule usually means calling the helper, not writing code.

| Helper | File | Gives you |
|---|---|---|
| `withRoute(name, handler)` | `lib/api/handler.ts` | Turns a thrown `ApiRouteError` into its envelope and any other throw into a generic JSON 500. Logs the code only and reports to Sentry. |
| `apiError(code, message?, extra?, headers?)`, `ApiRouteError` | `lib/api/errors.ts` | The one envelope and the fixed status map. |
| `requireRouteUser`, `requireRouteMember`, `requireRouteBoardOrAdmin`, `requireRoutePlatformAdmin`, `requireOrgOwned` | `lib/api/auth.ts` | Auth and role gates built on the existing `getCurrentUserRole` / `requireBoardOrAdminForAction`. |
| `parseJson(req, Schema, {maxBytes})`, `parseForm`, `parseQuery`, `parseValue` | `lib/api/parse.ts` | Parsing with a size cap; 400/413 envelopes with field issues. |
| `zText`, `zUuid`, `zDateOnly`, `zIsoDateTime`, `zCents` | `lib/api/schemas.ts` | Bounded strings, real dates, integer cents. |
| `MAX_UPLOAD_BYTES`, `MAX_JSON_BYTES`, `MAX_FORM_BYTES`, `MAX_SHORT_TEXT`, `MAX_LONG_TEXT`, `MAX_DOCUMENT_TEXT`, `MAX_ARRAY_ITEMS` | `lib/api/limits.ts` | The shared limits. |
| `requireBearerSecret(req, 'ENV_NAME')`, `secretMatches` | `lib/api/secrets.ts` | Bearer-only, timing-safe secrets that fail closed. |
| `checkWrite(result, where, ctx, {conflict})` | `lib/api/db.ts` | Checks a Supabase write's error and maps 23505 to 409. |
| `logRouteFailure(where, err, ctx)`, `errorCode(err)` | `lib/api/log.ts` | Logs ids and codes, never messages. |
| `apiErrorMessage(body, fallback)`, `responseErrorMessage(res, fallback)` | `lib/api/client.ts` | Client side: the message to show a person. |
| `readAll`, `readAllResult` | `lib/supabase/read-all.ts` | Full reads past the 1000-row cap. |

Middleware (`src/middleware.ts`) already answers `/api/*` without a session (or past the 24 h cap)
with the JSON 401 envelope, not a 307 to `/login`. Its exclusions are anchored. A route still runs
its own auth (RC-3). Do not rely on middleware for it.

## Canonical shape

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin, requireOrgOwned } from '@/lib/api/auth'
import { parseJson } from '@/lib/api/parse'
import { zText, zUuid, zDateOnly } from '@/lib/api/schemas'
import { MAX_LONG_TEXT } from '@/lib/api/limits'
import { checkWrite } from '@/lib/api/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const Body = z.object({
  associationId: zUuid,
  title: zText(200, 1),
  notes: zText(MAX_LONG_TEXT).optional(),
  effectiveDate: zDateOnly.optional(),
})

export const POST = withRoute('things.create', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin()        // auth + role (401/403)
  const body = await parseJson(request, Body)               // parse + validate (400/413)
  await requireOrgOwned('associations', body.associationId, orgId) // client ids (404)

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.from('things').insert({ ... }).select('id').single()
  checkWrite({ error }, 'things.insert', { orgId })         // never ignore a write error
  if (!data) throw new ApiRouteError('internal')

  return NextResponse.json({ thingId: data.id }, { status: 201 }) // camelCase, 2xx
})
```

A dynamic route types its context:
`withRoute('vendors.documents', async (request, ctx: { params: Promise<{ id: string }> }) => …)`.

---

## RC-1 — One error envelope, one status map

Every non-2xx response body is exactly:

```json
{ "error": { "code": "<code>", "message": "<text for a person>", "...extra": "camelCase" } }
```

Build it with `apiError(code, message?, extra?)` or `throw new ApiRouteError(code, message?, extra?)`.
The status comes from the code. **Never** set a 4xx or 5xx status by hand, and never write
`NextResponse.json({ error: … })` yourself.

| Status | `code` | Use |
|---|---|---|
| 400 | `invalid_json` | The body is not JSON (or is empty). |
| 400 | `validation_failed` | A schema miss. `extra.issues: [{ path, message }]`. Never raw Zod JSON. A malformed multipart body is also `validation_failed`. |
| 401 | `unauthenticated` | No session, or a wrong or missing machine secret. |
| 403 | `forbidden` | Signed in, but the wrong role, or no HOA org (`reason: 'no_org'`). |
| 404 | `not_found` | Does not exist, or is not visible to the caller, **including an unknown token** and a foreign client-supplied id. |
| 409 | `conflict` | Duplicate or concurrent create, or already submitted. Put the specific case in `reason`. |
| 410 | `gone` | **Only** for a token we recognise that has expired, been revoked or been used. An unknown token is 404. |
| 413 | `payload_too_large` | Over a body, string or upload limit. `extra.maxBytes`. Not 400. |
| 415 | `unsupported_media_type` | An upload's MIME type is not on the allowlist. |
| 422 | `unprocessable` | A well-formed request the domain refuses: a statute refusal, a closed period. The specific case goes in `reason`. |
| 429 | `rate_limited` | Reserved. Send a `Retry-After` header. See RC-13. |
| 500 | `internal` | Anything unexpected. The message is **always** the generic default, because `apiError` ignores a caller's message for this code. |
| 503 | `not_configured` | A required env var or secret is unset, or a bucket is missing. Fail closed. |
| 503 | `upstream_unavailable` | The AI provider, Plaid, Stripe or Resend is down or erroring. |

- **Sub-codes.** A sub-code a client may branch on goes in `extra.reason` as a stable snake_case
  string (`already_submitted`, `statute_refusal`, `unit_not_found`). Do not invent a top-level code.
- **One answer per situation.**
  - A missing config is 503, not 500 or 400.
  - An oversized request is 413, not 400.
  - A bad upload type is 415.
  - A model or provider failure is 503 `upstream_unavailable`. A model reply we cannot use is also
    503 `upstream_unavailable`, not 502.
  - A unit or row we cannot find is 404, never a 503 "AI unavailable" (R-06).
- **Success bodies.** A success body is 2xx and carries no `error` key and no `ok: false`.
- **Redirect routes** (OAuth start and callback) redirect with `?error=<code>`. A code is allowed
  there; never a message (RC-2).

## RC-2 — Never return raw error text; log ids and codes only

- **Responses.** Never put `err.message`, `error.message`, `e.message`, `String(err)`, a ZodError
  (`.issues`, `.flatten()`, `.format()`) or any provider response body into a response, a redirect
  URL or a 200 body field (such as an `embeddingError`). Raw DB, storage and provider text names
  tables, constraints, columns and values (R-04, R-05).
- **Logs.** Use `logRouteFailure(where, err, { orgId, rowId, count })` or `checkWrite`.
  - Context holds **ids, counts and error codes** only.
  - Never emails, names, addresses, subjects, bodies or `.message`. A Postgres message embeds the
    offending value.
  - This also covers `console.*` inside routes: `console.error('x', error.message)` is a violation.
  - Sentry gets the error object through `withRoute`, and its scrubber handles it.
- **Error summaries** (cron and batch) list ids and codes, never recipient emails (X-01).
- **Public diagnostics** (`/api/health`):
  - The unauthenticated body is minimal: `{ ok, app, version }`.
  - No probe `detail` text, no branch name, no "which secrets are unset" booleans.
  - No billed outbound call on an unauthenticated poll.
  - Details sit behind `requireBearerSecret` with a dedicated env var (C-15).

## RC-3 — Order: wrap → auth → role → parse → validate → work

1. `export const METHOD = withRoute('<area>.<action>', …)`.
2. Auth: `requireRouteUser`, or a gate that implies it. For a machine caller, `requireBearerSecret`.
   For a public token route, validate the token.
3. Role: `requireRouteBoardOrAdmin` / `requireRouteMember` / `requireRoutePlatformAdmin`.
4. Parse: `parseJson` / `parseForm` / `parseQuery`, with a size cap.
5. Validate: the zod schema passed to the parser, then `requireOrgOwned` for client-supplied ids.
6. Work.

Never read or validate the body before auth (R-16): a signed-out or resident caller gets 401/403,
never a 400 that confirms the schema. Config checks that need no caller input (`not_configured`)
may come first only on machine-secret routes.

## RC-4 — Role gates

- **Board-only surfaces** call `requireRouteBoardOrAdmin()`, the shared gate. It wraps
  `requireBoardOrAdminForAction` with `BOARD_ONLY_DENIED`, the same role model the server actions
  use. Do not write a second role check.
  - A surface is board-only when every in-app caller lives under `app/(dashboard)`.
  - That includes AI drafting, rewrite, suggest-fields, meeting-summary, analyze-violation, the
    violation photo upload, vendor documents, governing docs, Plaid and data export.
- **Residents get 403, not 404.** Do not let an RLS-filtered lookup answer a resident with
  "not found" on a board surface (R-02). The gate runs first.
- **Resident-callable routes** (for example `ask-docs`) call `requireRouteMember()`, with a one-line
  comment saying why residents may call it. Anything they can reach must not return other
  residents' data.
- **Service role needs its own gate.** A route that calls `createAdminClient()`, or a workflow that
  uses the service role (W1, W3, …), **must** do its own role gate first. The workflow trusts its
  caller (R-01).
- **Client-supplied ids** (`associationId`, `fundId`, `unitId`, `vendorId`, `documentId`, …) go
  through `requireOrgOwned(table, id, orgId)` before they are written, used in a storage path, or
  passed to a service-role workflow. It returns 404 when the id is foreign or missing (R-18).
- **The org id** always comes from the gate, never from the request.
- **Storage paths** are built server-side under `${orgId}/…`. Never forward a client-supplied URL
  to a third party (the vision provider, a fetch). Accept a storage path, check the `${orgId}/`
  prefix and sign it server-side (R-22).

## RC-5 — Public token routes

The `rfp-bid` and `vendor-onboard` routes, and any future token route:
- An unknown or malformed token is 404 `not_found`.
- A recognised but expired, revoked or used token is 410 `gone`.
- A second submit is 409 `conflict` with a `reason`.
- Claim or consume the token atomically (`update … where status <> 'submitted' returning`), or rely
  on a unique constraint mapped through `checkWrite(…, { conflict })`. Never check-then-insert
  alone (R-07, R-08).
- Apply every RC-8 limit. These callers are unauthenticated.

## RC-6 — Every write is checked; webhooks retry on failure

- **Every write.** Every Supabase `insert` / `update` / `upsert` / `delete` / `rpc` and every
  storage `upload` / `remove` result goes through `checkWrite({ error }, '<where>', ctx)`, or an
  explicit `if (error)` that logs a code and returns an envelope. An ignored `{ error }` is a defect
  (R-09, R-10, R-19, X-01).
- **Unique violations.** `23505` maps to 409 through `checkWrite(…, { conflict: { reason, message } })`.
- **Partial writes.** Compensate in reverse order: remove the uploaded object, delete the
  half-inserted row, `itemRemove` the minted Plaid item. If you cannot compensate, say in a comment
  what is left behind. Do not answer success after a failed step.
- **Webhooks and cron.**
  - Return non-2xx (500 `internal`) when persistence fails, so the sender retries.
  - Return 2xx only once the event is persisted, or deliberately ignored (an unknown event type, a
    duplicate delivery).
  - Dedupe on the provider's delivery id or a unique external id.
  - Never move a status backwards (a late `delivered` must not overwrite `clicked`).
  - Claim work atomically, so overlapping cron runs do not double-send.
  - A missing signing secret is 503 `not_configured`.

## RC-7 — Secrets

- Machine callers authenticate with `Authorization: Bearer <secret>` **only**, through
  `requireBearerSecret(request, 'ENV_NAME')`. It is timing-safe and fails closed (503 when unset,
  401 on a mismatch).
- No `?key=` or any other query-string secret: query strings land in access logs.
- No `===` / `!==` against a secret.
- No reading `authorization` or `x-*-key` headers by hand.
- **One env var per purpose.** `CRON_SECRET` is for Vercel cron only. Ops probes, Stripe price
  setup and manual ingest each get their own (R-21 / C-06).
- Provider signatures (Stripe `constructEvent`, Svix HMAC, Inngest) keep their SDK or HMAC check.
  That is already timing-safe.

## RC-8 — Size limits and validated inputs

- **JSON bodies** go through `parseJson(req, Schema, { maxBytes })`, which defaults to
  `MAX_JSON_BYTES` (1 MB). Raise it only with a comment.
- **Strings.** Every `z.string()` has a `.max()`. Use `zText(MAX_SHORT_TEXT | MAX_LONG_TEXT |
  MAX_DOCUMENT_TEXT)`. Transcripts, `rawText`, `pastedText` and descriptions are no exception (R-17).
- **Arrays.** Every array has `.max(MAX_ARRAY_ITEMS)` or a tighter bound.
- **Records.** Every record (`z.record`) is bounded or replaced with an explicit object.
- **Uploads.**
  - Read the form with `parseForm`.
  - Check `file.size > MAX_UPLOAD_BYTES` and return 413. That is the **one** shared limit; no local
    `MAX_BYTES` constants.
  - Check the MIME type against an allowlist and return 415.
- **Dates.** Date-only fields use `zDateOnly` (a real calendar date). Timestamps use `zIsoDateTime`.
  A bad date is a 400, never a Postgres 22007 surfacing as a 500 (C-11).
- **Ids** use `zUuid` and **money** uses `zCents` (RC-11).
- **Form fields** are validated with `parseValue(Schema, Object.fromEntries(form))` or a schema per
  field. No hand-rolled `typeof` chains.

## RC-9 — Reads are bounded on purpose

- **A full set** (a total, an export, a cron sweep) is read with `readAll` / `readAllResult` and a
  stable `.order('id')`, or a count-only query (`{ count: 'exact', head: true }`).
- **Never** treat `.limit(1000)`, or no limit, as "all" (R-11, R-12). PostgREST silently caps at 1000.
- **A list returned to a client** is paginated explicitly: a `limit` capped at 100 by default, with
  a cursor or offset validated by `parseQuery`. A total comes from a count query, not from
  `array.length`.
- **Cross-org service-role sweeps** (cron) page with `readAll`, or page per org.
- `src/row-cap-ratchet.test.ts` enforces the over-cap shapes.

## RC-10 — No throw escapes

- **Every exported method** is `export const METHOD = withRoute('<area>.<action>', handler)`. No
  `export async function POST`.
- **`withRoute`** converts any throw into a JSON 500 `internal`. It rethrows Next's
  `redirect()` / `notFound()` control flow.
- **`request.formData()` and `request.json()`** are only ever called through `parseForm` /
  `parseJson`. A malformed body is a 400, not a 500 (R-20).
- **Exempt.** `inngest/route.ts` (owned by the SDK) and `cron/sentry-test/route.ts` (it deliberately
  throws to exercise `onRequestError`). They are listed in the ratchet's `EXEMPT` with reasons.

## RC-11 — Response shape: camelCase, cents, ISO dates

- **Fields.** Response JSON fields are camelCase (`itemId`, `institutionName`, `bankAccountIds`,
  `linkToken`, `ageDays`, `staleCount`). Map DB rows at the boundary; never return a raw snake_case
  row (C-09).
- **Third-party fields** that must pass through verbatim go under one nested key (`plaid: { … }`).
- **Money** is integer cents in fields named `*Cents`, in requests and responses. Convert to and
  from `numeric` dollars in one place (C-10).
- **Dates.** Date-only values are `YYYY-MM-DD` strings. Timestamps are ISO 8601 UTC
  (`toISOString()`).
- **New request fields** are camelCase. The public vendor endpoints keep their existing snake_case
  request fields until they are versioned. Do not add more snake_case fields.

## RC-12 — Callers, tests and the ratchet move with the route

When you bring a route into line:
1. **Callers.** Update every in-app caller (`git grep '/api/<path>'`) to read failures with
   `responseErrorMessage(res, fallback)` or `apiErrorMessage(body, fallback)` from
   `lib/api/client.ts`. A caller that reads `body.error` as a string would otherwise show
   `[object Object]`. Check `res.ok` before using the body.
2. **Unit test.** Add or extend a unit test that calls the handler directly and proves the rules
   you touched:
   - a resident gets 403 on a board route (add it to `src/lib/board-write-gates.test.ts`);
   - bad JSON gets 400 `invalid_json`;
   - a schema miss gets 400 `validation_failed` with `issues`;
   - an oversized body gets 413;
   - a forced DB or provider failure gets the generic envelope with no raw text;
   - a webhook persistence failure gets non-2xx.
3. **Ratchet.** Delete **your route's line** from `ALLOWLIST` in
   `apps/hoa/src/api-route-conventions.test.ts`. Never add a line. Leave the blank separator lines.
4. **Gates.** Run `pnpm typecheck` (expect `Tasks: N successful`), `pnpm test:unit` and
   `rtk pnpm build`.

## RC-13 — No per-process state

- No in-memory rate limiters, caches or `globalThis` stashes in a route. Serverless instances do
  not share memory, so they give a false sense of protection.
- Rate limiting, when it lands, is shared (DB or KV) and answers 429 `rate_limited` with
  `Retry-After`.
- Supabase clients are created per request.

---

## What the ratchet checks vs what a reviewer must check

`apps/hoa/src/api-route-conventions.test.ts` mechanically enforces:

| Ratchet rule | Rule |
|---|---|
| `with-route` | RC-10 |
| `api-error` (no hand-set 4xx or 5xx status, no hand-built `{ error }` body) | RC-1 |
| `error-message` | RC-2 |
| `raw-zod` | RC-2 |
| `query-secret` | RC-7 |
| `secret-header` | RC-7 |

A passing ratchet is necessary, **not sufficient**. An adversarial reviewer verifies each fixed
route against every rule:

- [ ] **RC-1.** Every non-2xx path returns the envelope with the mapped code. Look at statuses
      passed in variables too, e.g. `status: ok ? 200 : 503`.
- [ ] **RC-1.** No code is invented. 410 is used only for a recognised token. 413 is used for size.
- [ ] **RC-2.** No raw text reaches a response, a redirect URL, a 200 field or a log line. Grep
      `message`, `String(`, `JSON.stringify(err`.
- [ ] **RC-3.** Auth and role come before any body read, and the order holds on every branch.
- [ ] **RC-4.** Board-only surfaces use `requireRouteBoardOrAdmin`, and a resident gets 403.
      Service-role work is gated. Every client-supplied foreign id passes `requireOrgOwned`. The
      org id comes from the gate.
- [ ] **RC-5.** Tokens: unknown 404, expired 410, duplicate 409. Claims are atomic.
- [ ] **RC-6.** Every write result is checked. Partial writes are compensated. Webhooks return
      non-2xx on a failed persist.
- [ ] **RC-7.** Bearer only, through `requireBearerSecret`, with one env var per purpose.
- [ ] **RC-8.** Every string, array and record is bounded. Uploads use `MAX_UPLOAD_BYTES` and
      return 413/415. Dates use `zDateOnly` / `zIsoDateTime`.
- [ ] **RC-9.** No silent 1000-row reads. Lists paginate explicitly.
- [ ] **RC-10.** The route is wrapped in `withRoute`, and `formData` / `json` are only read through
      the parsers.
- [ ] **RC-11.** Response fields are camelCase, money is `*Cents`, and dates are ISO or date-only.
- [ ] **RC-12.** Callers are updated, tests are added, the allowlist line is removed, and the gates
      ran for real.
- [ ] **RC-13.** No module-level state.

## Finding → rule index

| Finding | Rule |
|---|---|
| R-01 / C-01 | RC-4 |
| R-02 / C-08 / C-14 | RC-4 |
| R-03 / C-03 | middleware + RC-1 |
| R-04 / R-05 | RC-2 |
| R-06 | RC-1 |
| R-07 / R-08 | RC-5 + RC-6 |
| R-09 / C-04 | RC-6 + RC-2 |
| R-10 / C-18 | RC-6 |
| R-11 / R-12 | RC-9 |
| R-14 / R-15 / C-12 | RC-1 |
| R-16 | RC-3 |
| R-17 / C-11 | RC-8 |
| R-18 | RC-4 |
| R-19 | RC-6 |
| R-20 | RC-10 |
| R-21 / C-06 | RC-7 |
| R-22 | RC-4 |
| C-05 | RC-1 + RC-7 |
| C-07 | RC-8 + RC-4 |
| C-09 | RC-11 |
| C-10 | RC-11 |
| C-15 | RC-2 |
| C-16 | middleware |
| X-01 | RC-6 + RC-9 + RC-2 |
