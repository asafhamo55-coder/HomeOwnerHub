# HOA Hub product backlog (ranked)

**Date:** 2026-10-15 · **Source:** `docs/research/2026-10-competitors.md`. Every "evidence" line below points into that document (§ numbers) or into the code.

## Scoring

**Score = Impact × Confidence ÷ Effort**

- **Impact (1–5):** 5 means it changes whether a board can adopt or stay. 1 is housekeeping.
- **Confidence (0.5–1.0):** how sure we are that the value is real and the estimate holds. It goes down for unknown data formats, legal nuance, and anything that depends on an external vendor.
- **Effort:** agent-days of focused work, including tests. It does not include the owner's manual steps (pasting a migration, creating an account).

Bucketing follows the score, with explicit overrides noted on the item. "Now" puts items with no migration first. Items that need a migration are **batched** so Asaf pastes SQL once per batch:

| Batch | Items | When |
|---|---|---|
| M1 | BL-007, BL-020 | Now |
| M2 | BL-023, BL-026, BL-030 | Next |
| M3 | BL-033, BL-034, BL-035, BL-036, BL-037, BL-038 | Later |

### Non-negotiable rules for every item

1. **No real email or SMS reaches a resident from testing.** BL-004, the outbound safety guard, is a hard prerequisite for every item that sends: BL-013, BL-016, BL-025, BL-026, BL-032.
   - Today `lib/email.ts` either has no key (no send) or sends to anyone. No recipient allowlist exists.
2. **Money:** anything that posts to the ledger or moves money goes through the approval layer (`packages/workflows/src/approvals`), or is a board action that is explicitly confirmed. Nothing posts automatically.
3. **Resident PII:** scripts and dry runs log ids and counts only. Exports and imports are board/admin-only and audited.
4. **Migrations:** the owner applies them by hand. Ship the dependent code only after he confirms the apply and the verification output has been recorded (see `docs/NEXT.md` on 0054/0055).

## Summary table

**Column key:** Imp = impact · Conf = confidence · Eff = effort in agent-days · Mig = needs a migration · Keys = needs an external account or keys.

| Rank | ID | Title | Imp | Conf | Eff | **Score** | Mig | Keys | Bucket |
|---|---|---|---|---|---|---|---|---|---|
| 1 | BL-001 | Pricing scenarios for the self-managed segment (owner decision) | 5 | 0.6 | 0.5 | **6.00** | no | no | Now |
| 2 | BL-002 | Marketing truth pass: claims match shipped features | 3 | 1.0 | 0.5 | **6.00** | no | no | Now |
| 3 | BL-003 | Daily digest tells the board when the mailbox is broken | 3 | 0.9 | 0.5 | **5.40** | no | no | Now |
| 4 | BL-004 | Outbound safety guard (recipient allowlist / sink outside prod) | 4 | 0.9 | 1 | **3.60** | no | no | Now |
| 5 | BL-005 | Inbox shows backfill progress / failure | 2 | 0.9 | 0.5 | **3.60** | no | no | Now |
| 6 | BL-006 | Resident "Pay" screen with Pay-by-Zelle memo code | 5 | 0.9 | 1.5 | **3.00** | no | no | Now |
| 7 | BL-007 | Close `ownerships`/`units` RLS hole | 4 | 0.9 | 1.5 | **2.40** | **yes (M1)** | no | Now |
| 8 | BL-008 | First-run setup checklist on the board dashboard | 3 | 0.8 | 1 | **2.40** | no | no | Now |
| 9 | BL-009 | Privacy-safe product analytics | 3 | 0.8 | 1 | **2.40** | no | **yes** | Now |
| 10 | BL-010 | Resident ledger and printable statement | 3 | 0.9 | 1.5 | **1.80** | no | no | Now |
| 11 | BL-011 | Full data export (zip of CSVs) | 3 | 0.9 | 1.5 | **1.80** | no | no | **Done (c2)** |
| 12 | BL-012 | Empty states carry the next action | 2 | 0.9 | 1 | **1.80** | no | no | **Done (c2)** |
| 13 | BL-013 | Automated dues reminders (behind BL-004) | 4 | 0.8 | 2 | **1.60** | no | no | **Done (c2)** |
| 14 | BL-014 | One approvals inbox across AI workflows | 4 | 0.8 | 2 | **1.60** | no | no | **Done (c3)** |
| 15 | BL-015 | FL §720.303 records and notices compliance check | 4 | 0.8 | 2 | **1.60** | no | no | **Done (c3)** |
| 16 | BL-016 | Monthly board packet | 4 | 0.8 | 2 | **1.60** | no | no | **Done (c3)** |
| 17 | BL-017 | Inbox attachment retry controls + per-tenant fairness | 2 | 0.8 | 1 | **1.60** | no | no | Next |
| 18 | BL-018 | Mailbox reconnect skips a completed backfill | 1 | 0.8 | 0.5 | **1.60** | no | no | Next |
| 19 | BL-019 | Statute-aware violation letters (W3 + W30) | 4 | 0.7 | 2 | **1.40** | no | no | **Done (c4)** |
| 20 | BL-020 | Per-member email consent (CA §4040) | 3 | 0.7 | 1.5 | **1.40** | **yes (M1)** | no | Now |
| 21 | BL-021 | AI bill scan → AP bill proposal | 4 | 0.8 | 2.5 | **1.28** | no | no | **Done (c6)** |
| 22 | BL-022 | ⌘K searches records, not just pages | 3 | 0.8 | 2 | **1.20** | no | no | **Done (c6)** |
| 23 | BL-023 | Polls and surveys (non-binding) | 4 | 0.8 | 3 | **1.07** | **yes (M2)** | no | Next |
| 24 | BL-024 | Resident ARC pre-check against guidelines (W1) | 3 | 0.7 | 2 | **1.05** | no | no | Next |
| 25 | BL-025 | Bilingual (EN/ES) communications | 3 | 0.7 | 2 | **1.05** | no | no | Next |
| 26 | BL-026 | SMS to residents in production, with consent | 3 | 0.7 | 2 | **1.05** | **yes (M2)** | **yes** | Next |
| 27 | BL-027 | Board-side AI ARC review → approval layer | 4 | 0.7 | 3 | **0.93** | no | no | Next |
| 28 | BL-028 | Mobile inspection mode (drive-by capture) | 4 | 0.7 | 3 | **0.93** | no | no | Next |
| 29 | BL-029 | Budget first draft from prior year + actuals | 3 | 0.6 | 2 | **0.90** | no | no | Next |
| 30 | BL-030 | Per-state violation procedure engine (FL first) | 5 | 0.7 | 4 | **0.88** | **yes (M2)** | no | Next |
| 31 | BL-031 | CINC import (homeowner list + aging report) | 4 | 0.6 | 3 | **0.80** | no | no | Next |
| 32 | BL-032 | Mailed letters from the app (violation/collections) | 3 | 0.7 | 3 | **0.70** | yes (M3) | **yes** | Later |
| 33 | BL-033 | Law-to-bylaw *findings* report (F phase 1, FL) | 4 | 0.6 | 4 | **0.60** | yes (M3) | no | Later |
| 34 | BL-034 | Amenity booking | 3 | 0.8 | 4 | **0.60** | yes (M3) | no | Later |
| 35 | BL-035 | Stripe ACH/card resident payments | 5 | 0.7 | 6 | **0.58** | yes (M3) | **yes** | **Next (override)** |
| 36 | BL-036 | Autopay | 3 | 0.6 | 3 | **0.60** | yes (M3) | **yes** | Later (after BL-035) |
| 37 | BL-037 | Reserve fund tracking | 3 | 0.6 | 4 | **0.45** | yes (M3) | no | Later |
| 38 | BL-038 | Public HOA website + Notices page | 3 | 0.6 | 4 | **0.45** | yes (M3) | no | Later |
| 39 | BL-039 | Electronic vendor payments | 3 | 0.5 | 6 | **0.25** | yes | **yes** | Later |
| 40 | BL-040 | Native app shell (store listing) | 2 | 0.5 | 5 | **0.20** | no | **yes** | Later |

