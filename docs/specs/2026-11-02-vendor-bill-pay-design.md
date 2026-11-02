# Vendor bill pay and check mailing (BL-039, backlog B7)

Status: DESIGN, nothing built, nothing applied. Date: 2026-11-02.
Companion SQL: none yet. The migration number and the `M?_APPLIED` flag are assigned by the coordinator when the build starts (the latest draft in the repo is `0079_mailed_letters.sql`, flag `M14`).
Builds on: the bill scan and AP code (BL-021, `w36.ap_bill`), the approval layer and dual control (BL-168), Stripe Connect per association (BL-035, `lib/payments/`), and the print-and-mail module (BL-032, `lib/mailed-letters/`, dark behind `M14_APPLIED`). Backlog B7 says it depends on A2 and B6. I could not confirm what A2 is from the files I read; B6 exists in code and is dark.

Anything marked **verify with counsel** or **verify with provider** is a claim I could not confirm. It is a to-do, not a fact. Section 11 lists what I could not confirm from provider sites.

## 0. Summary of decisions

| Topic | Decision |
|---|---|
| Money position | **We never hold funds, never sit in the money path, never pool.** Every payment is drawn on the association's own bank account or paid by a provider account the association owns. |
| Recommended path | Phase A: a printable check and a payment record, no provider, no keys. Phase B: a **mailed check drawn on the association's own account** through the existing print-and-mail interface. Phase C: vendor ACH through an association-owned provider account, only after counsel and the provider confirm in writing. |
| Rejected | Pooling vendor money in a platform balance. Stripe Treasury financial accounts as the default (section 2, option D). |
| Approvals | A second approval type, `w39.vendor_payment`, separate from approving the bill. Two different board approvers by default, Treasurer first, the person who proposed never approves. |
| Vendor bank changes | A changed address or bank detail puts the vendor on hold. It needs a callback to a phone number already on file, a second board approver, and a waiting period before the next payment. |
| Posting | Dr AP / Cr Cash at release, through the existing `markInvoicePaid` path. Cleared against the bank feed. Voids reverse. |
| Checks | Sequential numbers per bank account, positive pay export file, stale check and stop payment handling. |
| Flag | New `M?_APPLIED` plus a per-association switch. Dark until the owner applies the SQL. |

## 1. What exists today

Verified in the repo on 2026-11-02.

- **Vendors** (`migrations/0007_vendors.sql`): `vendors` is org-scoped with `legal_name`, `ein` (stored as entered, masked in the UI), `address` jsonb, `status` (`prospect | active | inactive | blacklisted`). `vendor_compliance` has `w9_on_file` and `w9_signed_date`. There is **no bank account, no remit-to, no payment method** on a vendor.
- **Invoices** (`0006_accounting.sql`): `invoices.amount numeric(14,2)`, status `received | coded | approved | paid | disputed | cancelled`.
- **Bill scan** (`lib/bill-scan/`, action `w36.ap_bill`): a scan produces a proposal in `approval_requests`. Approving it runs `makeBillExecutor`, which re-validates, checks for a duplicate vendor plus invoice number, and calls `enterBill` (`lib/invoices.ts`) to write the invoice and post Dr expense / Cr AP. The comment on `enterBill` says "Bill-pay is a separate action". That is this item.
- **Paying a bill** (`markInvoicePaid`, `lib/invoices.ts`): board or admin only, inserts a `payments` row with `invoice_id`, method `ach | card | check | cash | other`, posts Dr AP / Cr Cash-Operating, flips the invoice to `paid`. Today it is a bookkeeping record that money already left. It moves no money.
- **Approval layer** (`lib/approvals.ts`, `lib/professionals/signoff.ts`, `model.ts`): `MONEY_ACTIONS` is `w18.cash_receipt`, `w36.ap_bill`, `accounting.opening_balances` and the professional-entry action. `moneyGate` blocks the proposer from approving, routes the Treasurer first, and above `associations.dual_control_cents` needs two different sign-offs, enforced in the database by `approval_requests_dual_control()` (migration 0071). `decide_approval_request()` raises 42501 for non-board callers.
- **Stripe Connect** (`lib/payments/`): Standard accounts per association, direct charges, webhook route, a fake (`stripe-connect-fake.ts`). It collects dues. **Nothing in it pays vendors.**
- **Mail module** (`lib/mailed-letters/`): `MailProvider` (`quote`, `send`, `track`) names `lob | postgrid | fake`, takes an idempotency key equal to the approval request id, and `send.ts` already enforces: approved and unsent, board confirms an amount equal to the server's recomputed cost, no provider or pricing means refuse, one provider call, ids and cents only in the row. `0079_mailed_letters.sql` stores no names or addresses.
- **Year-end** (`lib/accounting/year-end/`): a 1099-NEC candidate list from $600, flagging over $2,000. It reads payments. Bill pay must keep feeding it.
- **Gaps this design must fill:** no vendor payment details, no payment object between "bill approved" and "bill paid", no check numbers, no void, no vendor-change control, no outstanding-checks view.

