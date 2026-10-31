# Online dues payments by card and ACH (BL-035) with autopay (BL-036)

Status: DESIGN, nothing built, nothing applied. Date: 2026-10-31.
Companion SQL: `migrations/0073_online_payments.sql` (unapplied draft). New flag: `M8_APPLIED`.
Builds on ADR-005 (payment rails) and the BL-006 Pay-by-Zelle work. Zelle and recorded checks stay as they are; this adds two rails beside them.

Anything marked **verify with counsel** or **verify with Stripe** is a claim I could not confirm from the repo. It is a to-do, not a fact.

## 0. Summary of decisions

| Topic | Decision |
|---|---|
| Stripe model | Connect, **Standard** accounts, **direct charges**. The association owns its Stripe account, is merchant of record, and is paid out to its own bank. |
| Who touches the money | Never us. No transfers through the platform balance, no separate-charges-and-transfers, no platform-held balance. |
| Card data | Stripe Elements (Payment Element) only. Card and bank numbers never reach our servers or database. |
| ACH verification | Stripe Financial Connections first, microdeposits as the fallback. |
| Our take | A Connect `application_fee_amount` on each charge, so the platform earns a small margin without ever holding funds. |
| Posting | Webhook-driven, one SQL function per outcome (`record_online_payment_success`, `reverse_online_payment`), idempotent, Georgia order frozen at attempt creation. |
| ACH timing | `processing` posts nothing to the ledger. Posting happens on `succeeded`. A failure after posting reverses it. |
| Flag | `M8_APPLIED` (migration 0073) plus a per-association `online_payments_enabled` switch. |
| Autopay | Opt-in, homeowner-set maximum, ACH or card, off-session charges on the due date, self-pausing after two failures. |

## 1. Money flow: Stripe Connect

### 1.1 Account type and why

**Standard**, created with the controller properties that match it (dashboard: full, fees paid by the account, losses and refunds handled by the account), not Express and not Custom.

| | Standard | Express | Custom |
|---|---|---|---|
| Who owns the Stripe account | The association | Platform-managed | Platform builds everything |
| Merchant of record | Association | Platform's name on statements, platform carries more | Platform |
| Who bears disputes and negative balances | Association's account | **Platform is liable** by default | Platform |
| KYC burden on us | None (Stripe collects it) | Stripe collects, we answer for it | We build the forms and own compliance |
| Money transmitter exposure | Lowest. We never hold funds. | Higher | Highest |
| Fit for "never held by us" | Yes | Weaker | Weak |

Reasons, in order:

1. **The money requirement.** With Standard direct charges the PaymentIntent is created on the association's account. The charge settles into the association's Stripe balance and pays out to the association's bank. Our platform balance is never in the path. Express and Custom can be run that way too, but the platform then carries the liability for refunds, disputes and negative balances, which is "holding the risk" even when not holding the cash.
2. **A volunteer treasurer is the counterparty.** A Standard account gives the treasurer Stripe's own dashboard for payouts, 1099-K and disputes, so they are not dependent on our screens for tax or bank questions.
3. **It keeps us out of money-transmission questions** (verify with counsel for each state we sell in; the platform-never-holds-funds structure is the usual basis for avoiding it, but we have not had it reviewed).
4. Costs of the choice, accepted: onboarding looks like Stripe's, not ours (we can only brand the entry screen); each association needs a human to complete it; Stripe, not us, can freeze an association's account.

### 1.2 One account per association, not per organization

An organization can manage several associations (`units.association_id`, `associations.organization_id`), and each association has its own bank account, funds and books. A Connect account maps to the legal entity that owns the bank account, which is the association. Table: `association_stripe_accounts`, unique on `association_id` and on `stripe_account_id`.

### 1.3 Onboarding an association

Who: the board **treasurer** (or whoever the board names), not the property manager and not us. They hold the EIN and the bank details and can sign for the association.

Steps, all behind `online_payments_enabled`:

1. Board member with the treasurer or admin role opens Settings, Online payments, "Turn on card and bank payments". Page states in two sentences: the association gets paid directly, we never hold the money, fees are described below.
2. Server action creates the connected account (`POST /v1/accounts`, Standard controller settings, `country=US`, `business_type=non_profit` or `company`, as the treasurer chooses on the next Stripe screen; prefill association name and state only) and stores the row.
3. Server creates an **Account Link** (`type=account_onboarding`) and redirects. Stripe collects: legal name, EIN, address, representative identity, bank account for payouts, terms. `return_url` and `refresh_url` come back to our Settings page.
4. We do not trust the redirect. State comes from the **`account.updated`** Connect webhook, mirrored into `details_submitted`, `charges_enabled`, `payouts_enabled`, `requirements_due`.
5. "Pay now" appears for residents only when `online_payments_enabled AND charges_enabled AND payouts_enabled`. A new requirement later (Stripe asks for more documents) flips `charges_enabled` off, the board sees "Stripe needs one more thing" with a link (a fresh Account Link), and residents see only Zelle and check instructions. No payment is ever offered that cannot settle.
6. On first enable the app creates chart accounts `1015 Online payments clearing` (asset) and, lazily, `6150 Merchant processing fees` (expense) for that association, if absent (app code, not the migration; the chart is seeded in code in this repo).

KYC and compliance: Stripe performs KYC/KYB on the association and its representative. We store no identity documents, SSNs or bank numbers. We store only the mirrored booleans and requirement codes (`requirements_due` holds field codes like `company.tax_id`, never values).

Association with an existing Stripe account: Standard supports connecting an existing account via OAuth. v1 uses fresh account creation only (simpler, fewer cases). Revisit if a client already has one.

### 1.4 Payouts