**Now:** about 24 agent-days.

**Overrides:**
- BL-035 is promoted to Next despite its score. Resident card/ACH payment is table stakes (§4a.1), and its effort is high only because the money path must be done carefully. The owner should open the Stripe account work now so it isn't the blocker.
- BL-017 and BL-018 are demoted to Next despite their scores. They are cheap, but they matter only when a second mailbox connects.

---

## Now (next 2 cycles)

### BL-001 — Pricing scenarios for the self-managed segment
- **User value:** a 50-unit volunteer board can afford us next to PayHOA without giving up our accounting and AI.
- **Evidence:**
  - We charge $249.50/mo for 50 units; PayHOA charges $65, GnomeOwner $59, and HomeHerald is free up to 50 units (research §1.5, §3).
  - The best-reviewed tools publish flat tiers (§4c.1).
- **Effort:** 0.5 · **Migration:** no · **Keys:** no
- **Risk:** a pricing change is the owner's decision. The deliverable is a doc, not a change to the pricing page.
- **Acceptance:** `docs/decisions/` gets a draft ADR with three priced scenarios. Each scenario has:
  - a per-door rate, a floor, and an unbundled AI add-on
  - revenue at 25, 50, 150 and 400 units against PayHOA, Enumerate and Buildium
  - the variable-cost basis (Groq/LLM cost per org per month, taken from `ai_runs` token counts if available, otherwise stated as an estimate)
  - a recommendation, left for the owner to decide

### BL-002 — Marketing truth pass
- **User value:** a board never buys a feature that doesn't exist.
- **Evidence:**
  - `apps/marketing/src/app/pricing/page.tsx` lists "Multilingual comms", "Reserve Live", "ARC Recommender", "multi-board access controls" and "Export is one-click", none of which is built (research §1.4.2).
  - It also says the product "launches in Georgia" while FL ingestion is shipping.
- **Effort:** 0.5 · **Migration:** no · **Keys:** no
- **Risk:** none. This is copy only.
- **Acceptance:**
  - Every pricing and feature bullet maps to a shipped route or is labelled "Roadmap".
  - The list of claims that were removed or relabelled is in the PR description.
  - `rtk pnpm build` passes for marketing.

### BL-003 — Daily digest tells the board when the mailbox is broken
- **User value:** a board that hasn't logged in for a week learns that its mail stopped syncing.
- **Evidence:** in the parking lot, "broken mailbox never reaches a board that isn't logged in". `dailyDigestJob` computes the condition and only logs it.
- **Effort:** 0.5 · **Migration:** no · **Keys:** no
- **Risk:** outbound email to **board members only**. It goes through BL-004's guard once that lands; until then, test only with unit tests and a mocked sender.
- **Acceptance:**
  - The digest includes a "Mailbox disconnected since <date> — reconnect" block with a link to `/settings/mailbox` whenever the condition is true.
  - A unit test covers both the present and the absent case.
  - No resident is ever a recipient (asserted in a test).

### BL-004 — Outbound safety guard
- **User value:** we can test every sending feature without ever emailing or texting a real resident.
- **Evidence:**
  - `apps/hoa/src/lib/email.ts` sends to any address once `RESEND_API_KEY` is set. `lib/sms.ts` is the same.
  - The owner's rule: never send real email or SMS to residents in testing.
- **Effort:** 1 · **Migration:** no. Uses an env var plus a flag in `associations.compliance_settings` jsonb.
- **Keys:** no
- **Risk:** this is the safety net itself. The failure to avoid is a guard that silently allows a send.
- **Acceptance:**
  - A single choke point wraps `sendEmail`/`sendSms`/`mailbox-send`. Outside `VERCEL_ENV=production`, and for any org whose `compliance_settings.outbound_mode = 'sandbox'`, it rewrites or blocks recipients that are not on an allowlist (`OUTBOUND_ALLOWLIST`, a domain list such as `example.test`).
  - Every blocked send is recorded with ids only.
  - Unit tests prove a resident address is blocked in preview and sandbox.
  - A ratchet test fails if any module imports the Resend or Vonage SDK outside the choke point.