## 2. How money moves, and "never hold funds"

Position from ADR-005 and the dues design: the association is the merchant and the owner of the money. We are software. "Holding funds" means any state where vendor money sits in an account that is ours, or that we can move without the association's own authorization.

| Option | How money moves | Do we hold funds | Notes |
|---|---|---|---|
| **A. Association writes its own check** | We print a check PDF or a check-ready page and a payment record. The board signs, mails and deposits through the bank the usual way. | **No.** No money touches us. | Zero keys, zero provider risk. Weakest ease of use. Good first phase. |
| **B. Mailed check drawn on the association's own account** | A print-and-mail provider prints a check on the association's bank account (the provider is given the account and routing number once, held at the provider) and mails it. The bank pays it when the vendor deposits. | **No.** The provider never holds the money. The bank account is the association's. | Reuses the B6 interface. Needs the association's bank details at the provider, a verification step (verify with provider), and a signature. |
| **C. Association-owned payments account** | The association opens its own account with a bill-pay provider, links its own bank, and we send instructions by API. The provider pulls from the association's bank and pays the vendor by ACH or check. | **Provider holds money in transit, not us.** The association is the provider's customer. | Gives ACH. Provider terms, fees and who is the money transmitter must be confirmed (verify with provider and counsel). We must never be the account holder or the signer. |
| **D. Stripe Treasury or a financial account** | Fund a financial account, then create outbound payments to the vendor by ACH or wire. | **Funds sit in a stored-balance account** at Stripe's bank partner. We would be a platform operating it. | Stripe's page says funds are held immediately in the financial account while a payment is in flight, and calls the v1 platform integration legacy. Heavier compliance and a different relationship with Stripe. Not recommended as the default. Whether it fits a Standard connected account is unconfirmed. |
| **E. Our platform balance or pooled account** | Dues or other money land with us, we pay vendors from the pool. | **Yes.** | Rejected. It breaks the position and invites money-transmitter and trust-account questions. |

**Why Connect payouts do not solve this.** Stripe Connect pays dues out to the association's bank. That is where the money for bills already is. Bill pay then draws on that bank account. The two designs meet at the bank account and never share a balance. Do not route vendor payments through the Stripe balance.

### 2.1 Recommendation

1. **Phase A (no provider):** payment objects, approvals, posting, a printable check and a positive pay file. Value without any new third party, and it is the fallback when a provider is down.
2. **Phase B (mailed checks, option B):** extend `MailProvider` with a check method so the same fake, quote, confirm and idempotency pattern applies. It is the smallest step beyond B6, it keeps the association's bank in charge of the money, and checks are what most small HOAs and their vendors accept today.
3. **Phase C (ACH, option C):** only when the owner chooses a provider whose account belongs to the association, counsel has answered section 10, and the provider confirms in writing who holds funds in transit. Until then the product says "pay by mailed check" and nothing about ACH.

If counsel or the provider says option B or C makes us a money transmitter or needs a license, Phase A still ships and we stop there.

### 2.2 What we store

Never a full vendor account or routing number, and never the association's full bank numbers. Keep a provider token or id, last four, and the verification state. Where a provider takes numbers directly in its own hosted form, the browser sends them to the provider (the same SAQ A idea as the dues design). If a provider cannot do hosted collection, that provider is out for ACH. Verify with provider.