Stripe pays out to the association's bank on the account's schedule. Default: **daily automatic, 2-day rolling** (Stripe's US default after the first payout; first payout has a 7 to 14 day hold for new accounts, **verify with Stripe**). We do not control or change the schedule; the treasurer can in their own dashboard. We read `payout.*` events (section 3.7) for reconciliation only.

Failure modes the board must be told about in plain words: the first payout is delayed; a payout fails because the bank details are wrong (Stripe emails the account owner, and we mirror `payout.failed` into an alert on the board dashboard).

### 1.5 Our own Stripe account (the platform)

Today the app uses `acct_1TURnh…` for SaaS subscriptions (OA-14, OA-40). That same account becomes the **Connect platform**. It must be activated first (OA-40, payout bank still missing) and have Connect enabled with a completed platform profile (section 8). The SaaS webhook endpoint stays as it is; Connect gets its own endpoint and secret (section 6.2) because connected-account events arrive on a separate endpoint ("Listen to events on Connected accounts").

## 2. Fees

### 2.1 Competitor reference

PayHOA (per the brief): ACH $2.45 flat; card 3.5% plus $0.50; the association or the homeowner pays, chosen per method. We match those headline numbers so the comparison page can say "same fees as PayHOA, with real accounting".

### 2.2 Our pricing and what it costs us

Stripe's published US rates, **verify with Stripe before launch** (they change, and Connect pricing is account-specific):

- Cards: 2.9% + $0.30 domestic. Higher for international and some premium cards.
- ACH Direct Debit: 0.8%, capped at $5.00.
- Standard connected accounts pay these fees themselves (the fee comes out of the association's Stripe balance). We take our margin as an `application_fee_amount`.
- ACH returns and disputes carry additional Stripe fees (chargeback fee on cards, a per-failure fee on ACH, **verify with Stripe**), and those hit the association's account, not ours.

Margin at the PayHOA price points, per payment, on a typical $250 payment:

| Method | We charge | Stripe takes (est.) | Our margin | Notes |
|---|---|---|---|---|
| Card | 3.5% + $0.50 on $250 = $9.25 | 2.9% of $259.25 + $0.30 = $7.82 | about $1.43 | Margin shrinks if the homeowner pays the fee, because Stripe also takes a cut of the fee itself. Computed on the grossed-up total in code. |
| ACH | $2.45 | 0.8% of $250 = $2.00 | $0.45 | |
| ACH, $400 dues | $2.45 | $3.20 | **negative** | Break-even is about $306. |

So a flat $2.45 loses money above ~$306 of dues. Design: ACH fee = `max($2.45, stripe_estimate + $0.45)`, hard-capped by Stripe's own $5 ceiling; so $2.45 up to ~$256, scaling to a maximum fee of $5.45 for large payments. An application fee can never be negative, so we never absorb a loss; the displayed fee is what the payer sees before paying. This is a pricing decision for the owner (section 8): the alternative is to match PayHOA's flat $2.45 exactly and lose a few dollars on the rare large payment.

Fees are computed in one pure module (`lib/payments/fees.ts`, integer cents, no floats) used by the Pay screen, the server action that creates the PaymentIntent, and the receipt, so the three can never disagree. The server recomputes; the client number is only a preview.

### 2.3 Who pays the fee: per method, board's choice

Stored in `association_stripe_accounts.ach_fee_payer` and `card_fee_payer` (`association` or `homeowner`). The board sets both on the Settings page in plain words ("Residents pay the fee" / "The association pays the fee").

- **Association pays:** the PaymentIntent amount equals the dues. Stripe's fee is deducted from the association's balance, and our `application_fee_amount` too. The fee is a cost of the association: it appears on the payout reconciliation as processing-fee expense (section 3.7).
- **Homeowner pays:** the PaymentIntent amount is `dues + fee`. The homeowner sees "$250.00 dues + $9.25 card fee = $259.25 total" before paying and again on the receipt. The ledger records only the dues against the owner's account. The fee collected and the fees Stripe and we take out of the same charge net to the amounts shown in `online_payments` (`fee_cents`, `stripe_fee_cents`, `application_fee_cents`) and need no journal entry for the owner (the association's net is the dues).

Recommended defaults (owner decision, section 8): **ACH: association pays** (cheapest rail, cheapest for the HOA, best incentive to move people off checks); **card: homeowner pays**, off until the board acknowledges the surcharge notice below.

### 2.4 Legal note: card surcharging (verify with counsel)

I am not a lawyer and this is a flag list, not advice.

- **Georgia:** to my knowledge Georgia does not prohibit card surcharges, and the brief states they are allowed with disclosure. **Verify with counsel**, including whether the association (as the merchant) or a nonprofit status changes anything.
- **Other states:** some states restrict or ban credit card surcharges or require specific disclosure (historically Connecticut, Massachusetts and a few others, and Colorado/Maine/Oklahoma have caps or conditions; the list changes). Because the fee payer is per association and per method, the app must be able to **force `card_fee_payer = 'association'` by state**. Design: a small table in code `SURCHARGE_BLOCKED_STATES` (empty by default; filled when counsel signs off per state) checked in the Settings action and again when creating the PaymentIntent.
- **Card networks:** Visa and Mastercard allow surcharges only with conditions: a cap (Visa's is currently 3% and a 3.5% fee exceeds it; Mastercard's is higher; **verify both**), advance notice or registration with the network via the acquirer (Stripe has a surcharging process, **verify with Stripe**), disclosure at checkout and on the receipt, and **no surcharge on debit or prepaid cards** (the Payment Element exposes `funding` after the card is entered, so the fee line must recompute to $0 for debit).
- **"Convenience fee" vs "surcharge":** card network rules treat a fee on a transaction type that the merchant already accepts (dues paid by card) as a surcharge, not a convenience fee. Calling it a convenience fee does not avoid surcharge rules. Name it what it is in the UI ("card fee").
- **Design consequences, regardless of the legal answer:** the card fee is **off by default**; turning it on requires the board member to tick an acknowledgement (`card_fee_acknowledged_at/by`) that they have checked their state's rules; the percentage is a config value with a network cap clamp; debit cards bear no fee; the fee is itemized before payment and on the receipt.
- **ACH fee:** a flat or small fee on ACH is not a surcharge in the card-network sense. State rules on passing processing costs to owners may still apply to the governing documents (the CC&Rs may say assessments are collected "without charge"); the board checks their documents. **Verify with counsel.**
- **Returned payment fee:** Georgia law on returned-payment fees for checks (O.C.G.A. 13-12-1 and related) may not cover ACH. Keep the fee optional, capped (`CHECK <= $100` in the schema, app clamps lower per state), and **verify with counsel**.

### 2.5 ACH bank connection

- **Primary: Stripe Financial Connections** (instant verification: the resident logs in to their bank in Stripe's modal, Stripe returns a tokenized account). Used through the Payment Element with `us_bank_account` and `verification_method: automatic`. We never see credentials or the account number. Financial Connections has its own per-link cost (small, **verify with Stripe**) and is separate from our Plaid use for bank sync, which stays untouched.
- **Fallback: microdeposits** when the bank is not supported or the resident prefers not to log in: Stripe sends two small deposits or a descriptor code (1 to 2 business days), and the resident verifies on a "Finish connecting your bank" card on the dues page. The payment attempt is not created until the method is verified.
- **Mandate.** Collecting a bank debit needs a mandate. The Payment Element presents Stripe's mandate text; we store `stripe_mandate_id` on the method and, for autopay, our own authorization text version (section 4.4).
- Return codes: ACH can fail up to about 2 business days after `processing` for most reasons (insufficient funds, closed account) and up to 60 days for unauthorized claims (R10). Section 3.4 and 3.5 cover this.

## 3. Ledger posting

### 3.1 What exists today

- `payments` (amount numeric(14,2), method includes `ach` and `card`, `external_ref` documented as "Stripe charge id", unique link to one assessment).
- `assessments` (`open | partial | paid | ...`), status set by the posting code from the sum of `payments`.
- `record_lump_payment()` (migration 0072): board-only (`auth.uid()`), many charges in one transaction, over-application refused (23514), overflow as `unapplied_credits`, one `journal_entries` + balanced `ledger_entries` per part via `next_journal_entry_number()`. This is the model.
- `lib/collections/ga-payment-order.ts` `allocatePayment()`, pure, integer cents: Georgia statutory order from 2027-01-01 (regular, special, specific, other), "until current", unapplied remainder. Before 2027 or outside Georgia: oldest first.
- The Stripe webhook dedupe table `stripe_webhook_events` (0064).

### 3.2 Why a new function and not `record_lump_payment`

`record_lump_payment` requires a signed-in board member. The webhook has no user. The new functions are service-role-only (`auth.role() = 'service_role'`), take an attempt id instead of loose parts, and debit **clearing (1015)** rather than operating cash (section 3.7). Everything else mirrors it.

### 3.3 Creating an attempt (before the money moves)

Server action `createOnlinePayment({ unitId, chargeIds?, method, paymentMethodId?, idempotencyKey })`:

1. Authorize: the caller is a resident of that unit (existing resident guard), the association has Connect enabled, `M8_APPLIED`.
2. Load the unit's open charges and the association's state; call `allocationMode(state, today)` and `allocatePayment({ amountCents, charges, mode, today })`. The default amount is the total currently due; an owner may pay less (a custom amount); never more than due plus an explicit "pay ahead" credit the owner confirms.
3. Compute the fee (`fees.ts`), the total, the Stripe `application_fee_amount`.
4. Insert `online_payments` with the allocation **frozen** (`allocation`, `allocation_mode`), status `created`. `UNIQUE (association_id, idempotency_key)` makes a double tap return the same row.
5. Create the PaymentIntent **on the connected account** (`Stripe-Account` header) with `Idempotency-Key = idempotencyKey`, `metadata = { online_payment_id, unit_id }` (ids only), `application_fee_amount`, `payment_method_types` limited to `us_bank_account` and `card`, `statement_descriptor_suffix` set to the association's short name. Save `stripe_payment_intent_id`; return the client secret to the page.

Freezing the allocation means what the resident saw (and what the receipt says) is what posts, even if a late fee is added between "Pay" and ACH settlement.

### 3.4 States

```
created -> requires_action -> processing -> succeeded -> (refunded | partially_refunded | disputed -> dispute_lost)
                                  \-> failed                 \-> succeeded (dispute won)
created | requires_action -> canceled
```

| Stripe event (Connect endpoint) | Card | ACH |
|---|---|---|
| `payment_intent.processing` | n/a | status `processing`. **No ledger posting.** Resident sees "Payment started, your bank takes 3 to 5 business days". The owner's balance still shows the charges as due, with a "payment on the way" banner so they do not pay twice. |
| `payment_intent.succeeded` | posts immediately (`record_online_payment_success`) | posts when the bank confirms |
| `payment_intent.payment_failed` | status `failed`, nothing posted, resident told to try another method | before posting: `failed`, nothing posted; after posting: a later `charge.failed`/dispute path, see 3.5 |

The ledger never shows ACH money as received until Stripe says it has succeeded, so nothing has to be unwound for the common failure (insufficient funds, which shows up before `succeeded`).

**Open question for Stripe docs (verify with Stripe):** for ACH Direct Debit Stripe marks `succeeded` after the settlement window; a return (R01 etc.) can still follow later, and Stripe then fires `charge.dispute.created` (for unauthorized claims) or a refund-like event. The design handles both: `reverse_online_payment` takes the kind and a Stripe reference.

### 3.5 Posting a success

`record_online_payment_success(attempt, paid_on, charge_id)`:

- Locks the attempt row; if `posted_at` is set it returns the stored result. **This is the idempotency boundary** (together with the unique `stripe_payment_intent_id`).
- For each frozen part: locks the assessment, recomputes what it has left, applies `min(part, left)`. Writes a `payments` row (method `ach` or `card`, `external_ref` = charge id), a journal entry (debit 1015 clearing, credit 1100 accounts receivable), sets the charge to `partial` or `paid`.
- If a charge was settled meanwhile (the board recorded a check) or the part was a credit, the overflow becomes one `unapplied_credits` row (debit clearing, credit 2100 prepaid assessments). The payment never fails after the money is taken.
- Writes `audit_log` (`online_payment.posted`, ids and cents only) and flips the attempt to `succeeded`.

Georgia order: applied at attempt creation by the existing `allocatePayment`, not re-implemented in SQL. The SQL only enforces the cap per charge. The ambiguity flags (interest, collection costs, plan installments) are surfaced to the resident as the existing "Ask your attorney" wording does in the board's preview dialog; online payers just see the split by line ("$250 dues, $25 late fee").

### 3.6 Failed ACH after posting, refunds, disputes

`reverse_online_payment(attempt, kind, ref, cents?, reason, on?, returned_fee_cents, by?)`, kinds:

- **`failed`** (ACH returned after it was posted): full reversal. A negative `payments` row and a mirror journal entry (`source = 'reversing'`) per posted part; charges go back to `open` or `partial`; unapplied credit reduced. If the association configured a returned-payment fee (`returned_payment_fee_cents`), the function adds one `fine` charge `RTN-<attempt id>` (a unique partial index makes it once only) due today. The webhook handler then **notifies the board** (in-app alert and email to board members, through the outbound guard) and emails the resident in plain words. A failure before posting posts nothing and only marks the attempt failed.
- **`refund`** (board-initiated from the payment detail, or Stripe-side): partial or full. Reverses from the **lowest-priority** posted part first, so the highest-priority charges (regular dues in Georgia) stay paid. If the credit part was already used on a charge, `short_cents` is returned and the board gets a task to review that home. Refunds are created by a board server action calling `refunds.create` on the connected account. Whether to also return our application fee (`refund_application_fee`) is an owner decision (section 8); recommendation: yes for full refunds, no for partial. Stripe never returns its own processing fee on refunds (**verify with Stripe**).
- **`dispute_lost`** (card chargeback or ACH unauthorized claim lost): full reversal like `failed`; attempt `dispute_lost`. On `charge.dispute.created` the attempt moves to `disputed` and the board is alerted **with a deadline** (Stripe's evidence window); nothing is reversed yet. Evidence is submitted by the treasurer in the Stripe dashboard (Standard account); we link to it. `dispute_won`: back to `succeeded`.
- Every reversal is recorded in `online_payment_adjustments` with a unique `(online_payment_id, kind, stripe_ref)`. A replayed Stripe event hits that unique key and returns `already_applied`.

### 3.7 Idempotency and ordering on webhooks

- **Endpoint.** `app/api/webhooks/stripe-connect/route.ts`, its own secret `STRIPE_CONNECT_WEBHOOK_SECRET`, verified against the **raw body** with `stripe.webhooks.constructEvent` before anything is parsed. A bad signature returns 400 and logs the event id only.
- **Dedupe.** Reuse `stripe_webhook_events` (event id primary key, outcome) like the subscription handler in `packages/billing/src/webhook.ts`. The dedupe table is a convenience for noise, **not** the safety. The safety is in the business keys: unique `stripe_payment_intent_id`, the attempt row lock plus `posted_at`, and the adjustment unique key. Event written last, as the existing handler does, so a crash mid-handler gets redelivered and finishes.
- **Out of order.** Stripe does not guarantee order. `succeeded` may arrive before `processing`; a late `processing` must not downgrade `succeeded`. Status updates are monotonic (a `WHERE status IN (...)` guard). `payment_intent.succeeded` for an attempt we cannot find (race with creation) returns 500 so Stripe retries; after N days an alert fires.
- **Connected account events** carry `event.account`. The handler resolves the association from `association_stripe_accounts` by `stripe_account_id`, and **rejects an event whose account does not match the attempt's `stripe_account_id`** (defense against a forged-looking cross-account id even though the signature is valid).
- **Safety-net sweep.** An Inngest job (daily, within the Hobby 50k-execution budget, section 7) re-fetches attempts stuck in `requires_action` or `processing` for more than 7 days from Stripe and replays the outcome through the same functions. A missed webhook costs a day, not a payment.
- **Events subscribed (Connect endpoint):** `payment_intent.processing`, `.succeeded`, `.payment_failed`, `.canceled`, `charge.refunded`, `charge.dispute.created`, `.closed`, `account.updated`, `payout.paid`, `.failed`, `setup_intent.succeeded` (saved methods), `mandate.updated`, `payment_method.detached`.

### 3.8 Reconciling payouts against bank sync

Clearing account pattern, so the books match the bank line, not the Stripe event:

1. On success the payment debits **1015 Online payments clearing**.
2. Stripe pays out the net: gross payments minus Stripe fees minus application fees (plus/minus refunds) arrive as **one bank deposit** on the association's Plaid feed.
3. `payout.paid` writes a `stripe_payouts` row (amount, fee total from `balance_transaction`s, arrival date).
4. The matcher (extension of the existing bank-transaction matcher): find the unmatched `bank_transactions` row on the association's bank account with `amount = payout.amount` and `posted_date` within 3 days of `arrival_date`. On match, post: debit bank cash (1010) for the deposit, debit **6150 merchant processing fees** for the fees the *association* bore, credit 1015 clearing for the gross; set `matched_journal_entry_id` on the bank line and `stripe_payouts.bank_transaction_id`. Homeowner-paid fees are not expensed (they are inside the gross as collected fee and wash out).
5. Anything unmatched after 5 business days shows on the board's reconciliation screen as "Stripe payout not found in your bank feed".
6. The clearing balance should trend to zero between payouts. A non-zero balance older than 10 days is an alert. The period close check (`65f9795a`, reconciliation by approved statement date) must treat 1015 as a reconciling item, not an error.

**What we deliberately do not do:** record cash in 1010 on the day of the payment. That would show money the bank does not yet have and break statement reconciliation.

## 4. Resident experience

Audience: older homeowners, one-handed phone use, low patience. Design rules from the existing `/resident/dues` work (round 28 notes: plain words, big tap targets).

### 4.1 Pay now (`/resident/dues/pay`, extended)

1. Top of the dues page: **"You owe $1,247.00. Due Nov 1."** and one green button, **Pay now**. The existing Zelle and check instructions move under "Other ways to pay".
2. Pay screen (one screen, no stepper):
   - Amount **prefilled** to the total due; one link "Pay a different amount" (opens a single number box).
   - The line items collapsed under "What this pays" (plain names via `chargeTypeLabel`).
   - Method choice as two big cards: **Bank account** (labelled with the fee) and **Card** (labelled with the fee).
   - **The fee is shown before the button and in the button label**: "Pay $259.25" and under it "$250.00 dues + $9.25 card fee". Switching method updates it instantly. If the association pays the fee: "No fee for you."
   - Saved method preselected ("Bank of America ending 4821"), with "Use a different one".
   - Autopay card (section 4.4) below, never in the way of the first payment.
3. Confirmation screen: "Thank you. We received your payment of $259.25." For ACH: "Your bank takes 3 to 5 business days. You do not need to do anything else. We will email you when it is done." The balance on the dues page shows a "Payment on the way" note.
4. Wording avoids: ACH, mandate, processing, intent, authorization. Say "bank account", "card", "your bank".
5. Accessibility: 18px minimum body, 48px tap targets, visible focus, Stripe Elements `appearance` set to match, `autocomplete` attributes, works with browser zoom, no timers, no auto-advance. Safari is the owner's only browser (memory: Safari only), so QA is Safari-first (Payment Element and Apple Pay work in Safari).
6. Two-minute rule: opening the page, one tap on Pay now, confirm, done. Everything else is optional.

### 4.2 Saved methods

On a successful payment, a checkbox **"Save this for next time"** (default checked for ACH, unchecked for card until chosen) attaches the PaymentMethod to a Customer on the connected account (`setup_future_usage: 'off_session'` only when the owner also opts into autopay; otherwise `on_session`). Stored rows in `online_payment_methods` contain Stripe ids, brand, last4, expiry only. "Manage payment methods" lists them with Remove.

### 4.3 Receipt

An email on `succeeded` (card: seconds; ACH: when it settles) and an on-screen/printable receipt at `/resident/dues/receipt/[id]` (the route exists, extend it): association name, home, date, method and last four, itemized lines, fee, total, "Paid in full" or the remaining balance. A separate short "your payment is on the way" email at ACH `processing`. Failure email: "Your bank payment did not go through. Nothing was taken from you. [Pay again]" with the board's returned-payment fee stated if one applies. Sent via the existing outbound path, so:

- Recipient goes through `guardRecipients` (BL-004): non-production or an org in `outbound_mode: 'sandbox'` sends only to `OUTBOUND_ALLOWLIST`. Receipts are no exception.
- Sandbox/test orgs must never receive Stripe live-mode events: test mode only for those (section 6).
- Receipt contents carry no full bank or card numbers, only last four.
- `receipt_sent_at` set once; resend is a board action, deduped.

### 4.4 Autopay opt-in with a maximum (BL-036)

Placement: on the Pay screen and in Manage payments. Name: **"Pay my dues automatically."**

The opt-in screen says, in plain words:

> Each time dues are due, we will take them from [Bank of America ending 4821].
> **Never more than $ [ 300 ] at one time.** If your bill is higher, we will not charge you. We will email you instead.
> You can turn this off any time.
> [ ] I agree to the automatic payment terms. [Turn on autopay]

- **The maximum is required**, prefilled with the current regular dues plus 25% rounded up, editable by the owner. Stored as `max_cents` (range $1 to $50,000 in the schema).
- **Scope:** regular dues by default. A second checkbox "Also pay late fees and fines" sets `include_other_charges`.
- **Authorization record (NACHA / card-network consent):** `authorization_text_version` (the exact wording version shown), `authorized_at`, the user, the Stripe mandate id on the method. The version string maps to the text in code so the exact wording the owner agreed to is reproducible. **Verify NACHA recurring-debit authorization requirements and the card-on-file rules with counsel/Stripe** (a copy of the authorization must be available to the account holder, so the confirmation email includes the text).
- **Run:** a daily Inngest job (budgeted, section 7) finds active enrollments with open charges due today or earlier and no `online_payments` row for `(enrollment, today)`. The unique partial index `online_payments_autopay_once` makes a double run impossible.
- **Maximum enforced three times:** (1) at run time against the allocation total (including fee when the homeowner pays it); (2) at PaymentIntent creation; (3) the intent amount equals the frozen allocation total. If the amount exceeds `max_cents`, **no charge**, owner and board get an email ("Your autopay limit is $300 and your bill is $412.50. We did not charge you. Pay now or raise your limit.").
- **Advance notice:** an email **3 days before** each run stating date, amount and method (also card-network recurring-billing practice). The run charges exactly the amount in the notice or less. If charges were added after the notice and push the total over the notice amount, the run only takes the noticed charges.
- **Failures:** failed run -> email to owner and board, `consecutive_failures + 1`; at 2 consecutive failures the enrollment moves to `paused` and the owner is told. Card needing authentication (SCA/3DS) off-session -> `requires_action` -> email with a link to finish.
- **Cancel:** one button, takes effect immediately, confirmation email. `canceled_at` set; the saved method can stay.
- **Moving out / unit transfer:** autopay is tied to `(unit_id, user_id)`. When ownership changes (existing resident/owner flows) the enrollment is canceled by trigger in app code and the new owner is invited to set their own.
- **Board visibility:** the board sees who is enrolled and each enrollment's maximum on the Collections dashboard (read-only), and never sees the payment method.

## 5. Data model

Full SQL: `migrations/0073_online_payments.sql` (draft, unapplied). Flag: `packages/db/src/m8.ts` with `export const M8_APPLIED: boolean = false`, the same one-line pattern as `m7.ts` (the file is added in PR 1, not now).

| Object | Purpose | Written by | Read by (RLS) |
|---|---|---|---|
| `association_stripe_accounts` | connected account pointer, onboarding mirrors, fee payer per method, returned-fee | server (service role) | board/admin of the org |
| `online_payment_methods` | saved card/bank pointers | server | the owner of the row only |
| `autopay_enrollments` | autopay, maximum, authorization record | server | the owner; board/admin |
| `online_payments` | one row per attempt, frozen allocation, fee, Stripe ids | server + the two functions | board/admin; the home's residents |
| `online_payment_adjustments` | failures, refunds, disputes, returned-fee trail, unique per Stripe reference | the reverse function | board/admin |
| `stripe_payouts` | payouts, matched to a bank line | server | board/admin |
| `record_online_payment_success()` | post a success | service role only | n/a |
| `reverse_online_payment()` | failed ACH, refund, dispute | service role only | n/a |
| `assessments_returned_fee_once` | one returned fee per attempt | n/a | n/a |

Patterns followed from earlier migrations: `IF NOT EXISTS`/`OR REPLACE` throughout; prerequisite checks that stop with a clear message; org-scoped RLS through `auth_org_ids()`, `auth_is_board_or_admin()`, `auth_resident_unit_ids()`; the `tenant_fk_same_org` ratchet triggers on every cross-table foreign key (the integration test `fk-same-org-ratchet.test.ts` will need these rows added); `SECURITY DEFINER` functions with a pinned `search_path` and EXECUTE revoked from PUBLIC/anon; audit rows carry ids and cents only. **No write policy exists on any new table** so a session cannot write through REST (0004's `org_access` hole on `associations.compliance_settings` is not repeated).

Notes and deliberate choices:

- Integer cents in new tables; `numeric(14,2)` only where the existing ledger needs it.
- `payment_methods` (0006) already exists and is empty and unused; the new `online_payment_methods` is separate because connected-account scoping and the unit/association keys differ. The old table can be dropped later.
- `payments.amount` already allows negative values (`CHECK amount <> 0`), which is how reversals are stored, with `journal_entries.source = 'reversing'` already in its check list.
- The functions assume chart accounts `1010`, `1100`, `1015`(optional, falls back to `1010`), `2100`(optional, falls back to AR), and an `OPERATING` fund, as `record_lump_payment` does.
- **Not written yet, needs a look:** the exact shape of `bank_transactions` matching for payouts (3.8) is app code, no schema change beyond `stripe_payouts`.
- **Apply procedure (OA-style):** the owner applies 0073 through the SQL editor (never by me), then confirms; only then does the PR flipping `M8_APPLIED` merge. CI replays 0073 against the ephemeral DB, so the integration suite runs "objects present, flag false" before the apply.

## 6. Security and compliance

### 6.1 Cardholder data

- Stripe **Payment Element** (Elements, not our own inputs). The browser sends card and bank details to Stripe directly; our servers see only `pm_...` ids and `last4/brand`. This keeps us at PCI **SAQ A** scope. Page CSP allows Stripe's origins for `script-src`, `frame-src`, `connect-src` and nothing broader.
- No card or bank number, full or partial beyond last4, in logs, `audit_log`, error reports, Sentry breadcrumbs or emails. The `audit_log` rows carry cents, ids and method names.
- Stripe.js loaded only from `js.stripe.com`, on the dues pay route, not the whole app.

### 6.2 Webhooks

- Separate endpoint and secret for Connect events; `STRIPE_CONNECT_WEBHOOK_SECRET` (the existing `STRIPE_WEBHOOK_SECRET` is for the subscription endpoint).
- `constructEvent` on the raw body with a 5-minute tolerance; reject otherwise. No parsing before verification.
- Event account must match the attempt's `stripe_account_id` (3.7). Live and test mode separated: a test-mode event never posts to a production ledger (`livemode` checked against `STRIPE_SECRET_KEY` prefix).
- Handlers are idempotent by business key (3.7). The route returns 2xx only after the DB work commits, so a crash redelivers.

### 6.3 Authorization (RLS and server actions)

- Web roles can read only: board/admin see their association's rows; a resident sees their own home's payments; saved methods are visible only to their owner (not even to the board).
- All writes by the server with the service role, behind checks in the server action: the caller is a resident of the unit, or a board member for board actions; the association's Connect row is enabled; amounts are recomputed server-side; the client's amount is never trusted.
- Refunds, enabling Connect, fee-payer changes: board/admin only, and each writes an `audit_log` row (who, what, ids). Fee-payer changes take effect only for future attempts (the attempt row stores the payer it used).
- Impersonation: the existing `getResidentActor()` impersonation view must be **read-only for payment creation** (an admin viewing as a resident cannot start a payment). Test for it.

### 6.4 Audit log

Existing `audit_log` (org, user, action, entity, ids only). New actions: `online_payments.enabled`, `online_payments.fee_policy_changed`, `online_payment.posted`, `online_payment.failed`, `online_payment.refund`, `online_payment.dispute_lost`, `autopay.enrolled`, `autopay.changed`, `autopay.canceled`, `autopay.paused`. The functions write their own rows inside the same transaction as the money, so a posting without an audit row cannot exist.

### 6.5 Outbound guard and sandbox rules (receipts and notices)

- Every receipt, failure notice, autopay notice and board alert uses the standard sender, which runs `guardRecipients` first (BL-004). In `VERCEL_ENV != production`, or for an org with `outbound_mode: 'sandbox'`, only allowlisted addresses are sent; the rest are blocked and logged by id.
- **Never create a live-mode PaymentIntent for a sandbox org.** The create-attempt action refuses (`online_payments_sandbox`) when the org is in sandbox mode or the environment is not production with live keys; test-mode keys and Stripe test cards are the only way to exercise this in preview and CI.
- Test data uses Stripe test mode and the seeded orgs only (BL-035 risk note). No test touches production. No real email reaches a resident from a test.
- No PII in script or log output: payment ids, cents and association ids only (memory: no PII in script output).

### 6.6 Other

- Rate limits on create-attempt and add-method actions per user (a card-testing guard; Stripe Radius is also on by default for the connected account).
- Terms: a short "online payment terms" page the board links from Settings; wording reviewed by counsel (**verify with counsel**).
- Records: attempts, adjustments and payouts are retained with the books and never deleted by the app.
- Tax: the association receives the 1099-K from Stripe (Standard account). We issue none.

## 7. Build plan

Each PR is at most 1 to 2 days, behind `M8_APPLIED` and the per-association switch, with its own tests. Order is the order to merge. PRs 2 onward do not call Stripe in unit tests: Stripe is behind a thin interface faked in tests, and the real Stripe test-mode suite (the existing CI Stripe job) covers the integration points. Per the repo footguns: verify with `pnpm typecheck` / `rtk pnpm -r typecheck`, `pnpm test:unit`, and an `apps/hoa` `next build` before pushing.

| # | PR | Scope | Tests |
|---|---|---|---|
| 0 | **Owner applies 0073** (OA-42, new) | Nothing to merge; blocks PR 1's flag flip and everything after. | CI replays 0073 and the schema tests pass first. |
| 1 | `feat(db): M8 flag and online payments schema` | Add `0073_online_payments.sql` (if the owner changed it, as applied), `packages/db/src/m8.ts` (`false`), regenerated types diffed by column (footgun 3), same-org ratchet rows. | Integration: RLS (resident cannot read other unit, board of other org cannot read, nobody can write through REST), both functions refuse non-service-role, replay twice posts once, overflow becomes credit, reversal restores charge status, returned fee once, refund LIFO. |
| 2 | `feat(payments): fee engine and surcharge guard` | `lib/payments/fees.ts` (pure, integer cents), `SURCHARGE_BLOCKED_STATES`, debit-card exemption, network cap clamp, snapshot of every price point in section 2. | Unit: property tests (fee never negative, application fee never negative, total = dues + fee, no float drift), the break-even case, each fee-payer combination, blocked state forces association pays. |
| 3 | `feat(connect): onboarding and account state` | Server actions to create the Standard account and Account Link, `account.updated` handler, Settings, "Online payments" board page (status, fee choices, returned-fee, card acknowledgement), Connect webhook route with signature check and dedupe, `STRIPE_CONNECT_WEBHOOK_SECRET`. | Unit with a fake Stripe: onboarding state machine, only treasurer/admin may start, `charges_enabled` false hides Pay now; webhook: bad signature 400, wrong account rejected, duplicate event is a no-op, test event vs live key mismatch. |
| 4 | `feat(payments): create attempt and card payment` | `createOnlinePayment` (allocation via `allocatePayment`, fee, frozen row, PaymentIntent on the connected account with idempotency key), Pay now button and Payment Element for card, success posting via webhook, receipt email and page, "payment on the way" state. | Unit: allocation before and after 2027-01-01 in GA and a non-GA state, partial amount, over-amount refused, double submit returns the same row, impersonation refused, sandbox org refused. Integration: webhook replay twice posts once. Stripe test-mode: `4242…` succeeds, `4000 0000 0000 9995` fails. |
| 5 | `feat(payments): ACH with Financial Connections` | `us_bank_account` in the Payment Element, microdeposit completion card, `processing` state and banner, posting on `succeeded`, ACH fee payer. | Test mode: instant bank success, microdeposit verify, `…0002` failure path before posting. Unit: `processing` posts nothing, out-of-order `succeeded` before `processing` does not downgrade. |
| 6 | `feat(payments): failed ACH, refunds, disputes` | Handlers for `payment_failed`, `charge.refunded`, `dispute.created/closed`, board refund action, returned fee, board and resident notices, board alerts. | Integration (the SQL cases from PR 1 end to end), Stripe test-mode dispute triggers, refund partial/full/LIFO, notifications go through the guard and are blocked in sandbox. |
| 7 | `feat(payments): saved methods and manage page` | Setup flow, list/remove/default, `payment_method.detached` and `mandate.updated` handlers. | RLS: only the owner sees methods; removing the default picks none; detached webhook deactivates. |
| 8 | `feat(accounting): payouts and clearing reconciliation` | `payout.*` handlers, `stripe_payouts`, matcher against `bank_transactions`, clearing account creation at enable, 6150 expense posting, reconciliation screen section, period close treats 1015 as reconciling. | Unit: matcher (amount, date window, tie-break), fees expense only for association-paid. Integration: clearing returns to zero after the payout posts. |
| 9 | `feat(payments): autopay (BL-036)` | Enrollment UI with maximum and wording, authorization record, 3-day notice job, daily run job, circuit breaker, cancel, board read-only list, unit-transfer cancel. | Unit: maximum enforced (over max does not charge and emails), exactly-once per date, failure breaker pauses at 2, notice amount ceiling; Integration: unique index blocks double run; Inngest budget test (below). |
| 10 | `chore: launch checklist and docs` | Release note, help-center article, board how-to, `docs/owner-actions.md` entries, flag flip PR (`M8_APPLIED = true`) after the owner confirms apply, one real-money $1 test by the owner (OA below). | Smoke list. |

Cron budget (memory: Inngest Hobby 50k executions/month): the autopay run is **one daily job** that fans out inside a single function, not one invocation per enrollment; the pending-attempt sweep is **one daily job**; the 3-day notice runs from the same daily job. About 90 executions a month for all three. Any sub-hourly job is forbidden for this feature (the webhook does the real-time work).

PR 1 can start only after the owner applies 0073. PRs 2 and 3 do not need the DB to exist behind the flag and can proceed in parallel with the apply wait if the work is queued (no migration dependency in code behind `false`).

## 8. Owner actions

To add to `docs/owner-actions.md` (it mails them to the owner). Proposed ids continue after OA-41.

1. **OA-40 (existing): activate the Stripe account.** Only the payout bank account is left. Needed for the platform; Connect cannot be switched to live until the platform account is activated. Until done, only test mode works.
2. **OA-42: enable Stripe Connect.** Stripe dashboard, **Connect, Get started**, choose "Platform or marketplace", and confirm **Standard** accounts with direct charges are available. **Verify with Stripe** that fees paid by the connected account and platform application fees are allowed on the account's agreement.
3. **OA-43: complete the Connect platform profile.** Settings, Connect, Platform profile: describe the platform (HOA management software where associations collect dues), accept the platform responsibilities. Add the support email (already `support@homeownerledger.com`), a support URL, the terms and privacy URLs, and the statement descriptor policy. Stripe reviews this before live Connect.
4. **OA-44: branding for onboarding.** Connect, Settings, Branding: upload the logo, set the brand color and name "HomeownerHub", so the Stripe onboarding screen shows ours to the treasurer. Statement descriptor `HOMEOWNERHUB` is already set (OA-40); decide the per-association suffix (the association's short name).
5. **OA-45: add the Connect webhook.** Dashboard, Developers, Webhooks, **Add endpoint, "Listen to events on Connected accounts"**, URL `https://www.homeownerledger.com/api/webhooks/stripe-connect`, events listed in 3.7. Put its signing secret in Vercel production as `STRIPE_CONNECT_WEBHOOK_SECRET` (use `--environment=production`, memory: a bare env pull wipes .env.local). Also add the CI test secret `STRIPE_TEST_CONNECT_WEBHOOK_SECRET` (must start `whsec_`, see OA about the earlier malformed secret).
6. **OA-46: apply migration 0073** (after review of this doc). Claude puts the SQL on the clipboard; the owner pastes it into the Supabase SQL editor, confirms, and Claude then flips `M8_APPLIED`.
7. **OA-47: the pricing decision (section 2).** See open questions below.
8. **OA-48: counsel review (short list):** card surcharge rules for Georgia and the first states we onboard; Visa and Mastercard surcharge cap and registration steps; returned-payment fee limits on ACH; autopay authorization wording (NACHA); the online payment terms page; money-transmitter position of the platform-never-holds-funds structure.
9. **OA-49: first live test.** After launch, the owner (or a friendly treasurer) pays $1.00 with a real card and a real bank account on a real association, and confirms the receipt email, the Stripe dashboard payment and the ledger line; then refunds it.

### Decisions needed from the owner

1. **Default fee payer.** Recommendation: ACH association pays, card homeowner pays (and card fee off until the board acknowledges). Alternative: both homeowner pays, to maximize our margin; or both association pays, to market "no fees for residents".
2. **ACH price shape.** Flat $2.45 exactly like PayHOA (we lose money above ~$306 payments), or the scaled `max($2.45, stripe + $0.45)` (recommended, never negative).
3. **Card percentage.** 3.5% + $0.50 matches PayHOA but exceeds Visa's surcharge cap as I understand it; options: 3.0% + $0.50 (compliant on that point, thinner margin), or match PayHOA and rely on counsel's answer. Recommendation: build as a config value, ship 3.0% + $0.50 until counsel confirms, decide the headline price then.
4. **Application fee on refunds:** return it on full refunds only (recommended) or never.
5. **Returned-payment fee default:** off (recommended) until the board sets one; cap at $30 pending counsel.
6. **Scope of v1 states:** Georgia only for the card fee (recommended, matches "Georgia first"), others association-pays until counsel clears.
7. **Do we expose "pay ahead" (credit)?** Recommended: yes, as an advanced option, hidden by default.

## 9. Risks

| Risk | Mitigation |
|---|---|
| ACH reversed after we showed "paid" | Post only on `succeeded`, reversal function, board alert, returned fee optional. |
| Double charge (double tap, retry, replayed webhook, autopay twice) | Idempotency keys, unique indexes (intent id, adjustment ref, autopay period), row locks. |
| Platform liability for chargebacks | Standard accounts: the association's account bears them. We never absorb. |
| Surcharge violates state or network rules | Off by default, acknowledgement, blocked-state list, debit exempt, itemized. Counsel review before enabling anywhere but Georgia. |
| A charge settled between "Pay" and webhook | Overflow becomes unapplied credit; never fails after money moves. |
| Missed webhook | Daily sweep. |
| Sandbox org gets live charge or real email | Hard refusal in create-attempt, outbound guard on every message, test-mode only outside production. |
| Inngest cap | Two daily jobs only. |
| Bank feed does not show a payout | Unmatched list and 10-day clearing alert; clearing never hides a missing deposit. |
| The footgun: broken tsc summary | Verify with `pnpm typecheck` / `rtk pnpm -r typecheck` and read for `Tasks: N successful`. |