### BL-005 — Inbox shows backfill progress / failure
- **User value:** during a 12-month import the board knows that history is still arriving.
- **Evidence:** parking lot, "backfill progress is invisible on `/inbox`". The state is already stored (`backfill_status`, `backfill_progress`).
- **Effort:** 0.5 · **Migration:** no · **Keys:** no
- **Risk:** none.
- **Acceptance:**
  - A banner on `/inbox` shows "Importing history — N of ~M" while running, and "Import failed — retry from Settings" on failure.
  - The banner is hidden when complete.
  - It follows the design-system v2 `Alert` and is truthful when the status read itself fails.

### BL-006 — Resident "Pay" screen with Pay-by-Zelle memo code
- **User value:** a resident can pay dues from their phone in two taps. The board gets automatic matching instead of reconciling by hand.
- **Evidence:**
  - `/resident/dues/page.tsx:110` says "contact your community manager".
  - ADR-005 calls Pay-by-Zelle "the killer feature for self-managed boards".
  - `assessments.memo_code` and W18 memo matching already exist.
  - Every competitor has resident payment (research §3, §4a.1).
- **Effort:** 1.5
- **Migration:** no. The Zelle recipient and display name go in `associations.compliance_settings` jsonb; the board sets them in Settings.
- **Keys:** no
- **Risk:**
  - **Money.** The wrong memo code or recipient means a payment arrives unmatched. Mitigations:
    - show the board a preview of exactly what residents see
    - the memo code comes from `memoCodeFor`, the same function W18 parses
    - no posting changes; W18 and approvals stay the only way a payment gets booked
  - **PII:** the screen shows only the resident's own units (RLS 0061), with BL-007 as a follow-up.
- **Acceptance:**
  - A primary "Pay" action appears on `/resident` and `/resident/dues` when a balance is due.
  - The Pay sheet shows the amount, recipient and memo code, with copy buttons.
  - It shows "Online payments aren't set up yet — contact your board" when the board hasn't configured Zelle.
  - The Settings screen has a field for the Zelle recipient, with a live preview.
  - A unit test proves the screen's memo code round-trips through W18's `parseMemoCode`.
  - The ux-ratchet stays green.

### BL-007 — Close the `ownerships`/`units` RLS hole (migration batch M1)
- **User value:** a resident can't make themselves the owner of a neighbour's unit to read their dues. That matters more once BL-006 and BL-010 show richer per-unit data.
- **Evidence:** parking lot 2026-10-15, "`ownerships` and `units` are still FOR ALL, org-only". Revisit trigger: "before any resident self-service flow".
- **Effort:** 1.5 · **Migration:** **yes** · **Keys:** no
- **Risk:** this breaks onboarding, import or property-360 writes if the write-path inventory is incomplete. Do the inventory first and extend `tests/integration/security/`.
- **Acceptance:**
  - A migration splits the policies per command: members read; board/admin write.
  - Every write path is listed in the PR with its role.
  - An integration test proves a resident `INSERT` into `ownerships` is denied and that the import and invite paths still work.
  - An apply script with a STEP 3 policy listing is included, and its output is recorded in `docs/NEXT.md` after the owner applies it.

### BL-008 — First-run setup checklist
- **User value:** a new board reaches a useful state (bank connected, owners imported, documents uploaded, board invited, first announcement sent) without a founder on the call.
- **Evidence:**
  - Competitors' "hard implementation" complaints (Enumerate, Vantaca; research §2.1).
  - The parking lot says onboarding is founder-led.
  - The research doc's UX pattern §4c.6.
- **Effort:** 1 · **Migration:** no. Each step's completion is derived from existing data.
- **Keys:** no
- **Risk:** none.
- **Acceptance:**
  - The dashboard card shows 6 steps, each with a done or not-done state computed from data, a deep link, and a progress bar.
  - It can be dismissed once complete.
  - When a source read fails it shows "Couldn't check", never "done".

### BL-009 — Privacy-safe product analytics
- **User value:** we learn which features boards actually use, so the backlog stops being guesswork.
- **Evidence:** the UX plan found no analytics library in any app, so "highest-traffic" is a judgement call.
- **Effort:** 1 · **Migration:** no
- **Keys:** **yes.** Vercel Web Analytics needs to be enabled on the project, or PostHog needs a key.
- **Risk:** resident PII. Events carry only a route template, an org id hash and a role. No names, addresses or free text. Session replay stays off.
- **Acceptance:**
  - Page views are recorded on hoa board and resident routes.
  - 8 named events: pay sheet opened, approval decided, AI draft accepted or edited, and so on.
  - A unit test asserts that event payloads contain only allow-listed keys.
  - The privacy page is updated.

### BL-010 — Resident ledger and printable statement
- **User value:** a resident sees every charge and payment, not just a balance, and can print a statement for a refinance or a dispute.
- **Evidence:** the CINC and Vantaca resident apps show the ledger (research §2.1). Ours shows only the balance.
- **Effort:** 1.5 · **Migration:** no. 0061 already scopes resident reads to their own units.
- **Keys:** no
- **Risk:** resident PII. Show only their own units, and depend on BL-007 to close the forged-ownership path.
- **Acceptance:**
  - `/resident/dues` gains a ledger tab: date, description, charge, payment, running balance.
  - A print stylesheet produces a one-page statement.
  - An integration test proves resident A can't see unit B's rows.

### BL-011 — Full data export
- **User value:** the board owns its data and can leave, which is what marketing already promises.
- **Evidence:**
  - Pricing says "Export is one-click in any plan".
  - We have 4 list CSVs (`properties`, `violations`, `leases`, `vendors` export routes).