## 3. Data model

SQL is not written yet. Follow the same patterns as 0073 and 0079: same-org triggers on every cross-table foreign key, board and admin read policies only, no write policy on any table (server writes with the service role), SECURITY DEFINER functions with a pinned search path, and ratchet rows.

| Object | Purpose |
|---|---|
| `vendor_payment_methods` | One row per vendor payment destination: kind (`check | ach`), provider token or reference, last4, verification state, status (`pending | active | on_hold | retired`), `changed_at`, `hold_until`, and the approval request that activated it. Remit-to name and address for checks come from `vendors.address` plus an optional `remit_to` override stored here. |
| `vendor_payments` | One row per payment: invoice id (unique while not voided, so a bill is paid once), vendor id, method row, `amount_cents` bigint, rail (`check_printed | check_mailed | ach`), status, `approval_request_id`, `scheduled_for`, `released_at`, check number, provider id, tracking facts, `idempotency_key`, JE and payment ids. |
| `check_sequences` | Next check number per bank account. Allocated inside a transaction with a row lock. |
| `vendor_payment_events` | Append-only trail: created, approved, released, mailed, delivered, returned, cleared, void, stop payment requested, with ids and cents. |
| `associations.vendor_pay_*` columns | `vendor_pay_enabled`, per-payment cap, per-day cap, new-vendor hold days, change hold days, stale check days. |

Money is integer cents in the new tables. `invoices.amount` stays `numeric(14,2)`; conversion to cents happens in one helper and a test asserts the payment equals the invoice to the cent.

Payment statuses: `draft -> awaiting_approval -> approved -> scheduled -> releasing -> sent -> delivered -> cleared`, with side exits `canceled`, `failed`, `returned`, `void`, `stale`. Monotonic transitions, enforced by a status guard in the update, the same approach as the dues webhook.

## 4. Approvals and controls

Two separate decisions, kept apart on purpose:

1. **Approve the bill** (exists): "this is owed, code it to this account". Ends in `enterBill`, status `approved`, money still owed.
2. **Approve the payment** (new): "release this money to this payee by this method". A new money action, `w39.vendor_payment`, added to `MONEY_ACTIONS` so `moneyGate` and the database dual-control trigger cover it with no new gating code.

### 4.1 Rules

| Control | Default | Where enforced |
|---|---|---|
| Two different board approvers for every payment | On. The dual-control threshold for vendor payments is `0` unless the association raises it (board policy, admin-set, audited). The existing `dual_control_cents` stays as it is for other money actions. | DB trigger, same as 0071. |
| Treasurer first | If a Treasurer exists, they sign first (existing `routeApproval`). | `moneyGate`. |
| Proposer never approves | Whoever creates the payment is not an approver. | `moneyGate` plus DB. |
| Bill entered by one person, paid by another | The user who approved the bill cannot be the releasing approver. One person alone can never enter, approve and pay. | New check in the payment function. |
| Amount equals the invoice | A payment is always the invoice amount in full for v1. Partial payments are out of scope. Edits to amount after approval void the approval. | Payment function. |
| Per-payment cap | Default $10,000, board-set, admin raises with a second admin approval. Above it the payment needs three signers (verify with the owner, section 9). | Payment function. |
| Daily cap | Default $25,000 per association across all rails. Over it, the payment waits for the next day. | Release job. |
| New vendor hold | First payment to a vendor waits 3 business days after the vendor is created or the payee details are first approved. | Release job. |
| Vendor must be `active` | `blacklisted` and `inactive` refuse. | Payment function. |
| W-9 on file | Refuse a payment when `w9_on_file` is false and the vendor's running total for the year is at or over $600, unless the board overrides with a reason. Feeds the 1099 list. | Payment function. |
| One payment per bill | Partial unique index on `invoice_id` where status is not `void`, `canceled`, `failed`. | DB. |
| Duplicate bill hint | Beyond the existing vendor plus invoice number check, warn on same vendor, same amount, within 30 days. | Propose step. |
| Cancel window | The board can cancel until the provider accepts the send. Release happens at a fixed daily time, not on approval, so there is a window to catch a mistake. | Release job. |
| Impersonation | The admin "view as" mode cannot propose, approve or release. | Server actions, with a test. |
| Audit | Every step writes `audit_log` with ids and cents only. No payee names, addresses or bank numbers. | In the same transaction. |

