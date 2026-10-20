# BL-103: Stripe sandbox suite

An automated suite that runs every payment path the app has against
**Stripe test mode**. It lives in `tests/stripe-sandbox/`, has its own
vitest config, and runs in `.github/workflows/stripe-sandbox.yml`.

It never touches live Stripe, never uses a database, and sends no email or
SMS. Customer emails are `@example.com`, and test mode sends no receipts.

## 1. What the app does with Stripe today

Stripe is used only for **board/org subscriptions**. Resident payments
(BL-035, card/ACH dues) are **not built**. No code creates a PaymentIntent,
SetupIntent or Connect account for a resident. `apps/hoa/src/lib/billing.ts`
bills an org only, and the resident portal has no payment code.

BL-068 per-module pricing is also not built (it is in migration batch M2).
The plans are the two per-door Prices: `monthly` and `annual`.

### Stripe API calls (all server-side)

| Where | Call |
| --- | --- |
| `packages/billing/src/checkout.ts` `createCheckoutSession` | `checkout.sessions.create`: mode `subscription` (HOA) or `payment` (eviction per-case), one line item with `quantity`, `metadata.org_id/plan`, `subscription_data.metadata`, `customer` or `customer_email`, `allow_promotion_codes: true` |
| `packages/billing/src/checkout.ts` `createPortalSession` | `billingPortal.sessions.create` (no `configuration`, so the account's default portal config applies) |
| `packages/billing/src/webhook.ts` | `webhooks.constructEvent` (a local HMAC, no network) |
| `apps/hoa/src/lib/billing.ts` `resolvePriceId` | `prices.search` by `lookup_key` (`hoa_per_door_monthly` / `hoa_per_door_annual`) |
| `apps/hoa/src/app/api/admin/setup-stripe-pricing/route.ts` | `products.list` (auto-paged), `products.create`, `prices.search`, `prices.create` (499¢/month and 5388¢/year, both per door) |

The client is pinned to API version `2025-09-30.clover` (stripe-node 17.7.0).
The pm and eviction apps call the same `createCheckoutSession`,
`createPortalSession` and `handleStripeWebhook`.

### Webhook events handled

| Event | Effect |
| --- | --- |
| `checkout.session.completed`, mode `subscription` | org gets `plan`, `stripe_customer_id` and `stripe_sub_id` (pre-M1: a direct update; M1: `stripe_webhook_checkout_subscription`) |
| `checkout.session.completed`, mode `payment` | stamps `stripe_customer_id`, plus `eviction_cases.stripe_payment_id` when there is a `case_id` |
| `customer.subscription.deleted` | org goes to `free` (pre-M1: matched by customer; M1: matched by subscription id, so it does not depend on delivery order) |
| `customer.subscription.updated` | for the org whose `stripe_sub_id` is this subscription only. `canceled` / `incomplete_expired` downgrade like a deletion. Otherwise the plan is kept; a price switch (lookup key, or the configured `STRIPE_PRICE_PER_DOOR_*` ids) reaches `orgs.plan` **under M1 only**, through `stripe_webhook_checkout_subscription` (before 0064 the plan check refuses `monthly` / `annual`); a quantity that differs from `billableDoors(doors_count)` syncs `doors_count`. Every applied update appends an `audit_log` row (`billing.subscription_updated`: event id and time, sub id, status, plan, quantity) |
| `invoice.payment_failed` | appends an `audit_log` row (`billing.invoice_payment_failed`: event id and time, invoice id, sub id, attempt count) for the org on that subscription; the plan is untouched (Stripe retries) |
| anything else | `ignored` (200) |

**Ordering and idempotency for the two audit-backed events.** 0064 has no
function for them and this change adds no migration, so the audit rows are
the clock: an update is applied only if it is later, by (`event.created`,
event id), than every update already applied for that subscription;
otherwise it is `ignored: stale_event`. A recorded event id is a
`duplicate`. The audit row is written last, so a failure part-way answers
500 and the redelivery redoes the (idempotent) writes. A failed read is
`read_failed`, also 500. Residual: two deliveries for one subscription
processed concurrently can both pass the check (no row lock without a SQL
function); the next event for it corrects the state.

**The banner.** `apps/hoa/src/components/billing/BillingStatusBanner.tsx`,
mounted in the dashboard layout, reads those rows for the org's current
subscription (`billingAttention`): `past_due` / `unpaid` / `paused`, or a
failed invoice newer than the last status, shows a warning on every board
page until a later `active` clears it. Admins get an "Update payment
method" button into the Stripe billing portal; board members are told to
ask an admin.

**Checkout errors.** `startHoaCheckout` never shows or logs Stripe's
message: the log gets the error's type and code (`stripeErrorFacts`), the
board gets `checkoutErrorMessage` (a retry hint when Stripe was unreachable,
otherwise a generic message with the support address).

**Manual step (live endpoint).** The production `/api/webhooks/stripe`
endpoint in the Stripe dashboard must have `customer.subscription.updated`
and `invoice.payment_failed` selected, or neither reaches the app. Stripe
only delivers the events an endpoint lists.

### Payment-method types

The app sets **no `payment_method_types`** on any Checkout session, so the
account's dashboard payment-method configuration decides what a board sees.
The code enables nothing explicitly, ACH included. The suite records what
the test account actually offers (`payment_method_types` on a real session)
in the job summary. It runs the ACH cases only when `us_bank_account` is
offered, and otherwise asserts and records that ACH is not enabled.

## 2. Is production on live or test keys?

**It cannot be determined from the public bundle.** The app never ships a
publishable key to the browser. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` appears
only in `.env.example` files. No source file reads it, and the HOA app does
not load Stripe.js, because Checkout is a server-side redirect.

A crawl of every JS chunk served for `/login`, `/signup` and `/` on
https://www.homeownerledger.com found **0** `pk_live_`, **0** `pk_test_`,
and no `stripe` string at all. This was on 2026-10-19, against deploy
`eb4f5228`.

To find out, without reading a secret, Asaf can do either of these:

- Start a checkout from Settings → Billing. A `cs_live_` session id in the
  `checkout.stripe.com` URL means live; `cs_test_` means test.
- Look in the Stripe dashboard for the mode that `/api/webhooks/stripe` is
  registered under.

## 3. Setting it up

### 3.1 Test secret key

1. In the Stripe dashboard, turn on **Test mode** (the toggle at the top
   right) or open a Sandbox.
2. Go to **Developers → API keys**.
3. Copy the **Secret key**. It must start with `sk_test_`. A restricted
   test key (`rk_test_`) is not accepted.

### 3.2 Test webhook secret

You can use either of these. They are equivalent for the suite, which signs
its own payloads with the secret and does not need Stripe to deliver
anything.

- **A test-mode endpoint:** in test mode, go to Developers → Webhooks →
  Add endpoint. Use any URL (e.g. a preview deployment's
  `/api/webhooks/stripe`). Select the handled events, then copy the
  endpoint's **Signing secret** (`whsec_...`).
- **The CLI:** run `stripe login`, then
  `stripe listen --forward-to localhost:3000/api/webhooks/stripe`. It prints
  `Ready! Your webhook signing secret is whsec_...`. That secret is stable
  per CLI device and account.

### 3.3 Customer portal (one time)

In test mode, open Settings → Billing → Customer portal and press
**Save**. Until a default configuration exists,
`billingPortal.sessions.create` fails, and the portal case says so. Live
mode needs the same step, because the app passes no configuration id.

### 3.4 GitHub secrets

```bash
gh secret set STRIPE_TEST_SECRET_KEY        # paste the sk_test_ key at the prompt
gh secret set STRIPE_TEST_WEBHOOK_SECRET    # paste the whsec_ secret at the prompt
```

Paste each value at the prompt rather than passing it on the command line,
so it does not end up in your shell history. Never set these to the
production values. The workflow reads only these two secrets.

### 3.5 Running it

```bash
pnpm test:stripe-sandbox
```

- With no key, or a key that is not `sk_test_`, every case is skipped with a
  one-line reason, and the command exits 0.
- With `sk_live_` / `rk_live_` in `STRIPE_TEST_SECRET_KEY` **or**
  `STRIPE_SECRET_KEY`, the run hard-fails before any test loads. It
  never echoes the key.
- With an `sk_test_` key, it first asks Stripe (`balance.retrieve`) and
  stops if Stripe reports live mode. It then points the app's
  `STRIPE_SECRET_KEY` at the test key for the run's own process.

CI runs it on `workflow_dispatch`, nightly at 07:17 UTC, and on PRs or
pushes that touch billing, the Stripe routes, the billing UI or the suite.
It is **not** a required check or a deploy gate.

## 4. What the suite covers

All cases call the app's own functions (`createCheckoutSession`,
`createPortalSession`, `handleStripeWebhook`, and the HOA route's `POST`)
wherever the app has one.

| File | Cases |
| --- | --- |
| `checkout.sandbox.test.ts` | Both plans × door counts 0, 10, 40, 41, 42, 180 and 1000. Each asserts quantity = `billableDoors`, Stripe `amount_total` = unit × quantity, `cs_test_`, metadata, success URL and line item. Also: the minimum bill ($204.59 / $2,209.08); Stripe rejecting a non-integer quantity, and `billableDoors` never producing one; customer reuse; one-time `payment` mode with `case_id`; and a record of the payment-method types offered |
| `cards.sandbox.test.ts` | `pm_card_visa` succeeds. `pm_card_chargeDeclined` is declined (`generic_decline`). `pm_card_visa_chargeDeclinedInsufficientFunds` is declined (`insufficient_funds`). `pm_card_authenticationRequired` returns `requires_action` (3DS). As a subscription's first invoice: visa makes it active and paid; 3DS leaves it `incomplete`; `pm_card_chargeCustomerFail` is refused |
| `ach.sandbox.test.ts` | Asserts and records whether Checkout offers `us_bank_account`. If it does: microdeposit verification by amounts and then success, verification by descriptor code, wrong amounts refused, and closed account `000111111116` failing |
| `lifecycle.sandbox.test.ts` | Runs on test clocks. Trial → active → renewal. Failed renewal → `past_due`: the real failed invoice and the real `past_due` subscription signed into the handler (both M1 states) raise the banner, then recovery by a new card and `invoices.pay`, whose `active` clears it. Cancel at period end, with the real `customer.subscription.deleted` downgrading the org both pre-M1 and under M1. A quantity change (41 → 180) mid-cycle with proration, then monthly → annual with a credit for the unused time. The real updates through the handler: the quantity syncs `doors_count`; the switch reaches `orgs.plan` under M1 and is recorded only before it |
| `portal.sandbox.test.ts` | A portal session URL, plus a record of what the default portal config allows |
| `webhook.sandbox.test.ts` | Every handled event, signed with `STRIPE_TEST_WEBHOOK_SECRET` via `generateTestHeaderString`, with M1 both off and on. `customer.subscription.updated` past_due → banner → active clears it, a plan switch (M1 on vs off), a quantity sync, `canceled` downgrading, duplicate and stale updates; `invoice.payment_failed` recorded, or ignored for an unknown subscription. Also: idempotency (same event twice); out-of-order delivery (late deletion of the old subscription, deletion before its checkout, and the known pre-M1 defect); unknown events ignored; wrong secret, tampered body, stale timestamp and missing header. Through the real route: 400 bad signature, 200 handled, 200 ignored, 500 on a rejected write, 500 then 200 for a subscription update whose db read fails once |

The webhook cases use `tests/stripe-sandbox/lib/memdb.ts`, an in-memory
`WebhookDb`. It models the pre-M1 table updates, the `orgs` / `audit_log`
selects (JSON-path filters and ordering) and `audit_log` inserts, and the three
`stripe_webhook_*` functions from `0064_m1_batch.sql`, including
`orgs_plan_check` before and after 0064. Its unit test replays the same
orderings and outcomes as the real-Postgres
`tests/integration/security/m1-batch.test.ts`.

**Cleanup.** Every object created is tagged with
`metadata.bl103_suite=stripe-sandbox` and registered. After each file, the
registry:

- expires sessions
- cancels open PaymentIntents and subscriptions
- deletes customers and test clocks
- archives prices (Stripe cannot delete a price)
- deletes or archives the product

The file fails if anything could not be removed. On start, `global-setup`
also sweeps tagged leftovers older than an hour from a crashed run.
PaymentIntents and archived prices stay visible in test mode, because Stripe
offers no deletion for them.

The pure helpers (`guard`, `memdb`, `events`, `cleanup`, `poll`, `report`)
are unit-tested in `pnpm test:unit`.

## 5. Bugs found and fixed

1. **Pre-M1 webhook writes ignored their errors**
   (`packages/billing/src/webhook.ts`). All four direct updates awaited the
   result and dropped `error`, so a rejected write still answered 200 and
   Stripe never redelivered. This is a real failure today: before 0064,
   `orgs_plan_check` does not allow `monthly` / `annual`, so every HOA
   subscription write failed with 23514 and was acknowledged. A paying
   board stayed on `free`.

   The handler now returns `persist_failed` with the code. Expect 500s on
   HOA subscription checkouts until 0064 is applied. Stripe retries for up
   to 3 days, and once 0064 lands the redeliveries succeed.
2. **The webhook route answered every failure with 400.** It now uses
   `webhookHttpStatus`: 400 for a missing or bad signature, 500 for
   failures on our side (not configured, write failed). The change applies
   to all three apps.
3. **`billableDoors` could return a non-integer or `NaN` quantity.**
   Checkout falls back to a form field when `doors_count` is null, and
   Stripe rejects a non-integer quantity with its raw error. The quantity
   is now rounded up, and anything non-finite counts as the minimum.
   `minApplied` now reflects only counts below the minimum.

Findings not fixed, because each needs a product decision or a migration:

- `customer.subscription.updated` is not handled (see §1).
- The 12-month commitment shown in the UI is not enforced. The portal or
  the API can cancel in month 1.
- `startHoaCheckout` shows Stripe's raw error message to the user.