- **Effort:** 1.5 · **Migration:** no · **Keys:** no
- **Risk:** **PII in bulk.**
  - Board/admin only.
  - Writes an audit-log row.
  - Streamed, never stored server-side.
  - No `plaid_items.access_token` or other secrets in it.
- **Acceptance:**
  - `/settings` gets a "Download all data" action that builds a zip with one CSV per domain: units, owners, residents, assessments, payments, journal entries, violations, ARC, tickets, documents index, vendors, meetings.
  - A test asserts the column allowlist excludes secrets.

### BL-012 — Empty states carry the next action
- **User value:** a new board knows what to do on every empty page.
- **Evidence:** research UX pattern §4c.7. The truthful empty and failed states from phase 1 already exist.
- **Effort:** 1 · **Migration:** no · **Keys:** no
- **Risk:** none.
- **Acceptance:**
  - The 12 highest-traffic board pages have an `EmptyState` with a primary action ("Connect bank", "Import owners", "Upload governing documents"…).
  - A ratchet rule rejects an `EmptyState` without an `action` on those routes.

### BL-013 — Automated dues reminders
- **User value:** the treasurer stops chasing late payers by hand.
- **Evidence:**
  - `apps/hoa/src/lib/dues-reminders/` renders packets but nothing sends them.
  - Every competitor sends reminders, and HomeHerald markets its "Dues Chaser" (research §3).
- **Effort:** 2
- **Migration:** no if each send is logged as a `communications` row with recipients (0018). Confirm this in the spec, and move the item to M1 if it needs its own table.
- **Keys:** no (Resend is already configured).
- **Risk:**
  - **Outbound email to residents.** Requires BL-004.
  - Off by default per org.
  - The board approves the cadence and template once.
  - A dry-run preview lists the recipient count and ids only.
- **Acceptance:**
  - An Inngest job sends reminders on board-chosen days relative to the due date (default: day −3, +5, +15).
  - It skips units on an active payment plan or in collections at the attorney stage.
  - Each send is idempotent per assessment and step.
  - A unit test proves a sandbox org sends nothing to a non-allowlisted address.

### BL-014 — One approvals inbox
- **User value:** the board sees every AI-proposed action (W18 postings, W3 violation letters, W21 vendor approvals) in one place, with one-click decisions and an audit trail. This is the core of "AI proposes, the board approves".
- **Evidence:**
  - Approval layer D has one consumer.
  - W3 and W21 each have their own queue page.
  - CINC's "intelligence recommends; people decide" (research §4b.2).
- **Effort:** 2 · **Migration:** no. It reads the existing `approval_requests`, `ai_runs` pending rows, and the vendor queue.
- **Keys:** no
- **Risk:**
  - **Money:** decisions call the existing executors. No new posting path is added.
  - Must not double-post (the 0061 index plus the executor check).
- **Acceptance:**
  - `/approvals` lists pending items from every source, with type filters, amount, and the AI's reasoning or citations.
  - Approve/reject reuses each module's action.
  - The sidebar shows a count badge.
  - Old queue pages link to it.
  - Integration test: approving a W18 item from `/approvals` posts exactly once.

### BL-015 — FL §720.303 records and notices compliance check
- **User value:** a Florida board of 100+ parcels can see at a glance whether its owner portal meets the statute.
- **Evidence:** §720.303(4): an owner-only website, required record categories, notices 14 days ahead (research §2.4).
- **Effort:** 2 · **Migration:** no. Document categories are mapped through existing type/tag fields, and meetings data already exists.
- **Keys:** no
- **Risk:**
  - Legal accuracy. Each checklist line quotes the statute text from the ingested FL Ch. 720 (W30 data). The page carries the existing disclaimer. Present it as an aid, not a certification.
- **Acceptance:**
  - `/legal/compliance` (FL orgs only) lists each statutory record category: present (with a link), missing, or stale.
  - It lists upcoming meetings whose notice was posted fewer than 14 days ahead.
  - Every line cites §720.303 with a validated quote.
  - Covered by unit tests with fixtures.

### BL-016 — Monthly board packet
- **User value:** the treasurer brings one printable packet to the meeting instead of assembling it from 6 pages.
- **Evidence:**
  - CINC Cephai builds board packets (research §2.1).
  - The UX plan's phase 3 called for a print stylesheet for board packets.
- **Effort:** 2 · **Migration:** no · **Keys:** no
- **Risk:**
  - The packet contains resident delinquency data. It is board-only and must not be emailed from the product in v1.
  - Totals must come from full queries, not a paged list (UX decision 11).
- **Acceptance:**
  - `/meetings/[id]/packet` renders: income statement and balance sheet for the period, budget vs actual, delinquency summary (counts and amounts, units listed for the board), open violations and ARC, the previous meeting's action items, and the agenda.
  - It prints cleanly to PDF from Safari.
  - Each section shows "Couldn't load" rather than zero on failure.

### BL-019 — Statute-aware violation letters
- **User value:** a violation letter never skips a step the state requires (hearing notice, cure period, fine cap) and says which law applies.
- **Evidence:** FL §720.305 and the CA $100 cap / AB 130 (research §2.4). No competitor encodes this (§3, "state-specific hearing/fine steps").
- **Effort:** 2 · **Migration:** no. Rules live in code per state; the association's state is already stored.
- **Keys:** no
- **Risk:**
  - **Legal.** Letters stay drafts behind the existing W3 approval.
  - Statute quotes go through the W32-style validator.
  - States without verbatim text get "verify against the statute" wording.
- **Acceptance:**
  - W3 receives the association's state rule set:
    - FL: 14-day hearing notice; fines only after a committee hearing; cure means no fine.
    - CA: $100 cap unless there's a health or safety finding; no late fees on fines.
  - Drafts include the right notice language and a quoted citation.
  - The draft is refused, with a reason, if the board requests a step the rules forbid.
  - The eval set (`W3-violation-inspector/eval.ts`) gains FL and CA cases.