### 4.2 Vendor bank and address changes

Payment redirection fraud (a fake "we changed banks" email) is the main way these products lose money. Rules:

1. A change to a vendor's remit-to address or bank destination never edits the live record. It creates a **pending** `vendor_payment_methods` row and moves the vendor's payee to `on_hold`.
2. **Callback.** The board member must confirm by phoning the number already on file for the vendor (never a number from the change request or the invoice). The screen shows that stored number and asks for the date and the name of the person spoken to. This is a record, not a technical proof, and the screen says so.
3. **Second approver.** A different board member approves the change (matches the backlog note "a second approver when a vendor's remit-to details change", with BL-039).
4. **Waiting period.** After activation, the first payment to the changed destination waits the "change hold" (default 3 business days). Any payment already scheduled to the old destination is paused and shown for review.
5. **Notice.** All board members get an in-app notice of the change. An email to the vendor's old contact address is useful but vendor mail also goes through the outbound guard; only send it on an explicit board action, and never from a sandbox org. Verify the guard allows non-resident recipients before relying on it.
6. **Scanned bills that ask for a change.** The bill scan must flag text like "new remit-to", "updated bank details" or a different remit address than on file as `needs check`. The proposal never changes payee details by itself. This is a prompt change plus a rule in `billNeedsCheck`, not new model behavior.
7. ACH destinations additionally need the provider's verification (microdeposits or instant verification) before the first payment. Verify with provider.
8. Anyone with the board role can start a change; only board or admin can approve one; the person who started it cannot approve it.

### 4.3 Limits that need a human, not a rule

Rules cannot catch a valid vendor sending a real but inflated invoice. The board still sees the vendor, the amount, the bill image, the expense account and the last payment to that vendor on one screen before signing (a "pay this bill" card, plain words, large buttons).

## 5. Accounting posting

Reuse the ledger the dues work uses: `postJournalEntry`, the open fiscal period, `loadAccountingRefs`, `journal_entries.source`, and the existing `ap_invoice` source.

- **Bill approved** (exists): Dr 5xxx expense / Cr AP. No change.
- **Payment released** (new): Dr AP / Cr Cash-Operating (1010), the same JE `markInvoicePaid` writes. Decision: post at release, not at approval, because a scheduled payment can still be canceled. For checks this matches how a checkbook works: cash drops when the check is written and the check shows as outstanding until it clears.
- **Void or stop payment before clearing:** a reversing JE (`source = 'reversing'`) Dr Cash / Cr AP, the invoice goes back to `approved`, the payment row to `void`. A stop payment is only final after the bank confirms it.
- **ACH returned:** the same reversal, plus an alert to the board.
- **Cleared:** matching the bank feed (`bank_transactions`) sets the matched entry the way the bank matcher does for dues. Match on amount, check number where the bank gives it, and a date window. Unmatched after the stale window shows on the reconciliation screen as "Check not cashed yet".
- **Outstanding checks** are the released checks without a matched bank line. The reconciliation report must list them as reconciling items, not errors, and period close must tolerate them (the same treatment as the 1015 clearing account in the dues design).
- **Provider fees** (mailing, per-check): Dr 6xxx bank and postage expense / Cr Cash at the time the provider charges. Where the association pays the provider through its own account, this is just a bank line. Where the provider bills the association's card or invoice, record Dr expense / Cr AP to the provider. The chart account is created lazily in app code, like `6150`.
- **Dates:** the association's time zone (`todayIn(assoc.timeZone)`), noon UTC for entry dates, as `markInvoicePaid` does.
- **1099:** the year-end candidate list sums payments by vendor. Voided payments net out. Check that the list reads the new payment table through the same `payments` rows so it needs no change. Test it.
- **Idempotency:** one JE per payment, enforced by a unique `source_id`; a replayed provider event or retry cannot post twice. If posting fails after the provider accepted the send, the payment stays `sent` with `posting_error` set and a repair job (section 8) finishes it. The money moving is never undone by a posting error.