### BL-020 — Per-member email consent (CA §4040) (migration batch M1)
- **User value:** California boards can lawfully send notices by email, and every board knows who has opted out.
- **Evidence:** Civ. Code §4040 requires written or email consent that the member can revoke (research §2.4).
- **Effort:** 1.5 · **Migration:** **yes**. Consent columns, or a consent table, on members/residents.
- **Keys:** no
- **Risk:** resident PII. Consent records are evidence, so log changes append-only.
- **Acceptance:**
  - Residents can grant or revoke email consent in `/resident/account`.
  - The board sees consent status per member.
  - Communications to CA orgs exclude non-consenting members from *official notices*, and the audience step shows the count excluded.
  - An integration test covers revocation.

---

## Next

### BL-017 — Inbox attachment retry controls + per-tenant fairness
- **User value:** a failed attachment can be retried from the UI, and one tenant's backfill can't starve the others.
- **Evidence:** parking lot, "attachment retry has no operator controls". `MAX_ATTEMPTS = 2` counts transient failures, and `BATCH_SIZE = 20` is a global limit.
- **Effort:** 1 · **Migration:** no · **Keys:** no
- **Risk:** none (Gmail reads only).
- **Acceptance:** the board can retry from the thread view; attempts reset; batches are picked round-robin per org; covered by unit tests.

### BL-018 — Mailbox reconnect skips a completed backfill
- **User value:** reconnecting Gmail doesn't reset the counter and re-import 12 months.
- **Evidence:** parking lot, "reconnect re-runs the full historical backfill".
- **Effort:** 0.5 · **Migration:** no · **Keys:** no
- **Risk:** must not break recovery of a wedged backfill.
- **Acceptance:**
  - Skip the backfill when `backfill_status = 'complete'` and the scope is unchanged.
  - Tests cover complete, failed and wedged.

### BL-021 — AI bill scan → AP bill proposal
- **User value:** the treasurer forwards an invoice PDF and gets a coded bill to approve, instead of typing it in.
- **Evidence:** Buildium AI Bill Scan, CINC Payables+, Vantaca HOAi AP (research §2.1). PayHOA's weak payables (§2.2).
- **Effort:** 2.5
- **Migration:** no. A new `action_type` on `approval_requests` (text column).
- **Keys:** no. The existing Groq vision config (memory: vendor request composer) is reused.
- **Risk:**
  - **Money.** It only proposes; the bill is created when the board approves.
  - Watch vision cost limits.
- **Acceptance:**
  - An upload on `/accounting/invoices/new` or an inbox attachment yields a proposal: vendor match, amount, due date, GL account suggestion with reasoning.
  - Approving it creates the bill through the existing `invoices.ts`.
  - The eval set has 10 fixture invoices.

### BL-022 — ⌘K searches records, not just pages
- **User value:** "Kaur" in ⌘K goes straight to the owner, unit, violation or email thread.
- **Evidence:** Vantaca's "hard to find older messages" complaint (research §2.1). The ⌘K palette exists (design system v2).
- **Effort:** 2 · **Migration:** no (uses `ilike` first; a trigram index can come later in a batch).
- **Keys:** no
- **Risk:** PII. Results are RLS-scoped; a resident never sees board results.
- **Acceptance:**
  - Debounced server search across owners, units, violations, ARC, tickets and inbox threads.
  - Grouped results, keyboard navigable, under 500ms p50 on the seeded org.

### BL-023 — Polls and surveys, non-binding (migration batch M2)
- **User value:** the board can ask residents a question and get a tally without Google Forms.
- **Evidence:** PayHOA, HOA Start, Buildium, CINC, Vantaca and Condo Control all have voting or surveys (research §3).
- **Override:** the parking lot excludes "resident social features (forums, polls)" from v1. **The owner has to lift polls out of that item.**
- **Effort:** 3 · **Migration:** **yes** · **Keys:** no
- **Risk:**
  - Must be clearly labelled *non-binding*, because binding elections have state rules (CA AB 2159).
  - Announcing a poll is an outbound email (BL-004).
- **Acceptance:**
  - The board creates a poll (single or multi choice, close date, one vote per unit).
  - Residents vote in the portal.
  - Results show only after close (or live, if the board chooses).
  - Results export to CSV.
  - An integration test enforces one vote per unit.

### BL-024 — Resident ARC pre-check against guidelines
- **User value:** a resident learns before submitting that the fence height or paint colour conflicts with the guidelines, so applications arrive complete.
- **Evidence:** Vantaca's "AI-guided submission" (research §2.1, §4c.4). W1 already answers with citations.
- **Effort:** 2 · **Migration:** no · **Keys:** no
- **Risk:**
  - The AI must never approve or deny; it is advisory only.
  - Cite the source; when unsure, say "the board decides".
- **Acceptance:**
  - `/resident/arc/new` gains a "Check against our rules" step that shows relevant cited sections and possible conflicts.
  - The resident can submit anyway.
  - The board sees the pre-check on `/arc/[id]`.

### BL-025 — Bilingual (EN/ES) communications
- **User value:** Spanish-speaking residents can read announcements. It also makes the existing "Multilingual comms" claim true.
- **Evidence:** "Write with Lumina" EN/ES/FR (research §2.1). Our pricing page claim (BL-002).
- **Effort:** 2
- **Migration:** no. The translation is stored in the communication body.
- **Keys:** no
- **Risk:**
  - Outbound (BL-004).
  - Translation quality: the board reviews the Spanish text before sending.
- **Acceptance:**
  - The communications wizard offers "Add Spanish version" using W31.
  - The email renders both languages, or per-resident language if a preference exists.
  - The board must view the translation before sending.

### BL-026 — SMS to residents in production, with consent (migration batch M2)
- **User value:** urgent notices (water shutoff, gate broken) reach residents who don't read email.
- **Evidence:**
  - PayHOA, HOA Start and HOA Express all send texts (research §3).
  - `lib/sms.ts` exists; Twilio/Vonage was parked for cost (ADR-004).