## 6. Check printing and positive pay

### 6.1 Checks

- **Check numbers:** `check_sequences` per bank account, allocated under a row lock when the payment is released (not when approved), so gaps mean voids, which are recorded. The board sets the starting number from their checkbook once.
- **Phase A print:** a PDF on standard 3-per-page or top-check stock with MICR left blank for pre-printed stock. We do **not** print MICR ink lines ourselves in Phase A. The board uses their bank's pre-printed stock, or Phase B uses the provider. MICR printing needs toner and font control and is the provider's job (verify with provider).
- **Layout:** payee, amount in numbers and words (integer cents to words, tested to the cent), date, memo (invoice number), two signature lines when the association requires two signers on checks, check number, and the stub with the invoice and bill date.
- **Signature:** a stored signature image is a fraud risk. v1 prints a line and the board signs by hand (Phase A) or the provider's signature handling applies (Phase B, verify with provider). No stored signature images.
- **Phase B mailed check:** `MailProvider` gets `sendCheck(request)` with the same idempotency key (the payment id), `quote`, and `track`. The request holds the payee and address, amount in cents, check number, memo, the provider's bank account id, and an optional attached PDF (the invoice copy). The fake provider returns a deterministic id and status. The result row stores ids, cents, check number and tracking only. No payee name or address is stored by us beyond what the vendor record already holds.
- **Cost:** the board sees the provider's price before confirming, and the confirmed figure must equal the server's recomputed one, exactly the `send.ts` rule. Prices are config, not hard-coded (section 11 gives the figures seen).
- **Mail service:** first class by default. Certified mail is possible for large payments and is an option, not the default.

### 6.2 Positive pay

Positive pay is a bank service: the association sends the bank a file of issued checks (number, amount, date, payee), and the bank pays only matches or asks the association to approve exceptions.

- It is configured **with the association's bank**, not by us. Our part is a **positive pay issue file** the treasurer can download or that the board uploads to the bank's portal.
- Formats differ by bank (many accept CSV, some require NACHA-like or fixed width). **I could not confirm any bank's format.** v1 offers a generic CSV (check number, issue date, amount in dollars, payee name, status `issued | void`, bank account last4) and says plainly that the bank may need another layout.
- A void produces a void line in the next file, so a stopped check does not cash.
- Direct bank connections (SFTP or API upload) are out of scope.
- Positive pay does not stop a legitimate check to the wrong payee. It protects against altered amounts, forged checks and checks that were voided or never issued. The UI should not oversell it.
- Many small HOA accounts at community banks may not offer it, or may charge for it. Treat it as optional and say what it covers.

## 7. Failure handling

| Failure | What happens |
|---|---|
| Provider is down or returns an error at send | No record of a send is written; the payment stays `approved` and shows "We could not send this yet. Nothing was mailed." The retry uses the same idempotency key, so a retry cannot mail two checks. Same rule as `send.ts`. |
| Provider accepted, our write failed | The provider id is in the logs by id only. A repair job looks up the payment by idempotency key at the provider and completes the row. Daily, not frequent (Inngest budget). |
| Duplicate request or double click | Unique idempotency key and unique one-payment-per-bill index return the same row. |
| Webhook or tracking update out of order | Monotonic status guard; a late `in_transit` cannot downgrade `delivered`. |
| Check returned undeliverable | Status `returned`, board alerted, the payment is voided with a reversing JE, the vendor goes `on_hold` for address review. Reissue is a new payment with a new approval. |
| Vendor says it never arrived | Board starts "Stop and reissue": stop payment instruction is a manual bank step (we remind the treasurer and provide the check number and amount), the payment is marked `stop_requested`, and the bill stays paid in the books until the bank confirms; then void and reissue. |
| Check not cashed | After the stale window (default 90 days, the board sets it) the payment is flagged `stale` for review. Banks commonly treat checks as stale after six months (verify with counsel). Unclaimed property rules for uncashed vendor checks vary by state and may need reporting (verify with counsel, Georgia first). |
| Amount or payee was wrong | Cancel before send; after send, void and recover per above. Never edit a sent payment. |
| ACH returned | Return code stored, reversal posted, alert to the board, payee moves to `on_hold` for the codes that mean wrong or closed account. |
| Bank account of the association lacks funds | A check bounces to the vendor. The release job warns when the Plaid balance (informational per `bank_accounts.current_balance`) is below the day's total. It is a warning, not a block, because the cached balance may be stale. |
| Posting fails | Payment stays `sent`, `posting_error` set, the repair job posts. Never silently skip. |
| Sandbox org or non-production | Fake provider only. No real mail, no real bank calls. The outbound guard stays on for any vendor email. |
| Provider outage lasts days | Phase A is the fallback: the board prints the same payment as a check and marks it printed. |

## 8. Build plan

All PRs dark behind the flag and the per-association switch. Providers behind a thin interface faked in tests, like Stripe and Lob so far. No tests call a live provider.

| # | PR | Scope | Tests |
|---|---|---|---|
| 0 | Owner applies the new SQL | Owner action, nothing to merge. | CI replays it on the ephemeral DB. |
| 1 | `feat(db): vendor payments schema and flag` | Tables from section 3, the payment functions, check sequence function, RLS, ratchet rows, flag set to `false`. | Integration: RLS, no write policy, one payment per bill, check numbers have no duplicates under concurrency, dual control for `w39.vendor_payment`. |
| 2 | `feat(vendor-pay): payee details and change control` | Payee screens, pending and hold states, callback record, second approver, hold timer, scan flag for "new bank details". | Unit: change never edits live record; proposer cannot approve; hold blocks release; scanned change text is flagged. |
| 3 | `feat(vendor-pay): propose, approve, release` | `w39.vendor_payment` action in `MONEY_ACTIONS`, "pay this bill" card, release job (one daily Inngest function), caps, W-9 rule, posting through the existing JE path, void. | Unit: caps, new-vendor hold, bill and payment by different users, posting equals invoice to the cent, void reverses, impersonation refused. |
| 4 | `feat(vendor-pay): printable checks` | Check PDF, amount in words, sequence, outstanding checks list, reconciliation treatment. | Amount-to-words property tests, number gap tests, period close accepts outstanding checks. |
| 5 | `feat(vendor-pay): positive pay file` | Generic CSV, void lines, download. | Snapshot of the file; void appears once. |
| 6 | `feat(vendor-pay): mailed checks` | `MailProvider.sendCheck`, fake provider, quote and confirm, tracking, returns, stale handling, repair job. | Idempotent retry mails once; confirmed amount mismatch refuses; provider failure records nothing; out-of-order tracking. |
| 7 | `feat(vendor-pay): bank matching` | Match cleared checks to `bank_transactions`, "not cashed yet" list. | Matcher unit tests: amount, number, window, tie-break. |
| 8 | `feat(vendor-pay): ACH` (Phase C) | Only after section 10 is answered. Provider adapter, destination verification, returns. | Provider test mode; return codes; verification required before first payment. |
| 9 | `chore: launch` | Release note, help article, board how-to, `docs/owner-actions.md` entries, flag flip PR, one real $1 test by the owner. | Smoke list. |

Cron budget (Inngest Hobby, 50k executions a month): one daily release-and-repair job that fans out inside a single function, plus the existing tracking path. No sub-hourly job. Under 100 executions a month for this feature.

Estimated effort matches the backlog's 4, if Phase C is left for a later release.

## 9. Owner decisions

1. Which provider for mailed checks (Lob or PostGrid, both already named in `MailProvider`), and whether the owner will open the account and set keys. This blocks Phase B.
2. Payment caps: per payment, per day, and the amount above which three signers are required. Recommendation: $10,000, $25,000, and three signers over $25,000.
3. Default hold for a new vendor and for changed details (recommendation: 3 business days for both).
4. Whether Phase C (ACH) is wanted this year, and whether to price bill pay (per-check pass-through plus a margin, or included in the plan). Do not decide the price until a provider quote is in hand.
5. Whether the dual-control threshold for vendor payments is `0` (every payment needs two approvers, recommended) or follows the existing `dual_control_cents`.
6. Stale check days (recommendation 90).

## 10. Questions for counsel

Not legal advice; these are questions to ask.