- **Effort:** 2 · **Migration:** **yes** (SMS consent/opt-out, STOP handling).
- **Keys:** **yes.** A Vonage or Telnyx number plus 10DLC registration.
- **Risk:**
  - **Outbound SMS** (BL-004).
  - TCPA/10DLC compliance.
  - Messages must be ≤279 characters, split if longer (memory).
- **Acceptance:**
  - Opt-in is captured, and STOP is honoured automatically.
  - The board sends an SMS channel from the wizard with a character counter.
  - Sandbox orgs never send.
  - Unit tests cover the split and STOP.

### BL-027 — Board-side AI ARC review → approval layer
- **User value:** the ARC committee gets a cited recommendation with a draft approval or denial letter, ready to approve.
- **Evidence:** Vantaca's AI ARC review, which writes letters with reasons (research §2.3). No self-managed competitor has it.
- **Effort:** 3
- **Migration:** no (new `action_type`).
- **Keys:** no (vision through the existing Groq config).
- **Risk:**
  - The decision is a legal act by the board.
  - The AI drafts only; letters go out only when the board sends them.
- **Acceptance:**
  - On submission, a proposal is created with the cited guideline sections, findings from the photos, a recommendation, and a letter draft.
  - It appears in BL-014's inbox.
  - The eval set has 8 fixtures.

### BL-028 — Mobile inspection mode
- **User value:** a board member walking the neighbourhood logs violations from the phone camera in seconds, even with a weak signal.
- **Evidence:** Enumerate FieldOps, the AppFolio mobile violations app, and Smartwebs (research §2). HomeHerald drafts violations from photos.
- **Effort:** 3 · **Migration:** no · **Keys:** no
- **Risk:** photos of homes are PII-adjacent; they are org-scoped storage (0055).
- **Acceptance:**
  - A camera-first flow in the PWA: photo, then address autocomplete, then rule picked from W3's suggestions.
  - Queued offline and synced when back online.
  - Feeds the existing W3 approval queue.
  - Layout checked with `pnpm ui:shots` at 375px.

### BL-029 — Budget first draft from prior year + actuals
- **User value:** the treasurer starts next year's budget from a draft with reasons for each line, not a blank sheet.
- **Evidence:** Enumerate SmartBudget and CINC Cephai budgets (research §2.1).
- **Effort:** 2 · **Migration:** no · **Keys:** no
- **Risk:** a draft only; the board edits and adopts it.
- **Acceptance:**
  - `/accounting/budget/new` offers a "Draft from last year" option.
  - Each line shows prior budget, actuals year-to-date projected, a suggested amount, and a one-line rationale.
  - Nothing saves until the board confirms.

### BL-030 — Per-state violation procedure engine, FL first (migration batch M2)
- **User value:** the full enforcement lifecycle — notice, hearing scheduled, committee decision, fine, cure — is tracked and enforced by state law.
- **Evidence:** research §4b.1 and §5.3. This is the main differentiator. It builds on BL-019.
- **Effort:** 4
- **Migration:** **yes**. A hearing and steps model on violations.
- **Keys:** no
- **Risk:** legal. Steps are encoded from verbatim FL §720.305 text, and every outbound letter stays behind approval.
- **Acceptance:**
  - Violations get a state-driven step timeline. The product blocks a fine before a hearing, warns before deadlines (14-day notice, 90-day hearing window, 7-day decision notice), and records the committee decision.
  - A per-state rules module has full unit coverage.
  - Shipped for FL; CA follows.

### BL-031 — CINC import (homeowner list + aging report)
- **User value:** a community leaving a CINC-run management company moves its owners and balances over in minutes, not through hand-written SQL.
- **Evidence:**
  - Madison Park's data came from CINC aging PDFs through hand-written seeds.
  - CINC exports Excel from the Homeowners list and from Custom Reports (research §2.1).
- **Effort:** 3 · **Migration:** no (existing tables) · **Keys:** no
- **Blocked on:** **a real CINC export file from Asaf.** The column layout is unknown, hence the 0.6 confidence.
- **Risk:**
  - Resident PII and opening balances (money).
  - A dry run shows counts and ids only.
  - The opening-balance journal entry goes through the approval layer.
- **Acceptance:**
  - `admin/import-units` accepts CINC xlsx/csv, maps columns, and dry-runs a diff (create/update counts, ids).
  - On commit it writes units, owners and opening balances, with the opening-balance JE proposed for approval.
  - Re-importing the same file is a no-op.

### BL-035 — Stripe ACH/card resident payments (override: Next)
- **User value:** residents pay by bank or card, with automatic posting through the approval or confirmation path.
- **Evidence:** table stakes (research §4a.1); ADR-005 rails.
- **Effort:** 6
- **Migration:** **yes (M3; pull forward if this item starts earlier).**
- **Keys:** **yes.** Stripe Connect (per-association connected accounts; the parking lot says to switch to Connect when the first CAM signs).
- **Risk:**
  - **Money:** webhooks must be idempotent, and refunds and disputes must be handled.
  - **Fees:** decide who pays the card fee (ADR-005 says the resident).
  - Test only in Stripe test mode with seeded orgs.
- **Acceptance:**
  - Stripe Checkout from the BL-006 Pay sheet.
  - The webhook creates a `payments` row exactly once (unique on the Stripe id).
  - The assessment status updates, the GL entry posts, and the resident receipt follows BL-004 rules.
  - Integration tests replay webhooks twice.

---

## Later

### BL-032 — Mailed letters from the app
- **User value:** violation and collection letters reach owners who ignore email, with proof of mailing.
- **Evidence:** PayHOA ($1.05–1.25 a letter), HOA Express and HomeHerald (research §2.2).
- **Effort:** 3 · **Migration:** yes (send log) · **Keys:** **yes** (Lob/PostGrid)
- **Risk:** outbound physical mail, which can't be recalled. It must go through approval and BL-004 (sandbox uses the provider's test mode).
- **Acceptance:** an approved letter from the W3 or collections flow is sent through the provider; tracking is stored; the cost is shown before sending.