1. **Money transmission.** Does option B or C, with us instructing payments from the association's own bank account through a provider account the association owns, make us a money transmitter or require a license in Georgia or other states? Is "we never hold funds" enough, and what do our provider contracts need to say?
2. **Authority.** Does our authority to instruct payment need a written power or agreement from the association (board resolution, a signed authorization), and what must the governing documents allow? What is the board's liability if a volunteer approves a bad payment?
3. **ACH.** NACHA rules for the originator when a software provider initiates ACH credits on behalf of the association; authorization from the vendor; who is the originator.
4. **Check law.** Rights and duties for stale checks, stop payments, and unclaimed property for uncashed vendor checks (Georgia first); whether electronically created or remotely created items change anything.
5. **Fraud liability.** Where the loss falls when a vendor change was approved by two board members after a fake callback. Contract language for the board's controls, and for any insurance (crime and fidelity coverage the association may need).
6. **Georgia rules on association funds.** Any Georgia POA Act rule on who may sign checks or require two signatures for disbursements (do not quote law from memory; use the official fixtures when the law brain has the section).
7. **1099.** Whether the platform's role triggers any information-reporting duty of its own (we believe not, because the association pays and reports; confirm).
8. **Records.** Retention of vendor payment records and bank detail tokens.

## 11. Provider capabilities and prices (checked 2026-11-02, provider sites only)

Fetched from the providers' own pages on 2026-11-02. Prices change and the fetch returned summaries, so treat every figure as a starting point for a quote.

- **Lob pricing page** (`lob.com/pricing`): lists checks as a mail format in the print and postage section. "Starting at" per piece: Developer plan $1.19, Startup (listed Small Business in the comparison) $1.04, Growth $1.04, Enterprise custom. Plans: Developer $0 a month, Startup $260 a month, Growth $550 a month, Enterprise custom. **Not confirmed:** whether $1.04 to $1.19 is the check price or a general piece price, the bank account verification steps, signature and MICR handling, and any positive pay support. The API reference page was too large to read in full (about 115,000 characters were not read), so I did not confirm check requirements.
- **PostGrid** (`postgrid.com/pricing`): says the Print and Mail API sends letters, postcards and checks, and links to check pages. **Not confirmed:** any per-check or plan price (none on the page), any ACH offering.
- **Checkbook** (`checkbook.io/pricing`), an ACH and check payments provider, not currently named in the repo: plans Business at $2,000 a month and Enterprise custom, API access on both, mailed physical check listed as an option. **Not confirmed:** per-check and per-ACH fees (not shown), whether it debits the payer's own bank or holds funds, and who is the licensed party.
- **Stripe Treasury** (`docs.stripe.com/treasury/.../outbound-payments`): outbound payments move money from a **financial account** to an external bank account by ACH or wire (or between financial accounts). The page says the funds are allotted to a pending transaction at creation, says the v1 platform integration is a legacy integration not to be used for new builds, and says same-day ACH is limited preview. **Not confirmed:** eligibility and cost for a Standard connected account that is an HOA, whether Treasury supports mailed checks (the page shows ACH and wire only), and pricing.

**What I could not confirm at all:** every provider's check bank-verification rules; whether any named provider supports positive pay or sends positive pay data; ACH credit pricing from Lob, PostGrid or Checkbook; any provider's regulatory status as a money transmitter or the party holding funds in transit; and any bank's positive pay file format. No provider was contacted and no sales page was submitted.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Vendor impersonation and redirected payments | Callback to the number on file, second approver, hold period, scan flag for change requests. |
| One person alone moves money | Different bill approver, payment proposer and approvers; DB-enforced dual control. |
| Double payment | Idempotency key, one payment per bill, unique JE source. |
| We drift into holding funds | Option D and E rejected; Phase C needs written provider and counsel answers; no pooled account. |
| Wrong bank detail stored by us | We store only provider tokens and last four. |
| Posting and cash drift apart | Post at release, repair job, bank matching, outstanding checks list. |
| Cron budget | One daily job. |
| Sandbox org mails a real check | Fake provider outside production and for sandbox orgs; the send action refuses without a real provider and key. |
| Positive pay format unknown | Generic CSV, owner and treasurer confirm with the bank before relying on it. |