### BL-033 — Law-to-bylaw *findings* report (F phase 1, FL)
- **User value:** when Florida law changes, the board learns which of its bylaws are affected.
- **Evidence:** F spec §2.3; HeyNeighbor's "document audit" (research §2.3).
- **Effort:** 4 · **Migration:** yes · **Keys:** no
- **Risk:** legal. Findings are informational only, and every quote is validated.
- **Acceptance:** a `law/statute.changed` event produces per-association findings, which show on `/legal` with verbatim quotes from both sources.

### BL-034 — Amenity booking
- **User value:** residents reserve the clubhouse or pool pavilion without emailing the board.
- **Evidence:** HOA Start, Buildium, Vantaca, Enumerate, Condo Control and HomeHerald (research §3).
- **Effort:** 4 · **Migration:** yes · **Keys:** no
- **Risk:** deposits and fees are money (defer fees until BL-035).
- **Acceptance:** the board defines amenities, rules and approval mode; residents book through a calendar; there's a conflict check; the board approves.

### BL-036 — Autopay
- **User value:** residents set it and forget it, and delinquency drops.
- **Evidence:** PayHOA, Buildium, Vantaca, GnomeOwner (research §3).
- **Effort:** 3 · **Migration:** yes · **Keys:** yes (after BL-035)
- **Risk:** **money.** Failed debits, notification rules, and authorization records (NACHA).
- **Acceptance:** the resident enrolls with a mandate; charges run on the due date; failures notify both resident and board; covered by integration tests in Stripe test mode.

### BL-037 — Reserve fund tracking
- **User value:** the board sees percent funded and planned contributions per component.
- **Evidence:** PayHOA lacks reserve accounting (research §2.2); Condo Control summarizes reserve studies with AI. W9 is parked.
- **Effort:** 4 · **Migration:** yes · **Keys:** no
- **Risk:** no external benchmark data (parking lot, W9).
- **Acceptance:** the board enters components (life, cost, remaining life); the product computes percent funded and a 30-year schedule; the reserve GL accounts are linked.

### BL-038 — Public HOA website + Notices page
- **User value:** prospective buyers and owners find the HOA online. FL associations get the conspicuous Notices page the statute names.
- **Evidence:** PayHOA and HOA Express include a website; FL §720.303(4) (research §2.4).
- **Effort:** 4 · **Migration:** yes · **Keys:** no (subdomain); a custom domain needs DNS
- **Risk:** public exposure. Only content the board explicitly marks as public is shown.
- **Acceptance:** a public page per org with about, contacts, public documents, and notices; meeting notices are posted automatically from `/meetings` at least 14 days ahead.

### BL-039 — Electronic vendor payments
- **User value:** the board pays vendors by ACH from an approved bill.
- **Evidence:** PayHOA's "can't pay vendors by ACH" complaint; CINC/AvidXchange (research §2).
- **Effort:** 6 · **Migration:** yes · **Keys:** yes
- **Risk:** **money out.** Requires dual approval.
- **Acceptance:** an approved bill is paid through the provider after two board approvals; it is reconciled by W18.

### BL-040 — Native app shell (store listing)
- **User value:** residents find "the HOA app" in the App Store.
- **Evidence:** every mid-market competitor has a native app (research §3). The parking lot keeps the PWA until residents complain about installing it.
- **Effort:** 5 · **Migration:** no · **Keys:** yes (Apple/Google developer accounts)
- **Risk:** the revisit trigger from the parking lot applies. Don't start without resident complaints.
- **Acceptance:** a Capacitor wrapper of `/resident` with push through APNs/FCM, published to TestFlight.

---

## UI/UX items, by theme

These go beyond the design-system v2 pass:

- **Resident home built around "what do I owe, what's next":** BL-006, BL-010
- **Approvals as the board's home for AI work:** BL-014
- **First-run and empty-state guidance:** BL-008, BL-012
- **Find anything:** BL-022
- **Field workflows on phones:** BL-028
- **Print-quality outputs:** BL-010 statements, BL-016 board packet
- **AI guidance at intake:** BL-024

## Added 2026-10-15 (cycle 1)

- **BL-041 Implement the recommended pricing** (docs/decisions/2026-10-pricing.md):
  $1.00/door, $59/mo floor, optional AI add-on $0.50/door ($25 min), 10% off
  annual; grandfather Madison Park. Owner pre-approved recommendations
  2026-10-15. **Sequencing:** ship only after BL-006 (Pay-by-Zelle) is live, per
  the decision doc. Needs new Stripe prices (owner's Stripe dashboard, or
  Stripe API key in Vercel prod) — flag when BL-006 lands. Also fixes: homepage
  teaser still shows flat $39/$79/$149 tiers contradicting /pricing; the
  "$200 minimum" is actually $204.59 (41-door rounding).
- **BL-042 Marketing truth pass, round 2** (low priority, HOA-relevant pages
  only): /hoa, /compare, Madison Park case study, workflows grid still name
  Reserve Live / Minutes Engine. Out of HOA-app scope except where they sell the
  HOA product.
- **BL-043 Association-timezone "today"** (found by the c2 date fix): `todayIso()`,
  `resident-dashboard.ts` and the ledger's `paid_at.slice(0, 10)` use the UTC day,
  so after ~8pm Eastern charges read "due today" a day early and late-evening
  payments post to the next day. Dashboard overdue math (`dashboard/queries.ts`,
  `charts.ts`, `community-qa/tools.ts`) parses date-only columns as UTC midnight.
  `bank-rec.ts:164` stores `paid_at` from a date-only value — needs a decision.
  Fix: one association timezone (default America/New_York) and date-only helpers.
- **BL-044 Dues-reminder follow-ups** (from c2): a per-association timezone (with BL-043);
  the populated dry-run table has never been seen with real data; a message where every
  recipient was blocked by the guard is marked `failed`; the 600px email preview scrolls
  sideways at 375px (as on /dues).
- **BL-045 Unify CSV escaping — Done (c7):** the four legacy export routes (properties, violations,
  leases, vendors) should use `apps/hoa/src/lib/csv.ts`, which has a formula-injection guard.
- **BL-046 Setup gaps found by BL-012 — Done (c7):** /dues with no association links to a checklist
  that can't create one; `AccountingNotSetUp` has no action.
- **BL-047 1000-row cap on totals (bug, high) — Done (c4)** (found by BL-016): `.range(0, 49_999)` reads
  are silently capped at 1000 rows by Supabase `max_rows`, so the `/dues` headline,
  `lib/dashboard/queries.ts:501` and one read in `accounting/queries.ts` undercount large
  associations. Fix: use `lib/supabase/read-all.ts`. No migration.
- **BL-048 Approvals inbox follow-ups — Done (c5)** (from BL-014): a W3 approve/reject action so letters
  are one click from `/approvals`; a vendor reject action; per-association vendor badge
  count for multi-association orgs.
- **BL-049 Residents see association documents — Done (c4)** (from BL-015): FL §720.303(4) requires
  posting records in an owners-only area; the resident portal lists none today. No migration.
- **BL-050 `notice_posted_at` on meetings (migration, batch M1)** (from BL-015): record when a
  meeting notice was posted so the 14-day/48-hour check can confirm compliance, not just
  flag late additions.
- **BL-051 Board packet follow-ups** (from BL-016): budget vs actual cut off at the end of
  the packet month; delinquency as of the end of the month; a real Safari PDF check.
- **BL-052 Document visibility enforced by the database (migration, batch M1, security)** (from BL-049):
  residents can still read every `hoa_documents`/`governing_documents` row of their org and sign any
  object under their org's `hoa-documents` prefix (including `<org>/vendors/…`), because 0063 kept
  member reads. Add a board-set `visible_to_owners` column, gate resident SELECT and storage reads on
  it, and let budgets, insurance and contracts filed as "other" be posted to owners.
- **BL-053 Remaining row caps — Done (c5)** (from BL-047): CSV exports (properties, violations, leases) stop at
  1000 rows; invoice detail can miss its payment entry (`accounting/queries.ts:1044`); payment-plans
  list filtered by a capped unit list; platform-admin metrics; recurring-events cron worklist
  `.limit(1000)`; delete the unused `getDashboardStats`.
- **BL-054 Verify CA violation rules against official text** (from BL-019): leginfo blocked fetches;
  §5850/§5855/AB 130 rules come from secondary sources. CA letters say "verify" and quote nothing
  until this is done (needs a CA ingestion adapter).

## Added 2026-10-16 (cycle 5)

- **BL-055 Route-conventions round 4 — Done (c6) except webhooks/stripe (M1).** Four rejected route fixes are still open: ai/ask-community (raw tool errors reach the model, and raw rows are returned), plaid/exchange (the write order can't be undone if a write fails), webhooks/resend (reply linking relies on Resend's API id, not the SMTP Message-ID), and webhooks/stripe (its 0064 can drop a paying org to the free plan when it switches subscriptions; this one needs a migration, so it joins batch M1). The routes-fix/*-r2 branches hold the earlier attempts.
- **BL-056 Invitation pages and server actions follow-ups (from round 3):**
  - The rfp-bid and vendor-onboard pages now show Next's error page when the database fails. They should show a branded "try again".
  - `inviteVendorsToRfp`, `revokeRfpInvitation` and `listInvitations` still return or log raw `.message`.
  - `lib/events-alerts.ts` ignores errors on some of its writes and stores provider error text.
  - An event that never delivers now retries every day and adds a failed communications row each time. Add a retry cap.
- **BL-057 Approvals follow-ups (from BL-048):**
  - Add buttons to /violations/approval-queue using the new actions.
  - Give `approveVendor` its own role gate.
  - Make `getAnalyticsData` use count queries; it currently loads every unit and member row, up to the 200k cap.

## Added 2026-10-16 (cycle 6)

- **BL-058 Stored bills readable by residents (security, M1 with F-02):** uploaded bills sit in `hoa-documents` under `${orgId}/bills/`, which any org member can read by path. Vendor documents have the same problem. Move them to a board-only bucket or path policy as part of the M1 storage policies.
- **BL-059 Bill scan follow-ups:**
  - Let the board edit extracted fields before approving.
  - Accept inbox attachments as a second way in.
  - Run one real bill through the text and vision paths (not done yet; only a fake model has been tested).
  - Find out why `/approvals?type=bill` showed the All view in the screenshot.
- **BL-060 ⌘K follow-ups:**
  - ~~Violations on the same lot look identical, so add the date and status to each row.~~ Done: every violation, ARC, ticket and inbox row carries a right-aligned status · day (association day, BL-043) that stays visible when the label truncates; ARC/tickets/threads also show the lot's address.
  - ~~Add documents and meetings.~~ Done: uploaded + current governing documents (one "Documents" group) and meetings (type/summary), board-only through `/api/search`, RLS client, 5 per type.
  - ~~Fix inbox links that use `/properties/${unitId}`.~~ Confirmed bug (404): PropertyRail now links `PropertyContext.propertyId` (`units.legacy_hoa_property_id`), and shows the address unlinked when a unit has no property record. Search already used the hoa_properties id.
  - Left: match on inbox participants (needs a migration or RPC over message addresses).
  - Left: measure p50 latency.
- **BL-061 Confirm Resend keeps our Message-ID:** send one real communication and check that the reply's In-Reply-To carries `<hoh-cr.…>`. If Resend overwrites it, add `smtp_message_id` (migration). Inbound replies also need Resend receiving and an `email.received` webhook set up for the EMAIL_FROM domain (dashboard/DNS, owner).
- **BL-062 Owner contact sent to the AI provider:** ask-community sends owner email and phone to Groq on a board lookup. Consider redacting them, or sending them only when the question asks for contact details.

