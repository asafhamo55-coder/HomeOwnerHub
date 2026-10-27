# HOA Hub product backlog (ranked)

**Date:** 2026-10-15 · **Source:** `docs/research/2026-10-competitors.md`. Every "evidence" line below points into that document (§ numbers) or into the code.

## Priorities (re-ranked 2026-10-17, owner-delegated)

The owner delegated all prioritisation. This order overrides the score-based buckets below wherever they disagree. The reason is in each bracket.

> **Groomed 2026-10-20:** all 12 "Now" items below have shipped: P0 653df38e, P1 d1e21437, BL-070 6336b902/cccba425, P2 dc2360f8/ab74dd85, P4 e1014c46, P3 bdfbb47d/f9c78ace, BL-042 b045755c, BL-024/027 be36dbfd, BL-029 83dd219d, BL-028 4b878315, BL-017 ee42b75b / BL-018 dc5e9fec, BL-054 (2026-10-19). Of "Next, after the above": BL-025 and properties P5 (statutory roster 72f0b92d, records copy 173f4727, owner contact self-service 08def940, estoppel 2841858d) are done too. **Pick work from "Ranked open work (groomed 2026-10-20)" at the bottom of this file**, not from this list.

**Now (no migration; ship one per cycle, deploying hourly at most)**
1. **Properties P0:** one record. The create, edit, delete and import paths write both sides. [Biggest correctness bug: homes added in-app can't be billed.]
2. **Properties P1:** quick wins: search covers every home, links, contact actions, export, mobile. [The owner's top complaint.]
3. **BL-070 User guide, phase 1:** a /help centre, contextual "?" help, "Ask the guide" grounded in the articles. [Onboarding and sales; makes the product self-serve.]
4. **Properties P2:** a full-width table and a real property 360 page with an action bar.
5. **Properties P4:** a roster import the board runs itself, with mapping, dry run and a CINC preset. Absorbs BL-031. [The onboarding gate; makes "15 min onboarding" true.]
6. **Properties P3:** record a sale. Close the old ownership and revoke the seller's access. [Privacy defect today.]
7. **BL-042:** marketing truth pass, round 2. Covers the claims listed in docs/research/2026-10-properties-plan.md.
8. **BL-024 + BL-027:** ARC pre-check for residents and the board AI review. [High value, no migration.]
9. **BL-029:** budget first draft from last year's numbers and actuals.
10. **BL-028:** mobile inspection mode.
11. **BL-017 / BL-018:** inbox reliability follow-ups.
12. **BL-054:** check the CA rules against official text. [Needed before BL-069 adds CA.]

**Migration batches (Asaf pastes SQL; each batch only after the previous one is applied)**
- **0063 (pending):** the RLS sweep.
- **M1:** BL-020 consent, BL-050 notice_posted_at, BL-052 document visibility, BL-058 board-only bill storage, BL-063 alert attempts, and the Stripe 0064 fix.
- **M-P1 / M-P2:** properties expand, then backfill: people, unit_people, mailing address, consents, custom fields.
- **M2:**
  - BL-068 module switches (entitlements for the two plans). **Prices superseded 2026-10-20** by `docs/decisions/2026-10-20-pricing.md` (Essentials/Complete in flat size bands; implementation BL-104). Existing subscriptions keep their price until renewal.
  - BL-069 state-law run log. Also needs Open States/LegiScan keys.
  - BL-023 polls.
  - BL-030 FL violation procedure engine.
  - P5 records-request roster copy (shipped 2026-10-20, no migration): /properties/roster `kind=records`. **Migration needed** for CA Civ. Code § 5220 opt-outs (e.g. `ownerships.records_sharing_opt_out boolean null`, plus the same on `hoa_properties` for record-owner homes). Until then `SHARING_OPT_OUT_STORED = false`: no email is released in any state and CA boards are told to check written opt-outs by hand. TX § 209.005 and GA records-access text still need fixtures before email can be considered there.

**Next, after the above:** BL-035 Stripe ACH/card resident payments (needs Stripe keys and M3); BL-025 bilingual (needs the M-P1 language field); BL-026 SMS with consent; properties P5 (statutory roster and voter list, owner self-service contact details, estoppel); BL-036 autopay; BL-037 reserves; BL-038 public site; BL-034 amenities; BL-032 mailed letters; BL-039 vendor payments; BL-040 native app.

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
| 1 | BL-001 | Pricing scenarios for the self-managed segment (owner decision) | 5 | 0.6 | 0.5 | **6.00** | no | no | **Done (337456a3)** |
| 2 | BL-002 | Marketing truth pass: claims match shipped features | 3 | 1.0 | 0.5 | **6.00** | no | no | **Done (f8287179)** |
| 3 | BL-003 | Daily digest tells the board when the mailbox is broken | 3 | 0.9 | 0.5 | **5.40** | no | no | **Done (470cd652)** |
| 4 | BL-004 | Outbound safety guard (recipient allowlist / sink outside prod) | 4 | 0.9 | 1 | **3.60** | no | no | **Done (e288f35b)** |
| 5 | BL-005 | Inbox shows backfill progress / failure | 2 | 0.9 | 0.5 | **3.60** | no | no | **Done (efa55e20)** |
| 6 | BL-006 | Resident "Pay" screen with Pay-by-Zelle memo code | 5 | 0.9 | 1.5 | **3.00** | no | no | **Done (f9ecf40f)** |
| 7 | BL-007 | Close `ownerships`/`units` RLS hole | 4 | 0.9 | 1.5 | **2.40** | **yes (M1)** | no | Open (0063) |
| 8 | BL-008 | First-run setup checklist on the board dashboard | 3 | 0.8 | 1 | **2.40** | no | no | **Done (817cbc68)** |
| 9 | BL-009 | Privacy-safe product analytics | 3 | 0.8 | 1 | **2.40** | no | **yes** | **Partly (bdfa759f)** |
| 10 | BL-010 | Resident ledger and printable statement | 3 | 0.9 | 1.5 | **1.80** | no | no | **Done (f9ecf40f)** |
| 11 | BL-011 | Full data export (zip of CSVs) | 3 | 0.9 | 1.5 | **1.80** | no | no | **Done (c2)** |
| 12 | BL-012 | Empty states carry the next action | 2 | 0.9 | 1 | **1.80** | no | no | **Done (c2)** |
| 13 | BL-013 | Automated dues reminders (behind BL-004) | 4 | 0.8 | 2 | **1.60** | no | no | **Done (c2)** |
| 14 | BL-014 | One approvals inbox across AI workflows | 4 | 0.8 | 2 | **1.60** | no | no | **Done (c3)** |
| 15 | BL-015 | FL §720.303 records and notices compliance check | 4 | 0.8 | 2 | **1.60** | no | no | **Done (c3)** |
| 16 | BL-016 | Monthly board packet | 4 | 0.8 | 2 | **1.60** | no | no | **Done (c3)** |
| 17 | BL-017 | Inbox attachment retry controls + per-tenant fairness | 2 | 0.8 | 1 | **1.60** | no | no | **Done (ee42b75b)** |
| 18 | BL-018 | Mailbox reconnect skips a completed backfill | 1 | 0.8 | 0.5 | **1.60** | no | no | **Done (dc5e9fec)** |
| 19 | BL-019 | Statute-aware violation letters (W3 + W30) | 4 | 0.7 | 2 | **1.40** | no | no | **Done (c4)** |
| 20 | BL-020 | Per-member email consent (CA §4040) | 3 | 0.7 | 1.5 | **1.40** | **yes (M1)** | no | Open (M1) |
| 21 | BL-021 | AI bill scan → AP bill proposal | 4 | 0.8 | 2.5 | **1.28** | no | no | **Done (c6)** |
| 22 | BL-022 | ⌘K searches records, not just pages | 3 | 0.8 | 2 | **1.20** | no | no | **Done (c6)** |
| 23 | BL-023 | Polls and surveys (non-binding) | 4 | 0.8 | 3 | **1.07** | **yes (M2)** | no | Open (M2) |
| 24 | BL-024 | Resident ARC pre-check against guidelines (W1) | 3 | 0.7 | 2 | **1.05** | no | no | **Done (be36dbfd)** |
| 25 | BL-025 | Bilingual (EN/ES) communications | 3 | 0.7 | 2 | **1.05** | no | no | **Done (2026-10-19)** |
| 26 | BL-026 | SMS to residents in production, with consent | 3 | 0.7 | 2 | **1.05** | **yes (M2)** | **yes** | Open (M2) |
| 27 | BL-027 | Board-side AI ARC review → approval layer | 4 | 0.7 | 3 | **0.93** | no | no | **Done (be36dbfd)** |
| 28 | BL-028 | Mobile inspection mode (drive-by capture) | 4 | 0.7 | 3 | **0.93** | no | no | **Done (4b878315)** |
| 29 | BL-029 | Budget first draft from prior year + actuals | 3 | 0.6 | 2 | **0.90** | no | no | **Done (83dd219d)** |
| 30 | BL-030 | Per-state violation procedure engine (FL first) | 5 | 0.7 | 4 | **0.88** | **yes (M2)** | no | Open (M2) |
| 31 | BL-031 | CINC import (homeowner list + aging report) | 4 | 0.6 | 3 | **0.80** | no | no | **Built, no migration (homeowner list e1014c46; aging report 2026-10-21); verify on a real CINC export** |
| 32 | BL-032 | Mailed letters from the app (violation/collections) | 3 | 0.7 | 3 | **0.70** | yes (M3) | **yes** | Later (M3) |
| 33 | BL-033 | Law-to-bylaw *findings* report (F phase 1, FL) | 4 | 0.6 | 4 | **0.60** | yes (M3) | no | Later (M3) |
| 34 | BL-034 | Amenity booking | 3 | 0.8 | 4 | **0.60** | yes (M3) | no | Later (M3) |
| 35 | BL-035 | Stripe ACH/card resident payments | 5 | 0.7 | 6 | **0.58** | yes (M3) | **yes** | Next (override; M3 + keys) |
| 36 | BL-036 | Autopay | 3 | 0.6 | 3 | **0.60** | yes (M3) | **yes** | Later (M3) |
| 37 | BL-037 | Reserve fund tracking | 3 | 0.6 | 4 | **0.45** | yes (M3) | no | Later (M3) |
| 38 | BL-038 | Public HOA website + Notices page | 3 | 0.6 | 4 | **0.45** | yes (M3) | no | Later (M3) |
| 39 | BL-039 | Electronic vendor payments | 3 | 0.5 | 6 | **0.25** | yes | **yes** | Later (unbatched migration + keys) |
| 40 | BL-040 | Native app shell (store listing) | 2 | 0.5 | 5 | **0.20** | no | **yes** | Later (keys) |

**Now:** about 24 agent-days.

**Overrides:**
- BL-035 is promoted to Next despite its score. Resident card/ACH payment is table stakes (§4a.1), and its effort is high only because the money path must be done carefully. The owner should open the Stripe account work now so it isn't the blocker.
- BL-017 and BL-018 are demoted to Next despite their scores. They are cheap, but they matter only when a second mailbox connects.

---

## Now (next 2 cycles)

### BL-001 — Pricing scenarios for the self-managed segment
- **Groomed 2026-10-20:** Done: scenarios 337456a3, superseded by the 2026-10-20 decision c8490abf; implementation is BL-104.
- **Status (2026-10-20):** refreshed and decided: `docs/research/2026-10-pricing-analysis.md` → `docs/decisions/2026-10-20-pricing.md`. Implementation is BL-104.
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
- **Groomed 2026-10-20:** Done (f8287179); later rounds b045755c, fefdad6b.
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
- **Groomed 2026-10-20:** Done (470cd652).
- **User value:** a board that hasn't logged in for a week learns that its mail stopped syncing.
- **Evidence:** in the parking lot, "broken mailbox never reaches a board that isn't logged in". `dailyDigestJob` computes the condition and only logs it.
- **Effort:** 0.5 · **Migration:** no · **Keys:** no
- **Risk:** outbound email to **board members only**. It goes through BL-004's guard once that lands; until then, test only with unit tests and a mocked sender.
- **Acceptance:**
  - The digest includes a "Mailbox disconnected since <date> — reconnect" block with a link to `/settings/mailbox` whenever the condition is true.
  - A unit test covers both the present and the absent case.
  - No resident is ever a recipient (asserted in a test).

### BL-004 — Outbound safety guard
- **Groomed 2026-10-20:** Done (e288f35b).
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
- **Groomed 2026-10-20:** Done (efa55e20).
- **User value:** during a 12-month import the board knows that history is still arriving.
- **Evidence:** parking lot, "backfill progress is invisible on `/inbox`". The state is already stored (`backfill_status`, `backfill_progress`).
- **Effort:** 0.5 · **Migration:** no · **Keys:** no
- **Risk:** none.
- **Acceptance:**
  - A banner on `/inbox` shows "Importing history — N of ~M" while running, and "Import failed — retry from Settings" on failure.
  - The banner is hidden when complete.
  - It follows the design-system v2 `Alert` and is truthful when the status read itself fails.

### BL-006 — Resident "Pay" screen with Pay-by-Zelle memo code
- **Groomed 2026-10-20:** Done (f9ecf40f).
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
  - **Status:** Done: shipped behind M1_APPLIED; M1 applied in prod and the flag on since 2026-10-20.
- **Groomed 2026-10-20:** Open, needs migration 0063: the policy split is written (c7fa7e23, RLS sweep) and waits for Asaf to apply 0063.
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
- **Groomed 2026-10-20:** Done (817cbc68).
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
- **Groomed 2026-10-20:** Partly done: only the help-centre event beacon exists (bdfa759f, `/api/help/event` with an allowlist). No page-view or product events, no analytics library. Remaining: wire Vercel Web Analytics (owner enables it on the project) and the 8 named events through the same allowlist pattern. No migration.
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
- **Groomed 2026-10-20:** Done (f9ecf40f).
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
  - **Status:** Done: shipped behind M1_APPLIED; M1 applied in prod and the flag on since 2026-10-20.
- **Groomed 2026-10-20:** Open, needs migration M1: code is built behind `M1_APPLIED` (431ac157 UI, 65a47f5d send path).
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
- **Groomed 2026-10-20:** Done (ee42b75b).
- **User value:** a failed attachment can be retried from the UI, and one tenant's backfill can't starve the others.
- **Evidence:** parking lot, "attachment retry has no operator controls". `MAX_ATTEMPTS = 2` counts transient failures, and `BATCH_SIZE = 20` is a global limit.
- **Effort:** 1 · **Migration:** no · **Keys:** no
- **Risk:** none (Gmail reads only).
- **Acceptance:** the board can retry from the thread view; attempts reset; batches are picked round-robin per org; covered by unit tests.

### BL-018 — Mailbox reconnect skips a completed backfill
- **Groomed 2026-10-20:** Done (dc5e9fec).
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
- **Groomed 2026-10-20:** Open, needs migration M2. The owner still has to lift polls out of the parking-lot exclusion.
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
- **Groomed 2026-10-20:** Done (133eec80 W37, be36dbfd UI).
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
- **Groomed 2026-10-20:** Open, needs migration M2 (SMS consent, same columns as communications plan B3) and Vonage/10DLC keys.
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
- **Groomed 2026-10-20:** Done (133eec80 W37, be36dbfd UI; photos and letters in BL-079).
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
- **Groomed 2026-10-20:** Done (4b878315); /inspect Idempotency-Key 9830f49d; shared-cap test c577ada9.
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
- **Groomed 2026-10-20:** Done (83dd219d).
- **User value:** the treasurer starts next year's budget from a draft with reasons for each line, not a blank sheet.
- **Evidence:** Enumerate SmartBudget and CINC Cephai budgets (research §2.1).
- **Effort:** 2 · **Migration:** no · **Keys:** no
- **Risk:** a draft only; the board edits and adopts it.
- **Acceptance:**
  - `/accounting/budget/new` offers a "Draft from last year" option.
  - Each line shows prior budget, actuals year-to-date projected, a suggested amount, and a one-line rationale.
  - Nothing saves until the board confirms.

### BL-030 — Per-state violation procedure engine, FL first (migration batch M2)
- **Groomed 2026-10-20:** Open, needs migration M2.
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
- **Status 2026-10-21:** Built, no migration. The aging report remainder ships in the BL-126 wizard (/accounting/opening-balances, step 2, "Upload a CINC aging report"): a board-only server action previews the CSV (2 MB / 5,000 rows, header found under the report title, columns re-mappable, page headers and total rows skipped, cents-exact, reconciled against the report's grand total), matches each row to a home by address or by account number = unit/lot number, lists unmatched rows (download through the formula-guarded CSV writer), and hands matched balances to the wizard, which proposes ONE JE through Approvals; credits are suggested as prepaid. Audit `opening_balances.cinc_previewed` carries counts only. Fabricated fixtures only: the layout is a guess until Asaf supplies a real CINC export, so keep the 0.6 confidence. Not built: storing CINC account numbers on units (would need a migration); re-import idempotency is BL-126's one-proposal-per-date rule.
- **Groomed 2026-10-20:** Partly done: the homeowner list import with a CINC column preset shipped as properties P4 (e1014c46). Remaining: aging report / opening balances (JE via approvals), still blocked on a real CINC export file. No migration.
- **User value:** a community leaving a CINC-run management company moves its owners and balances over in minutes, not through hand-written SQL.
- **Evidence:**
  - Madison Park's data came from CINC aging PDFs through hand-written seeds.
  - CINC exports Excel from the Homeowners list and from Custom Reports (research §2.1).
- **Effort:** 3 · **Migration:** no (existing tables) · **Keys:** no
- **Blocked on:** nothing for the build; **a real CINC export file from Asaf** to confirm the column layout. The column layout is unknown, hence the 0.6 confidence.
- **Risk:**
  - Resident PII and opening balances (money).
  - A dry run shows counts and ids only.
  - The opening-balance journal entry goes through the approval layer.
- **Acceptance:**
  - `admin/import-units` accepts CINC xlsx/csv, maps columns, and dry-runs a diff (create/update counts, ids).
  - On commit it writes units, owners and opening balances, with the opening-balance JE proposed for approval.
  - Re-importing the same file is a no-op.

### BL-035 — Stripe ACH/card resident payments (override: Next)
- **Groomed 2026-10-20:** Open, needs migration M3 and Stripe Connect keys.
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
- **Groomed 2026-10-20:** Open, needs migration M3 and Lob/PostGrid keys.
- **User value:** violation and collection letters reach owners who ignore email, with proof of mailing.
- **Evidence:** PayHOA ($1.05–1.25 a letter), HOA Express and HomeHerald (research §2.2).
- **Effort:** 3 · **Migration:** yes (send log) · **Keys:** **yes** (Lob/PostGrid)
- **Risk:** outbound physical mail, which can't be recalled. It must go through approval and BL-004 (sandbox uses the provider's test mode).
- **Acceptance:** an approved letter from the W3 or collections flow is sent through the provider; tracking is stored; the cost is shown before sending.

### BL-033 — Law-to-bylaw *findings* report (F phase 1, FL)
- **Groomed 2026-10-20:** Open, needs migration M3.
- **User value:** when Florida law changes, the board learns which of its bylaws are affected.
- **Evidence:** F spec §2.3; HeyNeighbor's "document audit" (research §2.3).
- **Effort:** 4 · **Migration:** yes · **Keys:** no
- **Risk:** legal. Findings are informational only, and every quote is validated.
- **Acceptance:** a `law/statute.changed` event produces per-association findings, which show on `/legal` with verbatim quotes from both sources.

### BL-034 — Amenity booking
- **Groomed 2026-10-20:** Open, needs migration M3.
- **User value:** residents reserve the clubhouse or pool pavilion without emailing the board.
- **Evidence:** HOA Start, Buildium, Vantaca, Enumerate, Condo Control and HomeHerald (research §3).
- **Effort:** 4 · **Migration:** yes · **Keys:** no
- **Risk:** deposits and fees are money (defer fees until BL-035).
- **Acceptance:** the board defines amenities, rules and approval mode; residents book through a calendar; there's a conflict check; the board approves.

### BL-036 — Autopay
- **Groomed 2026-10-20:** Open, needs migration M3; after BL-035.
- **User value:** residents set it and forget it, and delinquency drops.
- **Evidence:** PayHOA, Buildium, Vantaca, GnomeOwner (research §3).
- **Effort:** 3 · **Migration:** yes · **Keys:** yes (after BL-035)
- **Risk:** **money.** Failed debits, notification rules, and authorization records (NACHA).
- **Acceptance:** the resident enrolls with a mandate; charges run on the due date; failures notify both resident and board; covered by integration tests in Stripe test mode.

### BL-037 — Reserve fund tracking
- **Groomed 2026-10-20:** Open, needs migration M3.
- **User value:** the board sees percent funded and planned contributions per component.
- **Evidence:** PayHOA lacks reserve accounting (research §2.2); Condo Control summarizes reserve studies with AI. W9 is parked.
- **Effort:** 4 · **Migration:** yes · **Keys:** no
- **Risk:** no external benchmark data (parking lot, W9).
- **Acceptance:** the board enters components (life, cost, remaining life); the product computes percent funded and a 30-year schedule; the reserve GL accounts are linked.

### BL-038 — Public HOA website + Notices page
- **Groomed 2026-10-20:** Open, needs migration M3.
- **User value:** prospective buyers and owners find the HOA online. FL associations get the conspicuous Notices page the statute names.
- **Evidence:** PayHOA and HOA Express include a website; FL §720.303(4) (research §2.4).
- **Effort:** 4 · **Migration:** yes · **Keys:** no (subdomain); a custom domain needs DNS
- **Risk:** public exposure. Only content the board explicitly marks as public is shown.
- **Acceptance:** a public page per org with about, contacts, public documents, and notices; meeting notices are posted automatically from `/meetings` at least 14 days ahead.

### BL-039 — Electronic vendor payments
- **Groomed 2026-10-20:** Open, needs a migration (not yet batched; M3 at the earliest) and keys.
- **User value:** the board pays vendors by ACH from an approved bill.
- **Evidence:** PayHOA's "can't pay vendors by ACH" complaint; CINC/AvidXchange (research §2).
- **Effort:** 6 · **Migration:** yes · **Keys:** yes
- **Risk:** **money out.** Requires dual approval.
- **Acceptance:** an approved bill is paid through the provider after two board approvals; it is reconciled by W18.

### BL-040 — Native app shell (store listing)
- **Groomed 2026-10-20:** Open, no migration, but needs Apple/Google developer accounts; deferred until residents complain about the PWA.
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

- **BL-041 Implement the recommended pricing** — **superseded 2026-10-20 by BL-104 / `docs/decisions/2026-10-20-pricing.md`** (docs/decisions/2026-10-pricing.md):
  - **Groomed 2026-10-20:** Obsolete: superseded by BL-104 and `docs/decisions/2026-10-20-pricing.md`.
  $1.00/door, $59/mo floor, optional AI add-on $0.50/door ($25 min), 10% off
  annual; grandfather Madison Park. Owner pre-approved recommendations
  2026-10-15. **Sequencing:** ship only after BL-006 (Pay-by-Zelle) is live, per
  the decision doc. Needs new Stripe prices (owner's Stripe dashboard, or
  Stripe API key in Vercel prod) — flag when BL-006 lands. Also fixes: homepage
  teaser still shows flat $39/$79/$149 tiers contradicting /pricing; the
  "$200 minimum" is actually $204.59 (41-door rounding).
- **BL-042 Marketing truth pass, round 2** (low priority, HOA-relevant pages
  - **Groomed 2026-10-20:** Done (b045755c round 2, 969622e9 testimonials; round 4 fefdad6b).
  only): /hoa, /compare, Madison Park case study, workflows grid still name
  Reserve Live / Minutes Engine. Out of HOA-app scope except where they sell the
  HOA product.
- **BL-043 Association-timezone "today" — Done (c7)** (found by the c2 date fix): `todayIso()`,
  `resident-dashboard.ts` and the ledger's `paid_at.slice(0, 10)` use the UTC day,
  so after ~8pm Eastern charges read "due today" a day early and late-evening
  payments post to the next day. Dashboard overdue math (`dashboard/queries.ts`,
  `charts.ts`, `community-qa/tools.ts`) parses date-only columns as UTC midnight.
  `bank-rec.ts:164` stores `paid_at` from a date-only value — needs a decision.
  Fix: one association timezone (default America/New_York) and date-only helpers.
- **BL-044 Dues-reminder follow-ups** (from c2): a per-association timezone (with BL-043);
  - **Groomed 2026-10-20:** Partly done: the per-association reminder day shipped (713fa17f). Still open, no migration: a reminder whose every recipient the outbound guard held back is still finished as `failed` (`packages/jobs/src/dues-reminders/run.ts`, `sent > 0 ? 'sent' : 'failed'`); the 600px email preview still scrolls sideways at 375px; the populated dry-run table has not been seen with real data.
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
  - **Status:** Done: shipped behind M1_APPLIED; M1 applied in prod and the flag on since 2026-10-20.
  - **Groomed 2026-10-20:** Open, needs migration M1: UI built behind `M1_APPLIED` (431ac157).
  meeting notice was posted so the 14-day/48-hour check can confirm compliance, not just
  flag late additions.
- **BL-051 Board packet follow-ups — Done except the Safari check** (from BL-016): budget vs actual cut off at the end of
  - **Groomed 2026-10-20:** Partly done (cf72c358). Remaining: the Safari print check needs a human; waived/written-off charges in month-end delinquency need a `waived_at`-style column (add it to the BL-085 batch).
  the packet month; delinquency as of the end of the month; a real Safari PDF check.
  - Still open: the Safari print/PDF check needs a human. Waived and written-off charges are
    still left out of month-end delinquency, because nothing records when they were waived.
- **BL-052 Document visibility enforced by the database (migration, batch M1, security)** (from BL-049):
  - **Status:** Done: shipped behind M1_APPLIED; M1 applied in prod and the flag on since 2026-10-20.
  - **Groomed 2026-10-20:** Open, needs migration M1: UI built behind `M1_APPLIED` (431ac157).
  residents can still read every `hoa_documents`/`governing_documents` row of their org and sign any
  object under their org's `hoa-documents` prefix (including `<org>/vendors/…`), because 0063 kept
  member reads. Add a board-set `visible_to_owners` column, gate resident SELECT and storage reads on
  it, and let budgets, insurance and contracts filed as "other" be posted to owners.
- **BL-053 Remaining row caps — Done (c5)** (from BL-047): CSV exports (properties, violations, leases) stop at
  1000 rows; invoice detail can miss its payment entry (`accounting/queries.ts:1044`); payment-plans
  list filtered by a capped unit list; platform-admin metrics; recurring-events cron worklist
  `.limit(1000)`; delete the unused `getDashboardStats`.
- **BL-054 Verify CA violation rules against official text — Done (2026-10-19)** (from BL-019): checked against
  the official Legislative Counsel text from the leginfo bulk download (the web pages are still
  Cloudflare-blocked). Corrections: § 5855(c)(2) financial commitment to cure, the § 5855(b) notice
  contents, the § 5855(f) 14-day decision notice, the § 5850(c) schedule cap, and citations. See
  docs/research/2026-10-ca-rules-verification.md. CA letters still quote nothing until BL-069 ingests the CA text.

## Added 2026-10-16 (cycle 5)

- **BL-055 Route-conventions round 4 — Done (c6) except webhooks/stripe (M1).** Four rejected route fixes are still open: ai/ask-community (raw tool errors reach the model, and raw rows are returned), plaid/exchange (the write order can't be undone if a write fails), webhooks/resend (reply linking relies on Resend's API id, not the SMTP Message-ID), and webhooks/stripe (its 0064 can drop a paying org to the free plan when it switches subscriptions; this one needs a migration, so it joins batch M1). The routes-fix/*-r2 branches hold the earlier attempts.
  - **Groomed 2026-10-20:** Partly done: ask-community, plaid/exchange and webhooks/resend fixed in c2873fc1. Only webhooks/stripe remains, needs migration M1 (Stripe 0064).
- **BL-056 Invitation pages and server actions follow-ups (from round 3): — Done (c7)**
  - The rfp-bid and vendor-onboard pages now show Next's error page when the database fails. They should show a branded "try again".
  - `inviteVendorsToRfp`, `revokeRfpInvitation` and `listInvitations` still return or log raw `.message`.
  - `lib/events-alerts.ts` ignores errors on some of its writes and stores provider error text.
  - An event that never delivers now retries every day and adds a failed communications row each time. Add a retry cap.
- **BL-057 Approvals follow-ups (from BL-048): — Done (c8)**
  - Add buttons to /violations/approval-queue using the new actions.
  - Give `approveVendor` its own role gate.
  - Make `getAnalyticsData` use count queries; it currently loads every unit and member row, up to the 200k cap.

## Added 2026-10-16 (cycle 6)

- **BL-058 Stored bills readable by residents (security, M1 with F-02):** uploaded bills sit in `hoa-documents` under `${orgId}/bills/`, which any org member can read by path. Vendor documents have the same problem. Move them to a board-only bucket or path policy as part of the M1 storage policies.
  - **Status:** Done: shipped behind M1_APPLIED; M1 applied in prod and the flag on since 2026-10-20.
  - **Groomed 2026-10-20:** Open, needs migration M1 (storage policies).
- **BL-059 Bill scan follow-ups:**
  - **Groomed 2026-10-20:** Partly done: edit-before-approve shipped (082e6a34), and the /approvals filter redirect fix. Still open, no migration: inbox attachments as a second way into bill scan; one real bill through the text and vision paths; `read-only:bg-subtle` in `packages/ui/src/lib/control.ts` still greys every Select trigger.
  - ~~Let the board edit extracted fields before approving.~~ Done (claude/bl-059): "Edit details" on each /approvals bill card (vendor, invoice #, dates, total, expense account, line items). `editBillProposal` (board gate before any client) re-validates in code (`lib/bill-scan/edit.ts`): real dates, invoice not after the association's today, due ≥ invoice, total in (0, $1M] cents, priced line items sum to an edited total, vendor/account from the association's lists, duplicate vendor + invoice # refused. Edited fields are marked in `payload.humanEdits` and mirrored to `ai_runs.human_edited_output`. Reject-only cards are fixable by editing.
  - ~~Left: accept inbox attachments as a second way in.~~ Done 2026-10-20: "Scan as a bill" on a stored inbox PDF/JPG/PNG/WebP attachment (`lib/inbox/attachment-bill.ts`, `ScanAsBillButton`). The upload route and the inbox action share one scan (`lib/bill-scan/scan-core.ts`): same association, duplicate (file-hash subject id), vendor match, account suggestion and `w36.ap_bill` proposal; nothing is entered until /approvals. Attachment path checked with `inboxAttachmentPathOk`, type/size checked on the row and the downloaded bytes. Both ways in now draw on the shared `board_ai` AI limit (the upload route had no limit before). W36 prompt v2 treats the bill as untrusted data and fences the PDF text. The thread link lives on the proposal payload (`origin: { kind: 'inbox_attachment', threadId, attachmentId }`) and /approvals shows "Open the email it came from". **For 0065 (candidate):** a real link — an `approval_request` type in `inbox_thread_links` (so the thread's Linked records shows the bill) and/or a source column on `invoices` so the entered bill keeps the thread after approval.
  - Left: run one real bill through the text and vision paths (only a fake model has been tested).
  - ~~Find out why `/approvals?type=bill` showed the All view in the screenshot.~~ Done: not the tab filter. Middleware's sign-in redirect kept only the pathname, so every fresh ui:shots context (and any signed-out user following a filtered link) came back to `/approvals`. The redirect now keeps the query string.
  - Left: `read-only:bg-subtle` in `controlBase` matches non-input elements, so every Select trigger and prefixed Input renders grey (design-system wide, not bill-specific).
- **BL-060 ⌘K follow-ups:**
  - **Groomed 2026-10-20:** Partly done (07160ecd). Open: inbox-participant matching needs a migration or RPC (not yet batched; candidate 0065); p50 latency measurement needs no migration.
  - ~~Violations on the same lot look identical, so add the date and status to each row.~~ Done: every violation, ARC, ticket and inbox row carries a right-aligned status · day (association day, BL-043) that stays visible when the label truncates; ARC/tickets/threads also show the lot's address.
  - ~~Add documents and meetings.~~ Done: uploaded + current governing documents (one "Documents" group) and meetings (type/summary), board-only through `/api/search`, RLS client, 5 per type.
  - ~~Fix inbox links that use `/properties/${unitId}`.~~ Confirmed bug (404): PropertyRail now links `PropertyContext.propertyId` (`units.legacy_hoa_property_id`), and shows the address unlinked when a unit has no property record. Search already used the hoa_properties id.
  - Left: match on inbox participants (needs a migration or RPC over message addresses).
  - Left: measure p50 latency.
- **BL-061 Confirm Resend keeps our Message-ID:** send one real communication and check that the reply's In-Reply-To carries `<hoh-cr.…>`. If Resend overwrites it, add `smtp_message_id` (migration). Inbound replies also need Resend receiving and an `email.received` webhook set up for the EMAIL_FROM domain (dashboard/DNS, owner).
  - **Groomed 2026-10-20:** Open, no migration: a manual check with one real send (owner or a prod smoke). Resend receiving / `email.received` is dashboard and DNS work for Asaf.
- **BL-062 Owner contact sent to the AI provider — Done (claude/bl-062):** ask-community sends owner email and phone to Groq on a board lookup. Consider redacting them, or sending them only when the question asks for contact details.

## Added 2026-10-17 (cycles 7–8)

- **BL-063 Retry cap gaps (needs a column, M1):** event alerts that never write a communications row (no association, no recipients, a failed insert) still retry daily. Add `hoa_recurring_events.alert_failed_attempts`.
  - **Status:** Done: shipped behind M1_APPLIED; M1 applied in prod and the flag on since 2026-10-20.
  - **Groomed 2026-10-20:** Open, needs migration M1 (`alert_failed_attempts`).
- **BL-064 "Open the books" for partial setups — Done (c9):** trial-balance, periods, coa, invoices/new, cash-flow, income-statement and the Plaid "no funds" alert still say "Contact support" when an association exists but its books are incomplete. Reuse `setUpAssociationCore`. The leases, settings/payments and reminders pages should use `AssociationNotSetUp`.
- **BL-065 Time zone leftovers (from BL-043): — Done (claude/bl-065)**
  - The events pages and the recurring-events cron still use the UTC day. Change them together.
  - recurring-jes uses one Eastern "today" for every association.
  - Client form date defaults are Eastern, not the association's zone.
  - The heat-map grid is built in server-local time.
- **BL-066 admin-analytics overflows at 1440 — Done (c9):** a `sm:grid-cols-[9rem_1fr]` grid spills out of its card (345px in 326px).
- **BL-067 Grouped analytics counts:** getAnalyticsData now makes about 2 × tenants + 14 count queries. An RPC or view would make it one query (migration).
  - **Groomed 2026-10-20:** Open, needs a migration (RPC or view); not yet in a batch, candidate M2.
- **T-07 Unit test with a slow import — Done (c9):** bill-scan `proposal.test.ts` imports the workflows package and timed out once under machine load. Give it a mock or a longer timeout.


## Added 2026-10-17 (owner request)

- **BL-068 Per-tenant module switches, with license pricing per module** (owner request; Next; migration batch M2; prices are an owner decision on top of BL-001)
  - **Groomed 2026-10-20:** Open, needs migration M2. Prices superseded by BL-104; the module switches themselves are still wanted (BL-104 item 7 entitlements is built as a pure function behind PRICING_V2).
  - **What:**
    - In platform admin → tenant, switch each module on or off for that tenant.
    - The license price recalculates live as modules change, showing a "this tenant pays $X/mo, $Y less without Accounting" preview.
    - Modules that are off disappear from the tenant's nav, ⌘K, dashboard cards, approvals kinds and setup checklist.
    - Their routes show a short "This module isn't on your plan" page, with a request-it link to the board.
    - Their Inngest jobs skip that tenant.
    - **Data is kept, never deleted.** Switching a module back on restores everything.
  - **Proposed modules:**
    - **Core** (always on): properties and owners, resident portal, communications, documents and state-law Q&A, violations, ARC, meetings, tickets, events.
    - **Optional:**
      - **Accounting:** GL, bank reconciliation and Plaid, AP and bills, budgets, financial reports, board-packet financials, payment plans, collections.
      - **Dues & online payments:** assessments, reminders, resident Pay. If Accounting is off, dues run as a simple ledger.
      - **AI assistant:** W3/W32/W34/W22-23 drafts, Copilot, bill scan, digest narrative. This is the "AI add-on" in docs/decisions/2026-10-pricing.md.
      - **Shared HOA mailbox / inbox.**
      - **Vendors & RFPs.**
      - **Leases & rentals.**
      - Later, as they ship: amenities, mailed letters.
  - **Pricing suggestion:** this extends scenario A in docs/decisions/2026-10-pricing.md and keeps its totals.
    - **Prices:**

      | Module | Per door | Monthly minimum |
      |---|---|---|
      | Core | $0.60 | $39 |
      | Accounting (includes Dues & payments) | $0.40 | $20 |
      | AI assistant | $0.50 | $25 |
      | Mailbox | $0.10 | $5 |
      | Vendors & RFPs | $0.10 | $5 |
      | Leases | $0.10 | $5 |

    - **50-door HOA:** Core only $39. Core plus Accounting $59 (matches scenario A's base). Everything $84 plus the small modules.
    - **400-door HOA:** Core $240, with Accounting $400, with AI $600.
    - **Why it competes:** a self-managed board that only wants communications, violations and the portal pays $39, which competes with PayHOA's $54–65 and GnomeOwner's $29–59. Accounting is the upsell that justifies the price gap.
    - **Discount option:** a bundle discount (e.g. 10% off with 3 or more optional modules) so "everything" is not a penalty.
  - **Build notes:**
    - **Migration:** an `org_modules` table (org_id, module, enabled, changed_by, changed_at), or an `orgs.modules jsonb` column, plus an audit_log row on every change.
    - **Code:**
      - one `moduleEnabled(org, 'accounting')` helper, used by nav, middleware or route gate, server actions, API routes and jobs;
      - a ratchet test that every module route checks its gate;
      - `packages/billing/src/pricing.ts` computes price from enabled modules and doors;
      - Stripe gets one subscription item per paid module, with proration on change.
    - **Admin UI:** module toggles and a price preview on the tenant page.
    - **Tenant UI:** settings → billing lists the modules and their prices.
  - **Acceptance:**
    - Switching Accounting off hides it everywhere for that tenant, nothing else changes, and its data is intact after switching it back on.
    - The price preview matches what Stripe charges.
    - Switching a module off stops its jobs for that tenant.
    - Residents never see a broken link.
  - **Scores:** impact 4, confidence 0.7, effort 3 agent-days, score 0.93 → Next. It needs a migration (M2) and the owner's sign-off on the module prices.

- **BL-069 Monthly state-law sync from official sources and legislative APIs, with an email report to the owner** (owner request; Next; builds on W30 and `packages/jobs/src/state-law-refresh.ts`)
  - **Groomed 2026-10-20:** Open, needs migration M2 for `state_law_runs`, plus Open States/LegiScan keys. The CA/GA/TX statute-text adapters behind `StateLawAdapter` need no migration and are ranked below.
  - **Today:**
    - The refresh job runs weekly (Mondays 03:00 ET) and also on `law/refresh.requested`.
    - Only FL has an official-source adapter.
    - Changes are diffed by `content_hash`, then `law/statute.changed` is emitted, with an outbox for retries.
    - CA rules are checked against official text (BL-054), but no CA text is ingested yet. GA and TX have no adapter.
    - In prod, FL has 0 rows because the first refresh has never been triggered.
  - **What:**
    - **Monthly full sync:** once a month (1st, 04:00 ET) the system checks every supported state.
      - **Statute text** comes from official sources: FL Legislature (ch. 720/718), CA leginfo (Civ. Code §4000–6150; the web pages are blocked, so use the `downloads.leginfo.legislature.ca.gov/pubinfo_<year>.zip` bulk data with range reads, per BL-054), GA Title 44 ch. 3, TX Prop. Code ch. 202/209.
      - **Bills** come from legislative APIs:
        - **Open States / Plural** (free API key) and/or **LegiScan** (free tier, about 30k queries a month).
        - It watches HOA and condo bills (keywords plus the chapters above) through every status: introduced, passed, signed, effective date.
      - **When text changes:**
        - The statute rows, chunks and embeddings update automatically.
        - Rules that depend on them (W3 state-rules, the FL compliance check, letter notices) are flagged "re-verify".
        - Affected associations get an in-app notice.
        - Nothing is silently rewritten in letters already sent.
    - **Email to Asaf (asafhamo55@gmail.com), branded like the release-note email:**
      - month and run time;
      - per state: sections changed, with old vs new excerpts and links to the official text;
      - new or advancing bills, with status and effective date;
      - what the system updated automatically and what needs a human check;
      - the count of associations affected.
      - "No changes this month" is still sent, so silence never means "broken".
      - If any source fails, the email says so: a failed source is reported, never skipped.
  - **Build notes:**
    - New adapters per state behind the existing `StateLawAdapter` interface, plus a `BillTracker` adapter (Open States first, LegiScan as fallback). The cron moves to monthly; the weekly cheap hash check can stay.
    - The email reuses `scripts/release-notes/render.ts`, or a shared renderer in packages/observability, and Resend. The recipient comes from an env var (`LAW_REPORT_TO`), never from data.
    - Store each run in `state_law_runs` (state, run_at, sections checked, changed, failed, bills seen). That table is a migration and joins batch M2.
    - Tests use recorded fixtures (the FL fixture pattern in tests/integration/flows/state-law-refresh.test.ts), never live calls in CI.
  - **Owner needs to provide:** an Open States API key (free at open.pluralpolicy.com) and/or a LegiScan key, plus `LAW_REPORT_TO` as an env var in Vercel production.
  - **Acceptance:**
    - A monthly run updates changed sections and sends one email listing every state's result, including failures.
    - Re-running the same month sends no duplicate email and makes no duplicate writes.
    - The FL first run populates prod. Today it has 0 rows.
  - **Scores:** impact 4, confidence 0.7, effort 3 → 0.93, Next. Needs a migration (M2) and API keys from the owner.

- **BL-070 User guide for new users** (owner request, 2026-10-17; Now; approach delegated)
  - **Groomed 2026-10-20:** Done, phase 1 (1d6afbd2 compiler, 6336b902 /help and drawer, cccba425 Ask the guide, 4597db4d What's new); phase 2 articles 418cae4f.
  - **Scope:** research the best AI-era method, then build. The spec is docs/specs/2026-10-17-user-guide.md, from the research agent.
  - **Planned phase 1:**
    - articles in the repo as markdown, with screenshots generated by ui:shots;
    - a `/help` centre with search;
    - a "?" contextual help drawer per page;
    - "Ask the guide": AI that answers only from guide articles, with citations and deep links;
    - a "What's new" page fed by docs/releases.
  - **Acceptance:** a new board member can find "how do I…" for each core task in 2 clicks or one question, and every answer cites an article. A CI check fails when a referenced screenshot or route no longer exists.


- **BL-071 Version indicator in the app** (owner request, 2026-10-17; Now; small; no migration)
  - **Groomed 2026-10-20:** Done (08d01fd7).
  - Shows the running version as "v2026.10.17 · c56061f": the build date in ET plus the short SHA, the same source as /api/health.
  - Where: the sidebar and mobile nav footer (linking to a "What's new" page built from docs/releases), the login page, the resident portal footer, and the platform-admin header.

## Added 2026-10-17 (found while writing the user guide)

- **BL-072 Guide-found UX bugs** (Now, small, no migration):
  - **Groomed 2026-10-20:** Done (75c6986a).
  - /onboarding/setup "Upload CSV" links to the platform-admin-only /admin/import-units, so a normal admin is just redirected away. This goes away with properties P4; until then, hide or relabel the link.
  - The Generate dues and Record payment flows can show developer text ("run pnpm seed:accounting"). Replace it with user-facing messages and the "Open the books" action.
  - Ask the Docs (board): `/api/ai/ask-community` always returns `toolCalls`, so the "Cited sections" view never renders.
  - The SMS hint says long messages are "split" at 279 characters, but the server truncates them. Pick one behaviour and make the hint say it.
  - The invite form's role hint always shows the Resident text, whatever role is picked.

- **BL-073 Month-end board report email** (owner question, 2026-10-17; Now; no migration if possible)
  - **Groomed 2026-10-20:** Done (0fbec9ad).
  - **When:** sent automatically on the 1st at 08:00 ET to every association's board and admin members, covering the previous month in the association's own time zone. Admins can also preview it and choose "Send now".
  - **What it contains:** it reuses the board-packet numbers:
    - financials;
    - budget vs actual through month end;
    - delinquency as of month end, including 90+ days;
    - violations, ARC, waiting approvals and the next meeting;
    - a link to the full packet.
  - **Rules:** each member can opt out. Each org gets at most one report per month. It is sent through the outbound guard. A section whose data failed says "couldn't load".

- **BL-074 Page navigation performance** (owner request, 2026-10-17; Now): measure, find root causes, then fix. Candidates: loading.tsx skeletons, `cache()` for per-request lookups, parallel loaders, middleware auth cost, router cache and prefetch, function region vs DB region. In progress.
  - **Groomed 2026-10-20:** Done (85303021 pdx1, 94883b81, 451e64e0, 0e43d219, d4909aa1); continued as BL-099.
- **BL-075 Screenshots and integration only in CI** (owner rule, 2026-10-17: no local DB): a GitHub Actions job that boots the throwaway Supabase, seeds, runs `ui:shots` and `ui:overflow`, and uploads the shots as artifacts for review and release notes. Integration is already CI-only from now on.
  - **Groomed 2026-10-20:** Done (f3164425).

## Added 2026-10-18 (cycle findings)

- **BL-076 Open next fiscal year** (from BL-029): there is no action to open the next fiscal period, so a drafted budget usually can't be saved. Add an admin-only "Open next fiscal year" that creates the period without changing the current period until the year starts. No migration.
  - **Groomed 2026-10-20:** Done (db799503).
- **BL-077 Closing entries distort reports (accounting bug, high)** (from BL-029): computeBudgetVsActual and the income statement include year-end closing entries, so a closed year's actuals net to about zero. Exclude closing entries the way budget-draft-data.ts does, and add a regression test.
  - **Groomed 2026-10-20:** Done (42d31966).
- **BL-078 ARC pre-check rate limit** (from BL-024): POST /api/ai/arc-precheck makes one model call per click with no limit. Add a per-user and per-org rate limit; the board-side review is unaffected. Also bind the pre-check run id to the submitting resident.
  - **Groomed 2026-10-20:** Done (2dccfdeb).
- **BL-079 ARC review photos and letter draft** (from BL-027): vision findings from the application photos, and a full decision-letter draft. Built on `claude/bl-079` (2026-10-18): W37 reads up to `ARC_REVIEW_MAX_PHOTOS` (default 3) image attachments out of band, findings tied to their photo at low/medium confidence feed the suggestion; four editable letters (approve / with conditions / deny / request info) built in code from the cited rules, blocked from sending while a BLANK is left. No migration.
  - **Groomed 2026-10-20:** Done (fe712f36, 12a3d395).

## Added 2026-10-18 (found while writing guide phase 2)

- **BL-080 Payment plans never complete:** a plan never moves to Completed on its own, and a home on an active plan skips automatic dues reminders for good. Close a plan when it is paid off, and resume reminders.
  - **Groomed 2026-10-20:** Done (2211010e). Memo stand-ins remain until the BL-085 columns land.
- **BL-081 Stop or edit a recurring journal entry:** there is no UI for it, and the guide currently tells boards to contact support.
  - **Groomed 2026-10-20:** Done (2211010e).
- **BL-082 Notify residents of decisions (Done 2026-10-19, 084692b):** no email or text goes out when the board replies to a ticket or decides an ARC application. Add an opt-in notification through the outbound guard, using the residents' preferences.
- **BL-083 Vendor insurance expiry reminders (Done 2026-10-20, board-facing per the owner safety rule):** no automatic email to anyone outside the board. The daily `vendor-coi-reminders` job now writes only in-app board notices (30 / 7 / 0 days; same function id, no sender). Expiring and expired COIs show in the dashboard Daily Digest and At risk list and as a badge on the vendor page. "Request updated certificate" on the vendor page drafts the vendor email; the board reviews and sends it through the guarded sendEmail, to the vendor's address on file only.
- **BL-084 RFP insurance minimums settings (Done 2026-10-20):** Settings → Vendors holds general liability, workers' comp, auto and umbrella minimums (signed compliance_settings.vendor_insurance, no migration). Umbrella replaced W21's unsigned `umbrella_min` read; RFP drafts, invitations and the compliance check all use the signed values. Per-RFP overrides were not built: minimums are per association.
- **Eval note:** the Ask-the-guide rules classifier sends some how-to questions to Ask the Docs ("how long can", "allowed", "declaration"). Tune it next time.
  - **Groomed 2026-10-20:** Done (7c71b204): app how-tos worded like rules questions now stay with the guide (`isRulesQuestion` in `apps/hoa/src/lib/guide/ask-core.ts`).

- **BL-085 Columns wanted for M2** (from BL-080/081/083):
  - **Groomed 2026-10-20:** Open, needs migration (its own BL-085 batch, after M2). Also take BL-051's waived-at column.
  - `assessments.payment_plan_id`: the plan is linked today by parsing a memo. Since the 2026-10-19 double-count fix there are two links: installments (memo `Payment plan installment i/n (plan xxxxxxxx)`) and the charges a plan replaced (memo `Payment plan replaces charge (plan xxxxxxxx)`, source_id = the replaced charge, which is set to `waived`). Both want this column (or `replaced_by_plan_id`), plus a real `replaced` status so a replaced charge stops reading "Waived" on the resident ledger.
  - Plans made before 2026-10-19 count the balance twice. Diagnostic and a reviewed correction (not applied): `docs/specs/2026-10-19-payment-plan-double-count.sql`.
  - `payment_plans.completed_at`.
  - `recurring_journal_entries.status` (active / paused / stopped) and `end_date`.
  - Once these exist, replace the memo and audit-row stand-ins.
- **BL-086 Check vendor COI reply routing in prod:** the board-sent "Request updated certificate" email asks the vendor to reply. Confirm one real reply reaches the board's inbox.
  - **Groomed 2026-10-20:** Open, no migration: a manual prod check with one real vendor reply.

## Research pass 2026-10-19: next no-migration wins (ranked)

- **BL-087 Estoppel / resale certificate (Done 2026-10-19)** (FL §720.30851, CA §4525/§4530):
  - "Prepare estoppel" on the property page, filled from the ledger, collections, plans and open violations.
  - Business-day due date and fee cap; BLANKs block printing; a board-verify step; audit row.
- **BL-088 Resident "Meetings and notices" page (built 2026-10-19; off until Asaf applies docs/specs/2026-10-19-resident-meeting-notices.sql, after 0063 and M1; time/place columns need a later migration):** upcoming meetings and approved minutes only (FL 100+ parcels owners-only posting); a card on the resident home page.
  - **Groomed 2026-10-20:** Open, needs migration: built (2c8e1c29), off until Asaf applies `docs/specs/2026-10-19-resident-meeting-notices.sql` after 0063 and M1.
- **BL-089 Statute-aware collections letters:** draft and print only, through Approvals (FL §720.3085(4) 45-day intent to lien, TX §209.0064, CA §5660).
  - **Groomed 2026-10-20:** Done (f054b020; correctness fixes 59f45aba).
- **BL-090 Marketing truth round 3 (Done 2026-10-19):** Spanish and AI ARC review are now shipped; the HOA hero persona quotes unsupported numbers.
- **BL-091 Annual budget notice to owners (Done 2026-10-19)** (FL §720.303(6), CA §5300 partial): built from the adopted budget; reserve fields are BLANKs. "Prepare owner budget notice" on an approved budget; print, or an announcement draft through New message. CA fixture gains §§ 5300 and 5320.

## Owner requests 2026-10-18 (received 2026-10-19)

- **BL-092 Product and architecture deck (PowerPoint):** a full product and architecture overview for team members and potential buyers, with sketch-style diagrams and screenshots.
  - **Groomed 2026-10-20:** Done: `~/HomeownerHub-decks/HomeownerHub-Product-Architecture.pptx` (outside the repo, so no commit). Keeping it current is ongoing.
  - Saved locally outside the public repo, in `~/HomeownerHub-decks/`.
  - Refresh it whenever a deploy changes something the deck shows. Each loop cycle checks whether it is stale.
- **BL-093 Investor deck (PowerPoint):** researched fundraising deck: problem, solution, product, market size, business model and pricing, go-to-market, traction, competition, roadmap, team, financials and the ask.
  - **Groomed 2026-10-20:** Done: `~/HomeownerHub-decks/HomeownerHub-Investor-Deck.pptx` (outside the repo). Keeping it current is ongoing (OA-15 traction numbers, 6dbb1c8d).
  - Kept current over time. Saved locally outside the repo, because it holds strategy.
- **BL-094 Company logo (Done 2026-10-19, superseded by BL-098 concept C):** a mark plus a wordmark for HomeownerHub / Ledger, delivered as SVG and PNG in light and dark versions, with a favicon.
- **BL-095 Platform recolour (Done 2026-10-19):** move the whole platform to a blue / light-blue palette in line with current SaaS design trends, through design tokens. It must keep AA contrast, dark mode and the guide screenshots working. It follows BL-094 so the palette matches the logo.

## Owner request 2026-10-19

- **BL-096 Resident assistant (Done 2026-10-19) (chat with AI in the portal).** Reposition the existing board Copilot loop (`lib/community-qa/agent.ts`, tool-using) as a resident-facing assistant. It replaces today's single-shot "Ask the Docs" tab at `/resident/ask`.
  - **Tools:** a resident-scoped toolset only. Each tool runs on the resident's own RLS client. None of the board's DB tools (overdue lists, owner lookups, counts) is ever registered.
    - `search_governing_docs`: cited answers. The existing W1, reused.
    - `my_account`: the resident's own balance, next due date, payment plan, and how to pay (Zelle memo).
    - `my_requests`: the status of the resident's own tickets, ARC applications and violations.
    - `community_calendar`: upcoming meetings, once BL-088 is on, plus recent announcements.
    - `portal_how_to`: user-guide articles, scoped to the resident audience.
  - **Hand-offs, never actions:**
    - The assistant suggests "Open a request to the board", with the ticket pre-filled from the chat, or "Start an ARC application", with the ARC pre-check pre-filled.
    - The resident confirms each hand-off.
    - The assistant never changes data and never speaks for the board. A rules question it can't answer from the documents becomes "ask the board" with a prefilled ticket.
  - **Guardrails:**
    - No PII about other owners.
    - Citations are required for any rules answer.
    - "Not legal advice" footer.
    - A per-resident AI rate limit (e.g. 20 per hour, 100 per day) and a per-org daily cap.
    - Conversation kept in the browser session only; the ai_runs log holds ids only.
  - **Board control:** Settings → Resident portal → "Resident assistant", ON by default, with a per-association switch. It is pull-only, so nothing is sent to residents.
    - The board also gets a weekly "top questions residents asked" digest card, with counts and topics only, to show where the documents are unclear.
  - **No migration.** The setting is HMAC-signed in compliance_settings, like the other settings switches.
  - **Effort:** about 2 agent-days.
- **BL-097 Hide the PM and Eviction hubs (Done 2026-10-19) (owner, 2026-10-19):** remove every in-app and marketing path that switches to, or advertises, the Property Management or Eviction hubs (the hub switcher, nav, cross-links, marketing product pages and CTAs). Those products are not available. Keep apps/pm and apps/eviction compiling; don't delete them.
- **BL-098 HomeownerHub logo (Done 2026-10-19, concept C) (owner, 2026-10-19):** the owner refers to the product as HomeownerHub. The BL-094 mark (blue tile, roof, ledger lines) ships with a "Ledger" wordmark, while the app says "HOA Hub" and the domain is homeownerledger.com.
  - Prepare logo options for "HomeownerHub" (2–3 concepts, wordmark plus mark) and present them for the owner to pick.
  - Then apply one brand name everywhere.
- **BL-099 Data shows too slowly (owner, 2026-10-19):** BL-074 already fixed the region (pdx1), request-level caching and parallel loaders, yet screens still wait for data. Only 5 of about 150 pages have a `loading.tsx`, and most pages await every query before rendering anything.
  - **Groomed 2026-10-20:** Done (f56494df): timing, streaming, 123 loading.tsx, waterfall fixes. `docs/specs/2026-10-19-perf-indexes.sql` (12 indexes) waits for Asaf. Follow-up: read the `[perf]` logs and fix the slowest pages (ranked below).
  - **Plan:**
    1. Add per-loader timing in production (Server-Timing header plus ids-only duration logs), so the slowest pages and queries show up with real numbers.
    2. Stream: render each page's shell at once, put data sections in `<Suspense>` with skeletons, and add `loading.tsx` to every dashboard and resident route group.
    3. Fix the top waterfalls and over-fetching, such as `select *` and N+1 queries.
    4. Propose missing indexes as SQL for Asaf to apply.
    5. Tune router prefetch on the sidebar links.
- **BL-100 The marketing site isn't being deployed (found 2026-10-19):** the Vercel project `homeownerhub-marketing` (https://homeownerhub.vercel.app) last deployed 148 days ago. It still serves the old "Ledger" site, so none of the marketing truth passes (BL-042/090), the hub hiding (BL-097) or the HomeownerHub rename is live there. www.homeownerledger.com serves the app and opens on /login.
  - **Groomed 2026-10-20:** Partly done: marketing metadataBase/canonical fixed (fefdad6b); domain split step 1 (ab3f69ef). Remaining is owner work: the CNAME and the step 2 dashboard changes, then connect the marketing project.
  - **Owner decisions:**
    - connect the marketing project to the prod branch;
    - give it a domain (e.g. homeownerledger.com root for marketing and app.homeownerledger.com for the app, or keep the current split);
    - `metadataBase` in apps/marketing points at https://ledger.ai, which isn't ours; it must change to the real domain.
- **BL-101 Inbox revisit (owner, 2026-10-19):** replying to residents' emails and requests still takes the board a lot of effort. Rework `/inbox` so that it:
  - **Groomed 2026-10-20:** Partly done: Phase A A1–A9 shipped (c85a6e5b A1/A2, b9863141 A3/A6, 1859ee84 A4, ec84ebba A5/A7, f369f911 A8/A9, b5c280a2 A8 drafts). Open: A10 measurement (no migration); Phase B B1–B5 needs migration 0065.
  - connects each message to everything relevant: the sender's home and account, their open tickets, ARC applications and violations, the governing documents, and past threads;
  - drafts a cited reply for the board to approve;
  - turns an email into a ticket, ARC application or violation report in one click;
  - batches similar questions together;
  - cuts the number of clicks per reply.

  Phase 1 is research and a plan (docs/research/2026-10-inbox-plan.md). Phase 2 builds the top items that need no migration.
- **BL-102 Communications: simple and self-service (owner, 2026-10-19):** review the whole outbound communications module so a volunteer can send the right message without help. It covers:
  - **Groomed 2026-10-20:** Partly done: Phase A A1–A9 and A11 shipped (dcf3c57b A1/A4/A6, dd411f5f A2/A3, 7d0f363d A5–A9, d6339540, 973f5408 and 279e076e A11). Open: A10 guide rewrite is partial (no `communications-urgent-notice.md` or `communications-follow-up.md`; the announcement guide still mentions Topic/HTML). Phase B B1–B4 need migrations not yet in a batch (B3 overlaps BL-026 in M2).
  - the announcement wizard;
  - audiences and segments;
  - SMS;
  - the Spanish version;
  - scheduling;
  - templates;
  - official notices;
  - delivery status.
  Design it alongside BL-101 (inbox), so both sides of resident communication feel like one place. Phase 1 is a research plan, docs/research/2026-10-communications-plan.md. Phase 2 builds the pieces that need no migration.
- **BL-103 Stripe sandbox test suite (owner, 2026-10-19):** an automated suite that runs every payment path against Stripe test mode, as a GitHub workflow.
  - **Groomed 2026-10-20:** Done (87c8d213): the suite skips cleanly until Asaf adds the Stripe test keys as GitHub secrets.
  - **Card:** success, decline and 3-D Secure.
  - **ACH:** us_bank_account, including micro-deposit and instant verification.
  - **Link:** if enabled.
  - **Checkout:** each plan and door-count tier.
  - **Subscription lifecycle:** using test clocks (trial, renewal, failed payment and dunning, cancel, upgrade and downgrade).
  - **Customer portal.**
  - **Every webhook event the app handles:** signed payloads, idempotency and out-of-order delivery.

  It needs Stripe test-mode keys (`STRIPE_TEST_SECRET_KEY`, plus a test webhook secret) stored as GitHub secrets. Only Asaf can create these. The suite skips cleanly while they're missing.

## Added 2026-10-20 (pricing decision)

- **BL-104 Implement the 2026-10-20 pricing: Essentials / Complete in flat size bands** (decision `docs/decisions/2026-10-20-pricing.md`; evidence `docs/research/2026-10-pricing-analysis.md`; supersedes BL-041 and BL-068's price table; needs BL-068's module switches, migration batch M2)
  - **Groomed 2026-10-20:** Partly done (a51de69d, 6c96734f). Open, no migration: item 5 band-sync job, item 6 renewal-notice job, item 9 SMS allowance (count existing send rows). Needs M2: module-off pages. Needs owner: Stripe objects, portal settings, the flip.
  - **Status (2026-10-20):** AI safety live: the `board_ai` cap on previously unlimited board routes, 200/day for every current org. Existing and grandfathered orgs keep today's per-feature limits. Per-band ceilings (item 8) apply only to new-plan orgs after the flip. Items 1, 3, 4 (lookup-key mapping), 7 (pure), 10 (billing page), 11 (marketing) and the grandfathering rule built behind `PRICING_V2` (off). Flip steps and Stripe objects: `docs/specs/2026-10-20-pricing-v2-rollout.md`. Open: 5, 6 (jobs), 9 (SMS), module-off pages (needs M2), caps for meeting-summary / ask-community (decision amendment).
  - **Rule:** nothing below goes live piecemeal. Code, Stripe Prices and marketing ship in **one PR**; until then checkout and the site keep charging and showing $4.99/door. Existing paying subscriptions keep their price until renewal (decision §5).
  - **0. Before starting (ids only, no PII):** list live Stripe subscriptions on `hoa_per_door_monthly` / `hoa_per_door_annual`, with org id, cadence and term end. Record them here. Confirm whether any exist beyond the Madison Park pilot.
  - **1. `packages/billing/src/pricing.ts`:**
    - replace the per-door constants with band tables per plan × cadence (cents): Essentials 4900/7900/11900/17900 and 401+ 45¢/door; Complete 9900/14900/22900/34900 and 401+ 900 + 85¢/door; annual = 10 × monthly;
    - `planPriceCents(plan, cadence, doors)`, `bandFor(doors)`; remove `billableDoors()`'s `ceil` floor and `MIN_MONTHLY_USD`; `COMMIT_MONTHS` applies only to legacy subscriptions;
    - tests: every band edge (50/51, 100/101, 200/201, 400/401) for both plans and cadences; **the price never falls as doors rise, 1–2,000 doors**; annual = 10 × monthly; legacy $4.99 math kept for grandfathered display.
  - **2. Stripe (`apps/hoa/src/app/api/admin/setup-stripe-pricing/route.ts`):**
    - create four recurring Prices on the existing product with `billing_scheme: 'tiered'`, `tiers_mode: 'volume'`: tiers `up_to` 50 / 100 / 200 / 400 with `flat_amount` and `unit_amount: 0`, then `inf` with `unit_amount` (plus `flat_amount` 900 on Complete monthly, 9000 on Complete annual);
    - lookup keys `hoa_essentials_monthly`, `hoa_essentials_annual`, `hoa_complete_monthly`, `hoa_complete_annual`; idempotent like today;
    - **leave `hoa_per_door_monthly` / `hoa_per_door_annual` active**: grandfathered subscriptions use them. Remove them from the checkout picker only;
    - customer portal: quantity editing **off**; plan switch Essentials ↔ Complete allowed only if the portal supports tiered Prices (verify in test mode; otherwise switch through our own settings page). Asaf saves the portal settings (dashboard).
    - Stripe sandbox suite (BL-103): checkout at each band, band crossing on renewal, a grandfathered subscription renewing onto the new Price, trial → paid.
  - **3. Checkout (`apps/hoa/src/lib/billing.ts`, `packages/billing/src/checkout.ts`):**
    - plan × cadence picks the lookup key; `quantity` = server-side unit count for the org, never the form field (drop the fallback for HOA plans; 0 units → block checkout with "add your homes first");
    - `subscription_data.trial_period_days: 30` for orgs that never had a subscription; `payment_method_collection: 'if_required'`;
    - `metadata.plan` = `essentials` | `complete`.
  - **4. Webhook (`packages/billing/src/webhook.ts`):** write `orgs.plan` = `essentials` | `complete` | `legacy_per_door` from the Price lookup key; keep `subscription.updated` handling. A trial ending without a card sets the org to `free` (read-only, data kept).
  - **5. Band sync job (Inngest, nightly):** recount units; if the band changes, update the subscription item quantity with `proration_behavior: 'none'` so it bills from the next invoice. Log org id, old band and new band only.
  - **6. Renewal migration job:** for each grandfathered subscription, 30 days before its term end email the board (new plan, new price, lower than today). At term end, swap the item to `hoa_complete_*` with `proration_behavior: 'none'`. On request, an admin action does the same swap at the next invoice and clears the commitment.
  - **7. Entitlements (BL-068 switches):** `moduleEnabled(org, module)` is derived from the plan. Essentials = core + dues + ai (Essentials limits); Complete adds accounting, mailbox, vendors, leases. Legacy subscriptions = Complete. A platform-admin override stays possible (e.g. pilots).
  - **8. AI limits (`apps/hoa/src/lib/api/ai-limits.ts`):** `perOrg.limit = max(5, round(base × multiplier(plan, band)))` using the decision §3 table. Add a `board_ai` bucket (100/day Essentials, 200/day Complete) on the board-only routes that are unlimited today: violation draft, /inspect queue, digests, parse/suggest. Unit test: worst case ≤ 30% of band price at every band.
  - **9. SMS allowance (`apps/hoa/src/lib/communications/send.ts`):** monthly segment counter per org (2/door Essentials, min 100; 4/door Complete, min 200). Over the allowance, skip SMS, still send email, show the board why. May need a column (M2) or can count existing send rows.
  - **10. UI:**
    - `/settings/billing` `PlanPicker`: two plans, band shown from the unit count, annual "2 months free", no commitment copy for new plans, legacy copy kept for grandfathered orgs;
    - module-off pages ("This module isn't on your plan") link to the upgrade.
  - **11. Marketing (same PR):** `apps/marketing/src/lib/hoa-pricing.ts` gets the band table, `hoa-pricing.test.ts` re-pins against `pricing.ts` and the setup route's cent amounts. Update /pricing, the teaser, /compare, the ROI calculator and the /demo FAQ through `HOA_PLANS`. Remove the "Coming soon" module table from `2026-10-18-marketing-pricing-truth.md`.
  - **12. Outside the repo:** update the investor deck in `~/HomeownerHub-decks/`. Release note per the release-note rule.
  - **Acceptance:**
    - a 50-door org checks out at $49 / $99 (or $490 / $990 annual), and Stripe's invoice matches `planPriceCents` at every band edge;
    - a 401-door Complete org pays $349.85;
    - a grandfathered subscription is untouched until its term end, then lands on Complete with a 30-day notice sent;
    - crossing a band never creates a prorated invoice;
    - AI 429s fire at the band ceilings;
    - marketing and checkout show the same numbers.
  - **Revisit:** after 10 paying orgs or 90 days, with measured `ai_runs`, SMS segments and onboarding hours.
  - **Scores:** impact 5, confidence 0.7, effort 4 agent-days, score 0.88. Needs BL-068 (M2), Stripe test keys (BL-103) and Asaf's portal settings.


- **BL-105 Inbound sender authentication:** `checkSenderForUnit` trusts the From header, which can be forged. Read the inbound provider's SPF/DKIM/DMARC result and treat a failed check as "unverified sender" (no contact-update prefill, a warning in the context panel). No migration if the verdict is available on the stored message; otherwise it waits for migration 0065.
  - **Status:** Done: SENDER_AUTH_COLUMN_LIVE on since 2026-10-20 (runbook E verified).
  - **Groomed 2026-10-20:** Partly done (cd3c6144), behind `SENDER_AUTH_COLUMN_LIVE = false`. Needs migration 0065 (`docs/specs/2026-10-20-inbound-auth.sql`).
  - **Status (2026-10-20):** the verdict is NOT stored today (Inbox mail is Gmail sync; `inbox_messages` keeps no headers), so it needs a column. Built: the pure parser (`packages/mailbox/src/auth-results.ts`, topmost `Authentication-Results` from `mx.google.com` only → pass / fail / none), ingest writing `sender_auth`, `checkSenderForUnit(…, { threadId })` turning `fail` into `sender_unauthenticated` (no contact-update prefill or filing, balance withheld from drafts and saved replies, red chip in the rail; `none` adds a soft note). All behind `SENDER_AUTH_COLUMN_LIVE = false`. Waits for the owner to apply `docs/specs/2026-10-20-inbound-auth.sql`, then flip the flag and deploy.
- **BL-106 AI caps for meeting-summary and ask-community (Done 2026-10-20: own buckets `meeting_summary` 5/h, 10/day (Essentials 3/day, provisional: BL-108) and `ask_community` 15/h, 25/day (Essentials 0, Copilot not on the plan); Copilot loop bounded to 1,500 output tokens per step and 6 docs searches; Complete still over 30% (open, see amendment); cost math in the pricing decision's BL-106 amendment; ai-limits.ts comment corrected):** these two board-only AI routes are still uncapped (BL-104 left them out because the decision's cost math doesn't cover them). Measure per-call cost from ai_runs, then amend docs/decisions/2026-10-20-pricing.md with a cap that keeps worst-case AI cost at or below 30% of the band price.
  - **Groomed 2026-10-20:** Open, no migration (ranked below). Note: the `board_ai` comment in `apps/hoa/src/lib/api/ai-limits.ts` lists meeting-summary and ask-community, but neither route calls `requireAiQuota` today.
- **BL-107 Terms of Service revision (HOA only) (Done 2026-10-20, scope-only; see docs/decisions/2026-10-20-terms-scope-correction.md; goes live with BL-100):** the marketing Terms page still describes "small landlords and eviction-adjacent tasks" (from before BL-097). Draft an HOA-only revision with a new "Last updated" date and a change summary. Ship it together with the marketing deploy (BL-100). Changing legal text needs care: keep it to a scope correction, with no new obligations.

## Ranked open work (groomed 2026-10-20)

**How this was groomed:** every item not already marked Done was checked against `git log --grep=BL-NNN` and the code, and now carries a "Groomed 2026-10-20" line with the commit. 72 items were classified:

| Class | Count | Items |
|---|---|---|
| Done (was listed as open) | 33 | BL-001, 002, 003, 004, 005, 006, 008, 010, 017, 018, 024, 027, 028, 029, 042, 070, 071, 072, 073, 074, 075, 076, 077, 078, 079, 080, 081, 089, 092, 093, 099, 103, the guide classifier eval note. The properties P0–P4 and P5 parts in "Priorities" are done too. |
| Partly done | 12 | BL-009, 031, 044, 051, 055, 059, 060, 100, 101, 102, 104, 105 |
| Open, no migration | 4 | BL-040 (keys, deferred), 061 and 086 (manual prod checks), 106 |
| Open, needs migration | 22 | **0063:** BL-007 · **M1:** BL-020, 050, 052, 058, 063 (+ BL-055's webhooks/stripe 0064) · **after 0063 + M1:** BL-088 · **M2:** BL-023, 026, 030, 068, 069 (+ BL-067 candidate) · **BL-085 batch:** BL-085 (+ BL-051 waived-at) · **0065:** BL-105, BL-101 Phase B · **M3:** BL-032–038, BL-039 (unbatched) |
| Obsolete | 1 | BL-041 (superseded by BL-104) |

Not counted above: BL-104's module-off pages (M2) and BL-102 Phase B (migrations not yet batched). Items waiting only on Asaf (SQL, keys, DNS, the Safari check) are in `docs/owner-actions.md`.

**The list:** the top 15 open items that need **no migration**, highest value first for a self-managed volunteer board. Each one is sized for one worktree agent.

1. ~~**Invoices emailed to the HOA become bill proposals** (BL-059 leftover).~~ **Done 2026-10-20** (see BL-059). Add "Scan as a bill" on an inbox PDF/image attachment, feeding the existing bill-scan proposal into /approvals. Files: `apps/hoa/src/lib/inbox/convert/actions.ts`, `apps/hoa/src/app/(dashboard)/inbox/[id]/ConvertMenu.tsx`, `apps/hoa/src/lib/bill-scan/proposal.ts`, `apps/hoa/src/lib/inbox/attachment-file.ts`.
2. **California statute text ingestion** (BL-069, adapter part only). A CA adapter behind `StateLawAdapter` reading the leginfo `pubinfo_<year>.zip` bulk data (Civ. Code §§ 4000–6150), so CA violation and collections letters quote verbatim text instead of nothing. Recorded fixtures only, no live calls in CI. First check the statutes tables accept `CA` without a migration. Files: `packages/workflows/src/W30-state-law-brain/sources/` (new `california.ts`, `index.ts`), `packages/jobs/src/state-law-refresh.ts`, `tests/integration/flows/state-law-refresh.test.ts`.
3. ~~**Dues reminders tell the truth**~~ **Done (2026-10-20):** a run the guard held back for every recipient finishes `cancelled` (0018 has no held status; `finalSendStatus` in `packages/observability/src/send-status.ts`), recipients `suppressed`, no `sent_at`; /communications and the /dues dialog read "held by safety guard (N)"; the reminder email is fluid (no fixed width over 375px). (BL-044 leftovers). A reminder the outbound guard held back for every recipient should read "held by the safety guard", not `failed`; the email preview must not scroll sideways at 375px. Files: `packages/jobs/src/dues-reminders/run.ts`, `apps/hoa/src/lib/dues-reminders/render.ts`, `apps/hoa/src/app/(dashboard)/dues/SendRemindersDialog.tsx`.
4. **Fix the slowest pages from real numbers** (BL-099 follow-up). Read a week of `[perf]` log lines in Vercel production, then fix the top 3 slow loaders (waterfalls, `select *`, missing streaming). Index ideas go into `docs/specs/2026-10-19-perf-indexes.sql`, never applied by an agent. Files: `apps/hoa/src/lib/perf/timing.ts` and whichever loaders the logs name (likely `apps/hoa/src/lib/dashboard/queries.ts`, `apps/hoa/src/lib/properties/property-360.ts`). **Status:** Shipped a static pass (0ae633b4). Remaining: fix from a week of real [perf] numbers.
5. **Cap meeting-summary and ask-community** (BL-106). Measure per-call cost from `ai_runs`, add both routes to `board_ai` (or their own bucket), amend the pricing decision, and fix the `ai-limits.ts` comment that already claims they are capped. Files: `apps/hoa/src/app/api/ai/meeting-summary/route.ts`, `apps/hoa/src/app/api/ai/ask-community/route.ts`, `apps/hoa/src/lib/api/ai-limits.ts`, `docs/decisions/2026-10-20-pricing.md`.
6. **Communications guides match the new composer** (BL-102 A10). Rewrite the announcement and SMS articles for the one-box composer (drop Topic/HTML), add `communications-urgent-notice.md` and `communications-follow-up.md`, regenerate the guide. Files: `apps/hoa/content/guide/communications/*.md`, `apps/hoa/src/generated/guide.ts`. **Status:** Done (76dcf5b4), live.
7. **Inbox draft measurement** (BL-101 A10). Record edit distance, blank count and open-to-approve time per approved draft (ids and numbers only), plus a weekly figure for the board digest. Files: `apps/hoa/src/lib/inbox/draft/actions.ts`, `packages/workflows/src/W32-reply-drafter/`, `packages/jobs/src/daily-digest.ts`. **Status:** Done (c6445a9d), live.
8. **Product analytics, privacy-safe** (BL-009 remainder). Add Vercel Web Analytics page views on board and resident routes and the 8 named events through an allowlist like `help-events.ts`; update the privacy page. Asaf enables Web Analytics on the project. Files: `apps/hoa/src/app/layout.tsx`, `apps/hoa/src/lib/guide/help-events.ts` (pattern), new `apps/hoa/src/lib/analytics/`, `apps/marketing/src/app/privacy/page.tsx`. **Status:** Done (1fb2fcc1), live; turning it on waits on OA-24.
9. ~~**Grey Select triggers**~~ **Done (2026-10-20):** `controlBase` greys only `[readonly]` controls; the prefixed Input greys its wrapper from the prop; `packages/ui/src/lib/control.test.ts` compiles the class through Tailwind. (BL-059 leftover, design system). `read-only:bg-subtle` in `controlBase` matches non-input elements, so every Select trigger and prefixed Input renders grey. Scope it to real inputs and add a preview test. Files: `packages/ui/src/lib/control.ts`, `packages/ui` Select/Input components.
10. **Texas and Georgia statute text** (BL-069, adapters). Same pattern as item 2 for TX Prop. Code ch. 202/209 and GA Title 44 ch. 3, which also unblocks the records-roster email rule for TX § 209.005 and GA. Files: `packages/workflows/src/W30-state-law-brain/sources/`, `apps/hoa/src/lib/properties/statutory-roster/law.ts`.
11. **SMS allowance per plan** (BL-104 item 9). Count this month's SMS segments from existing send rows; over the allowance, skip SMS, still send email, and tell the board why. Behind `PRICING_V2`. Files: `apps/hoa/src/lib/communications/send.ts`, `packages/billing/src/entitlements.ts`. **Status:** Done (18f4de51), behind PRICING_V2.
12. **Nightly band-sync job** (BL-104 item 5). Recount units; when the band changes, update the subscription quantity with `proration_behavior: 'none'`. Behind `PRICING_V2`; tests only against mocks or the BL-103 sandbox. Files: new `packages/jobs/src/billing-band-sync.ts`, `packages/billing/src/pricing-v2.ts`, `apps/hoa/src/app/api/inngest/route.ts`. **Status:** Done (18f4de51), behind PRICING_V2.
13. **Renewal notice for grandfathered subscriptions** (BL-104 item 6). Email the board 30 days before term end (new plan and price) and swap the price at term end; board recipients only, through the guard. Files: new `packages/jobs/src/billing-renewal-notice.ts`, `packages/billing/src/grandfathering.ts`. **Status:** Done (18f4de51), behind PRICING_V2.
14. **⌘K latency measured** (BL-060 leftover). Add timing to `/api/search` through `perfTimer`, and record p50 on the seeded org in CI. Files: `apps/hoa/src/app/api/search/route.ts`, `apps/hoa/src/lib/perf/timing.ts`. **Status:** Done (3b6d2bf6), live.
15. **CINC aging report → opening balances** (BL-031 remainder). **Built 2026-10-21 (no migration; see BL-031 status).** Map a CINC aging export to per-unit opening balances, with the JE proposed through approvals and a dry run of counts and ids. **Blocked until Asaf supplies a real CINC export**; skip it until then. Files: `apps/hoa/src/lib/properties/import.ts`, `apps/hoa/src/app/(dashboard)/properties/import/`, `packages/workflows/src/approvals/`.

Manual checks that need no code: BL-061 (Resend keeps our Message-ID), BL-086 (a vendor COI reply reaches the inbox), the BL-051 Safari print check, and a browser pass on the new convert menu, composer and billing banner.
- **BL-108 Rebalance the per-plan AI budget before PRICING_V2 goes on (Done 2026-10-20: implemented behind PRICING_V2, off, so nothing changes today; decision docs/decisions/2026-10-20-ai-spend-ceiling.md):** under the "every cap saturated" 30% rule, Essentials is left with 0 Copilot questions a day and Complete exceeds 30%. An Opus advisor is reviewing (realistic-use model plus an org monthly AI spend ceiling). The Essentials/Complete numbers for meeting_summary and ask_community are PROVISIONAL until then.
  - **Built:**
    - **Caps.** Per-band Copilot and meeting-summary caps for new-plan orgs (`perOrgByPlanBand` in `ai-limits.ts`; own buckets, never `board_ai`). Copilot is 10/15/20/30 a day on Essentials and 25/40/60/100 on Complete. Summaries are 2 a day on Essentials and 3 on Complete.
    - **Sizing test.** "Heavy-use month ≤ 20% of price" is tested at every door count from 1 to 2,000. It replaces the "≤ 30% saturated" test. A simulated all-caps-hit month with the meter on stops at 30% (trials at $5).
    - **Monthly spend meter.** `ai-spend.ts` meters this calendar month (UTC), with a 60-second cache. It is wired into `checkAndRecordAiUsage` / `requireAiQuota` through `loadAiBudget`. At 20% the board gets an FYI email. At 25% resident-facing and automatic AI is refused (429 `spend_ceiling`), and the board gets a banner and an email. At 30% board AI is refused too, until the 1st. The board emails go through the guarded `sendEmail` to board-role members, once per level per month. If the meter can't be read, the per-bucket caps still apply and AI is not blocked.
    - **Kill switch.** `AI_PLATFORM_KILL_SWITCH` makes every metered AI call return a friendly 503 `ai_paused`.
    - **Platform alert.** The daily Inngest job `ai-spend-alert` emails `AI_SPEND_ALERT_TO` when spend passes $50/day. There are now 22 functions.
    - **Meeting-summary cost check.** The model sees 30k characters, not the route's 500k cap, so the estimate stays $0.0024.
  - **Owner:**
    - **Index.** Apply `docs/specs/2026-10-20-audit-log-ai-index.sql` only if the meter is slow after the flip. It is the same index as perf-indexes item 9.
    - **Env.** Set `AI_SPEND_ALERT_TO` in Vercel production.
  - **Follow-ups:**
    - **Kill switch coverage.** It does not cover unmetered model calls: the manual inbox "Draft a reply", background jobs and embeddings.
    - **Re-derive estimates.** Re-derive the per-call estimates from `ai_runs` within 30 days of launch.
    - **Marketing.** Publish the real caps.
- **BL-112 Meter every AI call (Done 2026-10-20: AI_PLATFORM_KILL_SWITCH enforced in packages/ai guard for all 19 clients, embeddings and direct fetches; manual inbox draft and 8 board actions now draw on board_ai; job/embedding usage counted in ai.usage.job.*/ai.usage.embed and included in the daily spend alert):** model calls that skip `requireAiQuota` aren't counted, aren't capped and ignore `AI_PLATFORM_KILL_SWITCH`: the inbox's manual "Draft a reply", background jobs and embeddings (about 19 OpenAI client sites). Route them all through a single metered and kill-switchable client wrapper. User-triggered calls count against the right bucket; jobs and embeddings get their own platform-level counters.
- **BL-108 Rebalance the per-plan AI budget before PRICING_V2 goes on:** under the "every cap saturated" 30% rule, Essentials is left with 0 Copilot questions a day and Complete exceeds 30%. An Opus advisor is reviewing (realistic-use model plus an org monthly AI spend ceiling). The Essentials/Complete numbers for meeting_summary and ask_community are PROVISIONAL until then.
- **BL-109 Guard-held sends everywhere (Done 2026-10-20: resident-notify, vendor COI, the communications resend path, the monthly board report and recurring-event alerts all finish via finalSendStatus; held rows are `suppressed` and never offered for retry; a held alert day still counts toward the BL-056 retry cap; the inbox reply draft (mailbox-send) keeps `failed` + the guard message, since drafts have no held status):** apply `finalSendStatus` (packages/observability/src/send-status.ts) to the resident-notify and vendor-COI flows and the resend path in communications send.ts, so a send the outbound guard holds for every recipient reads "held by safety guard", not "failed".

## Ranked open work — round 2 (2026-10-20)

**Source:** `docs/research/2026-10-20-next-wins.md`. It covers the board complaints with URLs, the gap analysis against the routes and guides, and the "Partly done" leftovers. All ten need **no migration** and no owner keys. Each is sized for one worktree agent. Highest value first.

1. **BL-113 ARC decision clock. (Done 2026-10-20: setting, chips, overdue banner, digest)** Per-association "decide within N days" setting in `associations.compliance_settings`, a days-left chip on /arc, due-soon and overdue lines in the daily digest, and a deemed-approval warning. Pain: late ARC decisions get deemed approved. Effort S, score 3.60. Files: `apps/hoa/src/lib/arc-review/clock.ts` (new), `apps/hoa/src/app/(dashboard)/arc/`, `packages/jobs/src/daily-digest.ts`.
2. **BL-114 Payment receipt email to the owner when the board records a payment (Done 2026-10-20; OFF by default — Settings → Resident payments → "Email owners a receipt when we record their payment"; plus a per-payment Send receipt on Dues that works with the setting off).** A resident-notify `payment_recorded` event: guarded, idempotent per payment, respects `email_opt_in`. Pain: Zelle and check payment disputes. Effort S, score 2.70. Files: `apps/hoa/src/lib/resident-notify/`, `apps/hoa/src/lib/assessments.ts`.
3. **BL-115 Board activity log. (Done 2026-10-20: /settings/activity with audited CSV export)** /settings/activity over the existing `audit_log`: filters, plain-language labels, metadata allowlist, audited CSV. Check `audit_log` RLS first. Pain: lost records at turnover and self-dealing suspicion. Effort S–M, score 2.27. Files: `apps/hoa/src/app/(dashboard)/settings/activity/` (new), `apps/hoa/src/lib/audit/` (new).
4. **BL-116 Motion log across meetings. (Done 2026-10-20: /meetings/motions, CSV export, ⌘K motions)** /meetings/motions flattens `hoa_meeting_minutes.motions`, with filter, search, CSV, ⌘K results and approved-only display for residents. Pain: secretaries hunting past motions through PDFs. Effort S, score 2.40. Files: `apps/hoa/src/lib/meetings/motions.ts` (new), `apps/hoa/src/lib/search/records.ts`.
5. **BL-117 Board turnover kit. (Done 2026-10-20: /settings/handover)** /settings/handover, a live checklist:
   - access and roles, with remove or invite successor;
   - person-bound connections (mailbox, Plaid, Zelle);
   - open work and expiring COIs;
   - the data export;
   - a printable state-of-the-association page.

   Pain: "HOAs run on oral tradition." Effort M, score 1.60. Files: `apps/hoa/src/app/(dashboard)/settings/handover/` (new), `apps/hoa/src/lib/handover/` (new).
6. **BL-118 Meeting notice to owners with a calendar invite.** "Send notice" on a scheduled meeting prefills the composer and adds an `.ics` file. It also warns when the date is inside the state minimum notice: FL § 720.303(2)/720.306, CA § 4920, TX § 209.0051, and the bylaws for GA. Write `notice_posted_at` only behind the BL-050 flag. Pain: short notice voids decisions. Effort M, score 1.50. Files: `apps/hoa/src/app/(dashboard)/meetings/[id]/MeetingActions.tsx`, `apps/hoa/src/lib/meetings/notice-law.ts` (new), `apps/hoa/src/lib/ics.ts` (new).
   - **Status:** Done (5321bbed), live in prod.
7. **BL-119 Board task list. (Done 2026-10-20: /tasks, My tasks card, digest)** /tasks over `meeting_action_items`, where `meeting_id` is nullable. Assign, due, done, make a task from a ticket or thread, overdue lines in the assignee's digest, and a dashboard card. Pain: burnout, one person carries everything. Effort M, score 1.20. Files: `apps/hoa/src/app/(dashboard)/tasks/` (new), `apps/hoa/src/lib/meeting-action-items.ts`, `packages/jobs/src/daily-digest.ts`.
8. **BL-120 Reserve snapshot. (Done 2026-10-20: dashboard card, board report section, funds card)** Reserve fund balance, year-to-date contributions vs budget, draws and a 12-month trend on the dashboard and in the monthly board report, from `funds` and `ledger_entries.fund_id`. Pain: underfunded reserves. Effort S–M, score 1.50. Files: `apps/hoa/src/lib/accounting/reserves.ts` (new), `apps/hoa/src/lib/dashboard/queries.ts`, `packages/jobs/src/monthly-board-report/run.ts`.
9. **BL-121 Year-end CPA package and 1120-H worksheet. (Done 2026-10-20: /accounting/reports/year-end zip, 1120-H worksheet, 1099 candidates)** A zip of TB, GL, statements, AR aging and bank recs, plus:
   - a 60%/90% test and 30% tax estimate labelled "not tax advice";
   - 1099-NEC candidates (≥ $600, with the W-9 on file flag).

   Board-only and audited. Ship by January. Pain: "HOA never filed taxes." Effort M–L, score 1.12. Files: `apps/hoa/src/app/(dashboard)/accounting/reports/year-end/` (new), `apps/hoa/src/lib/accounting/year-end/` (new).
10. **BL-122 Annual meeting quorum kit. (Done 2026-10-20: /meetings/[id]/quorum kit)** A printable sign-in sheet and per-home proxy forms from the voter roster, a proxy chase list, and a live quorum counter saved to `hoa_meeting_minutes.attendees`. No e-voting (that is BL-023, M2). Ship before the Q1 meeting season. Pain: annual meetings never reach quorum. Effort M–L, score 1.12. Files: `apps/hoa/src/app/(dashboard)/meetings/[id]/quorum/` (new), `apps/hoa/src/lib/meetings/quorum.ts` (new).

**Below the line:**
- Board and emergency contacts on the resident portal.
- Georgia statute adapter (BL-069 GA).
- Records-request deadline log. It needs a `tickets.category` value or a new table, so propose it for the next migration batch.

**Not code:** BL-099 slow pages (needs Asaf's Vercel logs) and BL-031 (needs a real CINC export).
- **BL-123 Next migration batch (M2-prep):** (1) widen `orgs_plan_check` to allow `essentials`, `complete`, `pilot` and `legacy_per_door`. **This blocks the PRICING_V2 flip**: billing-status writes fail with error 23514, exactly like the pre-M1 `monthly`/`annual` failure. (2) Fold the resident-meeting-notices function, the SMS consent guard and the inbound-auth column into numbered migrations, so the CI database matches prod after runbook sections C, D and E (update `tests/integration/security/resident-meetings.test.ts`). (3) A records-request ticket category (round-2 research). Write `migrations/0065_*.sql` plus a runbook section; CI-validate. *Status 2026-10-20:* (1) and (2) written as `migrations/0065_m2_prep.sql` + runbook Section H (CI-validated by the integration suite; owner applies via H1–H3). (3) built 2026-10-20 behind `RECORDS_REQUESTS_LIVE` (default off): `migrations/0066_records_requests.sql` (category `records_request` + `tickets.records_due_at`) + runbook Section I (I1–I3); resident form `/resident/records/new`, board view `/tickets/records` with FL § 720.303(5) / CA § 5210(b) deadlines (TX, GA and others: "check your bylaws"), digest lines, draft guide articles. Flip the flag and un-draft the two articles after the owner confirms I3.
- **BL-124 Refresh the Georgia statute snapshot before 2027-01-01 (deadline item):** SB 406 §§ 3–6 take effect 2027-01-01. The GA adapter refuses to serve the snapshot from that date (`@valid_until`), so GA law questions would show "not loaded" until it is refreshed. Steps: data/statutes/README.md "Georgia snapshot". Schedule this for mid-December 2026.

## Security review 2026-10-20 (today's merges)
- **SEC-H1 (High, fixing):** `runBidComparison` had no role gate and no org check on the RFP id. W23 read and returned another HOA's bids through the service role.
- **SEC-H2 (High, fixing):** `runComplianceCheck` had no role gate and no org check on the vendor id. W21 upserted a forged COI record into the vendor's org.
- **SEC-M1 (Medium, fixing):** board-only AI actions (state law, RFP draft, bids, compliance) lacked a role gate, so residents could drain `board_ai`. `chargeAiActionQuota` now fails closed for board buckets.
- **SEC-M2 (Medium, fixing):** spoofed From addresses can file contact updates while BL-105 is off. Inbox-filed email changes are refused until sender authentication is live.
- **SEC-M3 (Medium, fixing):** a stranger's PDF saved to Documents could become a citable governing document. This now requires explicit confirmation, and inbox-filed documents are excluded from AI retrieval otherwise.
- **SEC-L1/L4 (Low, fixing in the unapplied 0065/0066):** the SMS consent trigger could be bypassed through `user_id`; residents could set `records_due_at` directly.
- **SEC-L2/L3/L5/L6 (Low, fixing):** START overrides a portal revoke; the calendar LOCATION came from query params; email bodies were unfenced in W32; the analytics referrer was unscrubbed.
- **SEC-L7 (Low, done 2026-10-20: pdf-parse replaced with pdfjs-dist, with caps):** `pdf-parse` 1.1.4 bundles unmaintained pdf.js 1.10 and now parses PDFs from anyone. Move to maintained `pdfjs-dist` with `isEvalSupported:false` and a timeout.
- **Not reviewed in this pass:** the billing/Stripe webhook diff, the W30 adapters and zip parser, the jobs package, `communications/audience.ts` `specific_units` scoping.
- **SEC-L8 (Low, done 2026-10-20):** W30 source fetchers read `res.text()` / `res.arrayBuffer()` with no byte cap. `sources/http.ts` now streams every body through `readBodyCapped`: a declared Content-Length over the cap is refused unread, and a stream that passes the cap is cancelled (aborting the request) with `ResponseTooLargeError`. Caps are set per getter: 5 MB for FL/TX HTML pages, 40 MB for CA pubinfo range reads. Tests use a fake endless stream.
- **SEC-L9 (Low, done 2026-10-20):** platform-admin invites (`createTenant`'s initial admin, `inviteOrPromotePlatformAdmin`) called `inviteUserByEmail` without the outbound guard. Both now pass `guardRecipients` (tenant invite also `fetchOrgSandbox` for the new org, fail-closed), like `inviteMember`. A held address gets no account, membership, grant or email; `createTenant` returns `inviteHeld`. Log lines carry counts and ids only. Tests: `apps/hoa/src/lib/platform-admin-invite-guard.test.ts`.
- **SEC-L10 (Low, mitigated 2026-10-20, no migration):** `customer.subscription.updated` has no row lock, so two concurrent deliveries can both pass the ordering check. After its audit row, each delivery now reconciles: it re-reads the newest applied audit row and re-applies that state (plan under M1 via 0064's checkout function with a deterministic `<newest>:reconcile:<event>` id; `doors_count`) wherever the org disagrees. A duplicate redelivery reconciles too, so a failed reconcile is retried by Stripe. Residual: reconcile writes racing each other; the next event corrects it. A real fix is a SQL function with `pg_advisory_xact_lock` on the subscription (fold into a future billing migration). Tests: "concurrent deliveries" in `packages/billing/src/subscription-events.test.ts`.
- **SEC-L11 (Low, owner action):** the customer portal's quantity setting. The code creates no portal configuration (sessions use the dashboard default), so this is a dashboard setting: owner-action text in `docs/specs/2026-10-20-pricing-v2-rollout.md` ("Owner action (security review 2026-10-20…)"), for the coordinator to add to `docs/owner-actions.md`.
## Ranked open work — round 3 (2026-10-20)

**Source:** `docs/research/2026-10-20-round3.md`. That file has:
- the 2026 pain points, with URLs;
- inbox and communications Phase B;
- the re-checked "Partly done" items;
- the resident-side gaps;
- the new-HOA first-week walk-through.

**Do first: BL-114 (payment receipt to the owner).** It is the only round-2 item still open. It needs no migration and takes about a day.

**(A) No migration.** Each is sized for one worktree agent. Highest value first.

1. **BL-125 Homes added before the association exists are never billed (bug).**
   - **Status:** Done (ce06406e), live in prod.
   - **Pain:** `/onboarding` creates no association, so `/properties/new` and the import write `units.association_id = NULL`. `setUpAssociationCore` never adopts those units, and dues generation filters on `association_id`, so the homes are silently skipped. The guide says they "can be billed straight away".
   - **Build:**
     - Create the association during onboarding.
     - Adopt null-association units when the org's first association is created.
     - An integration test: add a home, set up dues, generate; the home is billed.
   - **Files:** `apps/hoa/src/app/onboarding/actions.ts`, `apps/hoa/src/lib/association-setup.ts`, `apps/hoa/src/lib/properties/lot.ts`, `tests/integration/`.
   - Effort S, value very high, score 6.0.
2. **BL-127 One setup checklist that tells the truth.**
   - **Status:** Done (ce06406e), live in prod.
   - **Pain:** the two checklists (4 steps and 6 steps) disagree. "Invite the board" is ticked by inviting a resident. Association and books, Zelle, bank, budget and reminders are missing. `start-board-admin.md` still says "contact support" to import.
   - **Build:**
     - One shared model, with board roles only for the invite step.
     - The missing steps, each linked to its page.
     - Optional steps don't block dismissing the card.
     - Guide fixes.
   - **Files:** `apps/hoa/src/lib/dashboard/setup-checklist.ts`, `apps/hoa/src/lib/inbox/queries.ts`, `apps/hoa/src/app/onboarding/setup/`, `apps/hoa/content/guide/setup/*.md`.
   - Effort S, score 3.6.
3. **BL-126 Opening-balance cutover wizard.**
   - **Status:** Done (6ca4bd79), live in prod.
   - **Pain:** the import screen says "enter opening balances in Accounting", but there is no screen to enter them. Treasurers taking over from a manager can't make the books match the bank.
   - **Build:** `/accounting/opening-balances`:
     - cutover date;
     - bank and reserve balances per fund;
     - a per-home balance CSV with a dry run;
     - equity as the plug;
     - one opening JE plus per-home charges, **proposed through /approvals**, idempotent per date.

     The generic CSV covers most of what BL-031's CINC aging import wanted.
   - **Files:** `apps/hoa/src/app/(dashboard)/accounting/opening-balances/` (new), `apps/hoa/src/lib/accounting/opening-balances.ts` (new), `packages/workflows/src/approvals/`, `properties/import/RosterImportSteps.tsx`.
   - **Verify first:** the approvals executor takes a multi-line JE.
   - Effort M–L, score 1.5.
4. **BL-129 Residents see and answer violations on their own home.**
   - **Status:** Done (9a1d5919), live in prod.
   - **Pain:** own-home violations are read-only rows that don't link anywhere (`resident/page.tsx:353-355`). Disputes go to email, and selective-enforcement claims follow.
   - **Build:** a detail page (rule, letters, cure-by date, photos the board marked shareable), a reply thread, and "I've fixed it — board to confirm".
   - **Files:** `apps/hoa/src/app/resident/violations/[id]/`, `apps/hoa/src/lib/resident-dashboard.ts`, `apps/hoa/src/app/(dashboard)/violations/[id]/`.
   - **No migration:** 0063's `hoa_violations_select` already covers own-property reads. **Verify first** which thread table the reporter view uses.
   - Effort S–M, score 1.6.
5. **BL-128 Invite every owner at once, and see who hasn't joined.**
   - **Status:** Done (9a1d5919), live in prod.
   - **Pain:** invites go out one at a time, with no pending list and no resend (`members-invite-board.md`). Imported owners never get access, and unlinked accounts hit a dead end.
   - **Build:**
     - Bulk "Invite owners to the portal": dry-run counts, guarded and throttled, and each account is linked to its unit on accept.
     - A pending list with resend.
     - Audited as `members.invite_bulk`.
   - **Files:** `apps/hoa/src/lib/members.ts`, `apps/hoa/src/app/(dashboard)/settings/members/`, `apps/hoa/src/app/(dashboard)/properties/`.
   - **Verify first:** where a pending invite is recorded.
   - Effort S–M, score 1.6.
6. **BL-130 Statute-drift guard on fines and collection letters.**
   - **Pain:** newer statutes void board rules, so fines and fees collapse.
   - **Build:** a pure per-state check on the approval card and in the letter preview. It runs before a fine or collection letter is approved and returns blocking or warning findings with the citation:
     - **CA AB 130:** the $100 cap without a health-or-safety finding; no late fees or interest on fines; no fine after a cure before the hearing.
     - **TX § 209.0064 and § 209.0062:** the 45-day certified notice before collection fees; the payment-plan offer.
     - **GA SB 406:** itemized notice before attorney fees, from 2026-07-01; dues are paid first.
     - **FL § 720.305:** a warning when a fine has no hearing recorded.

     Cite only W30-loaded text.
   - **Files:** `apps/hoa/src/lib/compliance/statute-drift.ts` (new), `apps/hoa/src/lib/collections/`, `apps/hoa/src/lib/violations/`, `packages/workflows/src/approvals/`.
   - Effort M, score 1.4.
   - **Done (no migration):** `apps/hoa/src/lib/compliance/statute-drift.ts` (`checkFine`, `checkCollectionsLetter`), every quote checked word for word against `scripts/fixtures/state-law` (new fixture `tx-prop-209-0062-2026.txt`). Gated in `updateViolationStatus` (move to Fined), `updateViolation` (raising a levied fine), `saveLetterToApprovals` and the `recordLetterPrinted` print gate. Blocks need a per-finding override reason code, written to `audit_log` (`statute_check.override`, codes and ids only) before the step. Rules: CA § 5850(c)/(d) cap block, (c)(1), (e), § 5855(g) warnings; FL § 720.305(2) $100 block, $1,000 aggregate and committee warnings, § 720.3085(3)(d) attorney-fee block on letters; TX § 209.0064(b) collection-fee block, § 209.0062(a) payment-plan block, § 209.006(a)/(e) fine warnings; GA SB 406 § 7 attorney-fee block (from 2026-07-01), § 44-3-223 fine warning. Omitted: GA dues-first payment order (SB 406 § 2, in force 2027-01-01, not loaded); CA/FL cure-before-hearing (needs BL-133's hearing record); TX § 209.0063 payment order.

**(B) Needs a migration. Batch all four into one `migrations/0067_*.sql`** plus a runbook section. CI validates it, Asaf applies it, and each feature ships behind a flag until he confirms.

7. **BL-131 Compliance calendar for statutory deadlines.**
   - **Pain:** fixed-date obligations that a volunteer board doesn't track:
     - GA SB 406: an association that fines must register with the Secretary of State by **2027-01-01**, or it can't fine, lien or foreclose.
     - FL: the SIRS and milestone backstop on 2026-12-31.
     - CA SB 326 balcony inspections.
     - TX: the TREC management certificate.
   - **Build:** `/compliance` with per-state seeded obligations the board confirms, plus evidence document, acknowledger, digest and board-report lines, and an overdue banner.
   - **Schema:** new `compliance_obligations` (code, citation, due_on, recurrence, status CHECK, evidence_document_id, completed_at/by; board-only RLS).
   - **Files:** `apps/hoa/src/app/(dashboard)/compliance/` (new), `apps/hoa/src/lib/compliance/` (new), `packages/jobs/src/daily-digest.ts`, `packages/jobs/src/monthly-board-report/run.ts`.
   - **Stopgap:** if 0067 isn't applied by November, ship a no-migration GA registration digest warning.
   - **Stopgap shipped (2026-10-20, no migration):** `apps/hoa/src/lib/compliance/deadlines.ts`, a dashboard "State law deadlines" card, a daily-digest countdown line, and a "Mark as done" acknowledgment HMAC-signed under `compliance_settings.compliance_deadline_acks`. Guide: `state-law-deadlines`.
     - **Included, from fixtures:** GA O.C.G.A. § 43-17A-2 (SB 406 § 2, effective 2027-01-01 per § 9(a); `scripts/fixtures/state-law/ga-sb406-2026-registration.txt`). Correction to the pain line above: registration applies to every GA owners' association (§ 43-17A-1(6)), not only those that fine. The Secretary of State says filing opens *on or after* 2027-01-01. Also TX Prop. Code § 209.004, a standing obligation with no date, so it is on the card only (`tx-prop-209-004-2026.txt`).
     - **Omitted:** FL milestone and SIRS, because § 553.899(3)(a) covers condominium and cooperative buildings only (ch. 718/719, not ch. 720). CA § 5551 balconies, because the section text isn't in our fixtures (leginfo is behind a bot challenge) and the research's date (2026-01-01) has already passed.
     - The full BL-131 (0067 table, `/compliance`, evidence, board report) is still open. When it lands, migrate these acknowledgments into rows.
   - **Built behind `M3_APPLIED` (2026-10-20, `migrations/0067_m3_batch.sql` part 5):** `compliance_deadlines_done` (org, association, code, done_at, done_by; board/admin RLS, one row per association + code). With the flag on, "Mark as done" writes a row, the dashboard and digest read rows plus any verified signed acknowledgment, and the dashboard copies acknowledgments into rows lazily (`apps/hoa/src/lib/compliance/done.ts`). `/compliance`, evidence and the board-report line are still open.
   - Effort M, score 1.6.
8. **BL-132 Insurance and fidelity-bond tracker.**
   - **Pain:** premiums are up nearly 3× with new exclusions (LA Business Journal, 2026-10-12). CA § 5806 requires fidelity coverage of at least reserves plus 3 months, including funds-transfer fraud.
   - **Build:**
     - Policies with term, premium, deductible and exclusions.
     - A renewal comparison with last year, and reminders at 90, 60 and 30 days.
     - A CA fidelity check against the BL-120 reserve balance.
     - An owner-facing summary, and an optional HO-6 loss-assessment notice through the composer.
   - **Schema:** new `insurance_policies`.
   - **Files:** `apps/hoa/src/app/(dashboard)/insurance/` (new), `apps/hoa/src/lib/insurance/` (new), `apps/hoa/src/lib/accounting/reserves.ts`, `packages/jobs/src/daily-digest.ts`, the BL-117 handover.
   - **Built behind `M4_APPLIED` (2026-10-20, `migrations/0068_m4_batch.sql` part 1; 0067 had no room):** `insurance_policies` (kind CHECK incl. fidelity/crime bond and workers' comp, carrier, policy number, limit, deductible, premium, effective/expiry, `document_id` → `hoa_documents` with a same-org trigger; board/admin-only RLS). `/insurance` (list, add/edit/delete, document link), a coverage check (`apps/hoa/src/lib/insurance/model.ts`) quoting only fixture text: FL § 720.3033(5) fidelity bond (and the waiver), CA § 5300(b)(9) annual-report summary kinds; CA § 5806 is **not** in the fixtures, so the fidelity minimum says "check your governing documents"; other states the same. Expiry reminders at 90/60/30 days and expired on the dashboard card and in the board's daily digest. Nav item appears with the flag. Still open: renewal comparison, the BL-120 reserve-balance fidelity comparison, owner-facing summary, HO-6 notice, handover link. Guide `insurance-policies` (draft until the flip).
   - Effort M–L, score 1.2.
9. **BL-133 Fine hearing workflow (FL § 720.305 and CA AB 130), with a resident hearing request.**
   - This is the first slice of BL-030. The product blocks levying a fine until these steps are recorded:
     1. notice at least 14 days ahead;
     2. a committee of at least 3 non-directors, with a conflict check;
     3. the hearing and decision;
     4. findings within 7 days;
     5. payment due no earlier than 30 days later.
   - Each step has a timer in the digest. The resident can request a hearing or submit a statement from the BL-129 page.
   - **Schema:** new `violation_hearings`. Residents can read their own and insert a request.
   - **Files:** `apps/hoa/src/lib/violations/hearing/` (new, per-state rules with full tests), `apps/hoa/src/app/(dashboard)/violations/[id]/`, `apps/hoa/src/app/resident/violations/[id]/`.
   - **First part built behind `M4_APPLIED` (2026-10-20, `migrations/0068_m4_batch.sql` part 2):** `violation_hearings` (one per violation: request time/author/statement, hearing day + time + place, panel jsonb of names marked board/member, notice-sent day, outcome upheld/reduced/dismissed, decided/findings/payment-due days; shape CHECK; same-org trigger; board/admin-only RLS) and `request_violation_hearing()` (SECURITY DEFINER; own-home predicate from 0063, open violations only, never writes board columns). Board: a Fine hearing card on `/violations/[id]` with the per-state checklist (`apps/hoa/src/lib/violation-hearings/rules.ts`; FL § 720.305(2)(b)–(f), CA § 5855(a)–(c), (f), (g), all verbatim from fixtures; other states "check your governing documents") and "Draft hearing notice" into the composer (`?from=hearing-notice&property=`; the board sends through the guarded send). Resident: "Request a hearing" with an optional statement on the BL-129 page; the date and place show once the notice is recorded as sent. BL-130: `checkFine` reads the hearing, so `fl_hearing_committee` and `ca_hearing_not_recorded` resolve when a hearing meets the rule, and a hearing that did not approve the fine blocks it (`fl_hearing_no_fine`, `ca_hearing_no_fine`). Not yet: a hard block on levying a fine before the steps are recorded, the conflict check against the board roster, digest timers, cure-before-hearing. Guides `violations-fine-hearing`, `resident-request-hearing` (drafts until the flip).
   - Effort L, score 0.88; value very high (the named differentiator).
10. **BL-134 Inbox Phase B core.**
    - **Build:**
      - B1: `first_response_at` and SLA due, snooze, category routing, and a "waiting on us > 3 days" digest line.
      - B3: harden `inbox_thread_links`. A same-org existence trigger closes today's any-UUID hole, plus `source_message_id`.
      - B5: `hoa_documents.source_inbox_attachment_id`, with "Filed to library" on the email.
    - **Note:** 0065 did **not** include inbox Phase B, despite the groomed table above and the comments in `apps/hoa/src/lib/inbox/attachment-file-rules.ts:6` and `apps/hoa/src/lib/bill-scan/proposal.ts:45`; fix those comments.
    - **Flag:** `M3_APPLIED` (one flag for all of 0067; replaces the planned `INBOX_0067_APPLIED`).
    - **Core built behind `M3_APPLIED` (2026-10-20, `migrations/0067_m3_batch.sql` parts 2–4):** `first_inbound_at` / `first_response_at` (trigger-maintained reply clock, shown on the thread), `snoozed_until` (Snooze control, "Snoozed" chip; a new inbound email wakes the thread), the `inbox_thread_links` same-org existence trigger (23503), and `hoa_documents.source_inbox_attachment_id` ("Filed to library" on the email, "filed from an email" on the document). Stale "0065" comments fixed. Still open: `sla_due_at`, category / priority / classifier routing, `source_message_id`, the "waiting on us > 3 days" digest line.
    - Effort M–L, score 0.80.

**Below the line:**
- Election planner and e-ballots: TX SB 2629, CA AB 2159, the FL petition (BL-023 and beyond; L, legal risk).
- Comms Phase B B1/B2 (`merge_values` and urgency columns), a 0067 ride-along if there is room.
- BL-060 inbox participant search RPC.
- Resident preferences UI (mail, language, quiet hours; the columns exist).
- Household or tenant add as an approval request.
- Board and emergency contacts on the portal.
- Manual bank account and statement CSV.
- Per-home dues rates (migration).
- Outlook mailbox (Azure keys).
- A second approver when a vendor's remit-to details change (with BL-039).
- FL condo 30-day website posting (with BL-038).
- **BL-135 Single-member invite through the outbound guard:** `inviteMember` (one at a time) still sends the Supabase invite without the outbound guard. The bulk path (BL-128) uses the guard. Route the single path through it too. **Done:** `inviteMember` now checks `fetchOrgSandbox` + `guardRecipients` before `inviteUserByEmail`; a held address gets no account, email or membership (`members-invite-guard.test.ts`).
- **BL-136 Exempt opening-balance charges from late fees:** opening charges get a "due on" date (default today + 30 days) so the nightly 5% late-fee job doesn't hit carried-over balances on day one. The cleaner fix is a marker column (e.g. `assessments.source = 'opening_balance'`) that the late-fee job skips. Batch it into the next migration. **Built behind `M3_APPLIED`** (`migrations/0067_m3_batch.sql` part 1): the executor marks its charges and `findUnchargedDefaults` skips them once the flag is on.

## Security review #2 2026-10-20 (a094c25d..3bcb3cce)
- No Critical or High findings. Prior fixes verified holding: the ratchet, billing admin-only, event-alert scoping, the records_due_at guard, the orgs column guard, invitation gates.
- **SEC-N1 (Medium, fixing):** owner-invite Revoke could delete another tenant's pending account.
- **SEC-N2 (Medium, owner + fixing):** until 0063 is applied, any member can insert `audit_log` rows, which can forge the webhook ordering clock or violation-response links. The real fix is applying 0063 (OA-1). A code mitigation is in progress.
- **SEC-N3–N8, L6 (Low, fixing):**
  - N3: opening-balance double proposal race;
  - N4: bulk invite attaches existing accounts and reveals that they exist;
  - N5: hearing request on deleted or un-noticed violations;
  - N6: forgeable attribution columns;
  - N7: signing secret falls back to the service key;
  - N8: approvals w18 kind check;
  - L6: the ratchet credits role reads.

## Ranked open work — round 4 (2026-10-21)

**Source:** `docs/research/2026-10-21-round4.md`. It has:
- the pain points, with URLs;
- today's leftovers, checked against the code;
- the statute text from `scripts/fixtures/state-law`;
- a first-30-days map.

Migrations through 0068 are applied, and every flag is on. Highest value first; the ranking weighs budget season (now) and Q1 annual meetings.

**Migration batch M5:** BL-137, BL-143 and BL-145 go into one `migrations/0069_m5_batch.sql` (BL-141 was built without a migration, 2026-10-21), with a runbook section and an `M5_APPLIED` flag. CI validates it, Asaf applies it, and the code ships behind the flag. Every other item needs no migration.

**Prerequisite (S, no migration):** load CA Civ. Code §§ 5605, 5610, 5615 and 5806 (from the pubinfo zip) and TX Prop. Code §§ 209.0051 and 209.00592–.00594 into fixtures and W30. Until then, CA and TX increase and election rules read "check your governing documents".

1. **BL-137 Dues-rate schedule and assessment-increase notice.** Migration: **yes (M5)**. Effort M. Score 1.33, with a timing override.
   - **Status:** Built behind M5_APPLIED (5cc0d6c3). Remaining: owner applies 0069 (runbook Section L), then flip the flag.
   - **Pain:** insurance is pushing 2026 dues up 5–15% (R1). CA increase caps and notice windows are commonly missed (R3).
   - **Today:** dues are a flat amount typed in at every billing run (`apps/hoa/src/lib/assessments.ts:30-60`).
   - **Build:**
     - A `dues_rates` table: association, amount, frequency, `effective_from`. Leave room for a future per-home share.
     - Billing reads the rate in effect.
     - "Change dues for next year", with the % change shown.
     - An increase notice to owners through the composer (guarded).
     - Per-state checks: CA § 5605 20% / 5% caps and § 5615 30–60-day notice, once loaded; FL § 720.303(2)(c)2 assessment statement (fixture). Other states: "check your bylaws".
     - Money changes go through /approvals.
   - **Files:** `apps/hoa/src/lib/assessments.ts`, `apps/hoa/src/lib/dues-rates/` (new), `apps/hoa/src/app/(dashboard)/dues/`, `packages/jobs/src/` (generation).
   - **Status (2026-10-21): built behind `M5_APPLIED` (false), migration `0069_m5_batch.sql` part 1, runbook Section L.** `dues_rates` (association, `effective_from`, per-home `amount_cents`, monthly/quarterly/semiannual/annual, optional `budget_id`, note; `basis` + `unit_type_amounts` reserved for per-type/per-share). RLS: board/admin write; a resident reads only today's rate for their own home's association (SECURITY DEFINER id helper); same-org/association trigger (23503); `created_by` forced (SEC-N6). App: `/dues/rates` (schedule, add/remove upcoming, % change, state findings, Draft owner notice → composer, nothing auto-sent); Generate dues and Add a due pre-fill from the rate in effect, a different amount writes `dues_rate.override` to audit_log; BL-138 kit's last step opens `/dues/rates?budget=` pre-filled from assessment income ÷ homes. Law (fixtures only): GA Art. 6 has no notice/cap/vote for an increase (§§ 44-3-230(a), 44-3-232.1(a)(5), 44-3-225(a), 44-3-235(a) quoted); FL § 720.303(2)(c)2, § 720.308(1)(a); CA § 5605(a)/(b) from the pubinfo fixture (20% cap check), § 5615 not loaded; TX § 209.0058(a)(4), § 209.0051 not loaded. Not built: money changes through /approvals, packages/jobs generation (no job bills dues today). Guide `dues-rate-schedule` (draft until the flip).
2. **BL-138 Budget adoption kit.** Migration: no. Effort M. Score 1.60.
   - **Status:** Done (1f4c1634), live in prod.
   - **Pain:** FL § 720.303(2)(c)2 (fixture): an assessment may not be levied unless the meeting notice says assessments will be considered; special assessments need 14 days plus posting. CA § 5300(a) (fixture): the budget report goes out 30–90 days before fiscal year end, a window that is open now for calendar-year associations.
   - **Build:**
     - An "adopts budget or assessments" flag on a meeting (agenda or `compliance_settings`, no new type), checked in `notice-law.ts`.
     - A CA § 5300 window countdown on the dashboard and in the digest.
     - "Adopt budget" proposes next year's rate into BL-137. Until M5 lands, it pre-fills the billing amount.
     - The R2 bad-debt line in the first draft.
   - **Files:** `apps/hoa/src/lib/meetings/notice-law.ts`, `apps/hoa/src/app/(dashboard)/accounting/budget/`, `apps/hoa/src/lib/budget-notice/`, `packages/jobs/src/daily-digest.ts`.
3. **BL-139 FL director certification tracker.** Migration: no. Effort S. Score 2.70.
   - **Rule:** § 720.3033(1)(a) (fixture): a certificate within 90 days of election or appointment, valid for 4 years, plus 4 hours of CE a year under 2,500 parcels. A director who misses it is suspended (R6).
   - **Build:**
     - Per-director elected-on and certificate dates, with the certificate filed to Documents.
     - A 90-day countdown on the dashboard and in the digest.
     - Added to the handover kit and the state deadlines card.
   - **Storage:** `compliance_settings`. Verify the `hoa_documents` type list; ride along in M5 if a new type is needed.
   - **Files:** `apps/hoa/src/lib/compliance/director-certs.ts` (new), `apps/hoa/src/components/dashboard/ComplianceDeadlinesCard.tsx`, `apps/hoa/src/app/(dashboard)/settings/handover/`.
   - **Status (2026-10-21): built, no migration.** Signed records under `associations.compliance_settings.director_certifications[user_id]` (HMAC, same secret chain as BL-131) on the org's first FL association by name; certificate link is an https or `/documents` URL (no `hoa_documents` type change). Members card with dates, link and "Mark certified" (audit_log ids only), handover pill, dashboard "Director certification" card and digest block at ≤ 30 days / overdue / 4-year expiry. Fixture check: current (1)(a) accepts only the educational certificate (no written-affidavit option); (1)(c) 5-year retention; CE hours (4 / 8) shown as text, not tracked. Guide `director-certification`.
4. **BL-140 Fine hearing hard gate (BL-133 leftovers).** Migration: no. Effort M. Score 1.60.
   - **Status:** Done (groomed 2026-10-21 round 5). Hard gate, panel check and digest timers: 99e2d3fa, live since 1d79d562. Cure-before-hearing: cd9ff658, merged 9a9b2bce on claude/quality-oracle (in the 2026-10-21-1930 release note, not yet in prod 83848ece): the resolved-before-hearing offer on the hearing card, FL § 720.305(2)(e) / CA § 5855(c) quotes, board-only `cancelHearingAfterCure`, audited with a reason code. Other states get "check your governing documents". Remaining: none.
   - **Today:** Fined with no hearing recorded is only a warning (`ca_hearing_not_recorded`, `fl_hearing_committee` in `apps/hoa/src/lib/compliance/statute-drift.ts`).
   - **Build:**
     - Make it a block in FL and CA, with the existing audited override.
     - Cross-check the panel against `org_members` board roles, not self-tagged roles.
     - Digest timers: notice ≥ 14 days, findings within 7 days, payment due ≥ 30 days.
     - Cure-before-hearing.
   - **Files:** `apps/hoa/src/lib/compliance/statute-drift.ts`, `apps/hoa/src/lib/violation-hearings/rules.ts`, `packages/jobs/src/daily-digest.ts`.
5. **BL-141 Election planner, paper-first.** Migration: **yes (M5)**. Effort L. Score 0.60, with a timing override for Q1 annual meetings.
   - **Pain:** quorum failures mean no elections (R5); CA elections are expensive (R8).
   - **Build:**
     - An `elections` table and an `election_candidates` table.
     - A CA timeline from the fixture: § 5115(a) nomination notice 30 days before the deadline; (b) general notice 30 days before ballots; (c) ballots 30 days before voting; (d) a reconvened 20%-quorum meeting with 15 days' notice; § 5120(b) results within 15 days.
     - CA inspector record and double-envelope ballot print kit.
     - FL § 720.306(9) (fixture): no election when candidates ≤ vacancies; a delinquency check of candidates against the ledger; 60-day challenge window.
     - TX and GA: "check your bylaws" until loaded.
     - Ties into the quorum kit.
     - No e-voting.
   - **Files:** `apps/hoa/src/lib/elections/` (new), `apps/hoa/src/app/(dashboard)/meetings/[id]/election/` (new), `apps/hoa/src/lib/meetings/notice-law.ts`.
   - **Status (2026-10-21): built, NO migration** (decision `docs/decisions/2026-10-21-election-planner-no-migration.md`; not in 0069, not behind `M5_APPLIED`). Signed record per meeting in `associations.compliance_settings.meeting_elections` (same HMAC chain as the BL-122 quorum kit; names, ids, dates and counts only — the ledger check is computed per load, board-only, never stored). `/meetings/[id]/election`: seats and dates, a per-state timeline worked back from the meeting day, candidates with the ledger on the nomination deadline, inspectors (CA) / tellers, results with plurality ranking and tie flag, CA quorum outcome and reconvened meeting; `/meetings/[id]/election/print`: ballot (no voter id), two-envelope labels, inspector record (CA) or tally sheet. Law (fixtures only, `lib/elections/law.test.ts` checks every quote): GA §§ 44-3-230(a)/(b), 44-3-228, 44-3-224(a)/(b), 44-3-235(a) (no nomination, secret-ballot, inspector, results or challenge rule in Art. 6 → bylaws); FL § 720.306(2), (5), (8)(b), (9)(a)/(b); CA §§ 5100, 5103, 5105(c)(1)/(d), 5110, 5115, 5120, 5125, 5130(b), 5145(a); TX § 209.0058(a)(2), (c), (d), (d)(3) (§§ 209.0051, 209.00592–.00594 not loaded → governing documents). Also: `notice-law.ts` now checks GA members' meetings (21 days annual / 7 special, § 44-3-230(a)). Meeting page "Board election" card; quorum kit links to it. Guide `election-planner` (draft).
6. **BL-142 Insurance renewal comparison and fidelity check (BL-132 leftovers).** Migration: no. Effort S–M. Score 1.60.
   - **Status:** Done (groomed 2026-10-21 round 5). Renewal comparison, fidelity vs funds, owner summary: 2f857986, merged dafb88a9, live (in 83848ece). HO-6 notice (composer prefill `?from=ho6-notice`, nothing auto-sent) and handover-kit insurance link: cd9ff658, merged 9a9b2bce on claude/quality-oracle (in the 2026-10-21-1930 release note, not yet in prod 83848ece). Remaining: none. CA § 5806 fidelity rule still waits on the CA fixture prerequisite above.
   - **Pain:** premiums are the main driver of dues increases (R1).
   - **Build:**
     - Premium, limit and deductible vs the prior policy of the same kind.
     - A numeric fidelity check vs the BL-120 reserve balance plus 3 months of dues. CA § 5806 only once it is loaded; FL § 720.3033(5) as today.
     - An owner-facing summary through the composer, which also feeds CA § 5300(b)(9).
     - An optional HO-6 notice.
     - A handover-kit link.
   - **Files:** `apps/hoa/src/lib/insurance/model.ts`, `apps/hoa/src/app/(dashboard)/insurance/`, `apps/hoa/src/lib/accounting/reserves.ts`, `apps/hoa/src/app/(dashboard)/settings/handover/`.
7. **BL-143 Accept-to-join and self-claim for unlinked owners.** Migration: **yes (M5)**. Effort M. Score 1.07.
   - **Status:** Built behind M5_APPLIED (groomed 2026-10-21 round 5). 0218dea9, merged 68f1ae91; the no-session guard 9f6d47cb and the test fix 83848ece. In prod since 83848ece with the flag off, so nothing shows. Remaining: Asaf applies 0069 (runbook Section L), then flip `M5_APPLIED`. The auth-callback auto-claim was not built and stays below the line (the code/address ask covers SEC-N4).
   - **Today:**
     - Homes are linked when the invite is sent (`apps/hoa/src/lib/owner-invites-actions.ts:196-219`).
     - An owner who already has an account is never attached (SEC-N4).
     - "No home linked to your account yet" is a dead end on 9 resident pages (`resident/page.tsx:100`).
   - **Build:**
     - An `owner_join_requests` table (claim by address or a board-issued code).
     - Board approval in /approvals.
     - Link on accept.
     - Replace the dead end with "Ask to join".
   - **Files:** `apps/hoa/src/lib/owner-invites*.ts`, `apps/hoa/src/app/auth/callback/route.ts`, `apps/hoa/src/app/resident/`.
   - **Status (2026-10-21): built behind `M5_APPLIED` (false), migration `0069_m5_batch.sql` part 3, runbook Section L (L-BL143a–c, L4).** Tables `owner_join_requests` (board/admin read; no write policy), `owner_join_codes` (board/admin only; SHA-256 only, single use, 30-day expiry in the app, ≤ 90 in the table; same-org trigger 23503; attribution trigger lets the board only revoke), `owner_join_attempts` (no policy). Functions: `owner_join_claim` (SECURITY DEFINER; address + ZIP (+ unit) or code; answers `sent` whether or not an address matched; 5 claims a rolling day per account, advisory-locked), `owner_join_my_status` (counts only), `owner_join_decide` (board/admin of the request's org, else 42501; approve = resident membership + ownership link (own → on-file email → new `join_request` row), reject needs a reason; audited, ids only). App: `/join` ("Ask to join"), the button on every resident "No home linked yet" (8 screens) and on `/onboarding`, Settings → Members → **Join codes** (make / cancel), `/approvals` **Requests to join** (who, which home, email-vs-owner-on-file check; Approve & link / Reject). No service role anywhere. Integration test `tests/integration/security/m5-join-requests.test.ts`; guide draft `members-ask-to-join`. Not built: auth callback auto-claim (the code/address ask covers SEC-N4 without it).
8. **BL-144 Bank statement CSV/OFX import and manual bank account.** Migration: no (verify the bank tables accept non-Plaid rows). Effort M. Score 0.93.
   - **Status:** Done (392c9c2d, merged f936a499), live in prod since 83848ece (release note 2026-10-21-1810). No migration was needed: the Plaid columns are nullable (0006) and 0061 lets board/admin insert. Remaining: none.
   - **Pain:** bank feeds are Plaid only, and many small credit unions or cautious treasurers won't link. Turnover means new accounts and signers (R11).
   - **Build:**
     - Add a manual account.
     - Upload a CSV or OFX with a dry run, deduplicated by date, amount and description.
     - Feeds the existing reconciliation queue.
     - Board-only and audited.
   - **Files:** `apps/hoa/src/app/(dashboard)/accounting/bank/`, `apps/hoa/src/lib/bank-reconciliation.ts`, `apps/hoa/src/lib/bank-import/` (new).
9. **BL-145 /compliance page with evidence (BL-131 leftover).** Migration: **yes (M5: `compliance_deadlines_done.document_id`)**. Effort M. Score 0.96.
   - **Status:** Built behind M5_APPLIED (groomed 2026-10-21 round 5). 8ab0af40, merged 6ca7a0f0 on claude/quality-oracle (in the 2026-10-21-1930 release note, not yet in prod 83848ece). The read-only page needs no flag and goes live with that deploy; evidence turns on with `M5_APPLIED` after Asaf applies 0069. Remaining: the "Director elections: Not tracked yet" row (`lib/compliance/obligations.ts:518`) still ignores BL-141, so it moves to round 5 as BL-151.
   - **Build:**
     - A `/compliance` page listing every statutory obligation: GA registration, TX § 209.004, BL-139 certificates, the BL-138 § 5300 window, BL-141 election dates.
     - Evidence document on "Mark as done".
     - Overdue banner.
     - A line in the monthly board report and the packet.
   - **Files:** `apps/hoa/src/app/(dashboard)/compliance/` (new), `apps/hoa/src/lib/compliance/`, `apps/hoa/src/lib/monthly-report/render.ts`.
   - **Status (2026-10-21): built, waiting on 0069.** `/compliance` is live read-only (flag off): Georgia first (SoS registration, renewal/amendment, annual meeting + 21-day notice from recorded meetings, minutes and records, § 44-3-232(d) statement), TX § 209.004, FL director certificates summary, CA § 5300(a) window from the adoption checklist; elections and GA condominium rules say "check your governing documents". Every quote checked word for word (`lib/compliance/law.test.ts`). Overdue banner; monthly board report section; board packet section; dashboard card links to it. Evidence (0069 part 4, `compliance_deadlines_done.document_id`, runbook L-BL145) turns on with `M5_APPLIED`; `tests/integration/security/m5-compliance-evidence.test.ts` in CI. Guide draft `compliance-obligations`.
10. **BL-146 Composer polish.** Migration: no. Effort S–M. Score 0.90.
   - **Status:** Done (groomed 2026-10-21 round 5). BL-146 6df2b5cb, merged cd7b131b: Spanish editor, untick homes, signed status webhook (off). BL-146b c712e484, merged 9e7b2e08: texts go through the Messages API. Both live in prod since 83848ece. Remaining code: none. The owner turns on OA-27 (`SMS_STATUS_WEBHOOK_ENABLED` plus the Messages API status URL) when texting is set up.
    - **Today:**
      - The Spanish version is still a monospace HTML textarea (`communications/new/SpanishVersion.tsx:154-168`).
      - A street sends to every home on it (`AudienceStep.tsx:246-269`).
      - SMS never shows as delivered: there is no Vonage delivery-receipt webhook, and `delivered_at` exists (0018:146).
    - **Build:**
      - `PlainEditor` for Spanish, keeping the "I've read" tick.
      - Untick homes in the street list.
      - A signed Vonage DLR webhook that sets `delivered_at` and failure.
    - **Files:** `apps/hoa/src/app/(dashboard)/communications/new/`, `apps/hoa/src/lib/communications/audience.ts`, `apps/hoa/src/app/api/webhooks/vonage/` (new `status/route.ts`).
    - **Status (2026-10-21): built, on `claude/quality-oracle`.**
      - The Spanish body is edited in `PlainEditor` and the tick is kept.
      - Street homes can be unticked. `excludeUnitIds` is enforced in `resolveAudience` and stored on the definition.
      - The DLR route is built behind `SMS_STATUS_WEBHOOK_ENABLED` (OA-27, spec `docs/specs/2026-10-21-sms-delivery-receipts.md`).
    - **Follow-up (BL-146b):** switch `lib/sms.ts` from the legacy SMS API to the Messages API (Basic auth with the same key and secret) so `external_id` holds `message_uuid`. Until then, no receipt can match a row. Keep the outbound guard and the error handling. Turn OA-27 on after it lands.
      - **Status (2026-10-21): built.** `sendSms` uses `vonage.messages.send` (Basic auth, no new env var); `external_id` holds `message_uuid`. Tests: `apps/hoa/src/lib/sms-messages-api.test.ts`. OA-27 gained a step: the account-level Messages API Status URL, since Basic-auth sends post receipts there.

**Below the line:**
- Inbox Phase B rest: `sla_due_at`, category and priority routing, `source_message_id`. This needs a migration; ride along in M5 if there is room.
- Resident preferences UI (language, quiet hours) and board and emergency contacts on the portal.
- Reserve study module. Large, needs a migration.
- E-ballots (CA AB 2159, TX SB 2629), after BL-141.
- BL-124 GA snapshot refresh (deadline 2027-01-01, schedule mid-December).

## Security review #3 (2026-10-21)

Scope: every first-parent merge on `claude/quality-oracle` dated 2026-10-21 (`4337b1b7`..`05bb635b`): BL-137, BL-138–BL-146b, the backlog-digest workflow and 0069 parts 1, 3 and 4. Adversarial pass over role gates, org scoping of client ids, RLS and SECURITY DEFINER functions (assuming CI's blanket re-grant of routines to anon), PII in logs and injection.

- **No Critical or High findings.**
- Verified holding:
  - Every new server action (bank import, dues rates, join codes, compliance evidence, cure cancel, budget adoption, director certs, elections) runs its board/admin gate before any client is made or any row read.
  - Every client-supplied id is scoped to the gate's org or primary association before it is used (bank account, fund, rate, join code, request, evidence document, violation, hearing, budget, meeting, property).
  - Every 0069 SECURITY DEFINER function that can be called directly (`dues_rates_resident_current_ids`, `owner_join_claim`, `owner_join_my_status`, `owner_join_decide`) refuses a null `auth.uid()` inside its body, so the anon re-grant does not open it. The others are trigger functions, which can't be called directly.
  - `owner_join_decide` checks board/admin of the *request's* org, so cross-org decides fail with 42501.
  - Address claims answer `sent` whether or not a home matched.
  - Join codes carry 50 bits, have no modulo bias (256 % 32 = 0), are stored as SHA-256 only, are single-use, and are capped at 5 claims a day per account.
  - Vonage status: the HS256 JWT plus `payload_hash` are checked before parsing, rows are matched on `message_uuid` + channel only, and writes are forward-only.
  - Bank files: no XML parser, bounded regexes, size and row caps, and control/bidi characters are stripped after entity decoding. Exports neutralize formulas through `lib/csv.ts`.
  - Notice drafts (HO-6, dues rate) escape every interpolated value.
  - Resident insurance reads only owner columns, through the service role, confined to the org verified by `getCurrentOrg`.
  - New logs carry only ids, codes and counts.
  - The backlog workflow has no `pull_request` trigger. The recipient comes only from the `OWNER_ACTIONS_TO` secret (owner fallback), and `--to` flags are refused.

- **SEC3-M1 (Medium, fixed):** BL-140 `cancelHearingAfterCure` wrote an unconditional UPDATE, `apps/hoa/src/lib/violation-hearings/actions.ts:327` (before the fix).
  - **Race:** a hearing another board member marked `held` (with an outcome) or moved to an earlier day, between the read and the write, was overwritten to `cancelled`, and its `outcome` and `decided_on` were nulled. That destroys a statutory hearing record.
  - **False success:** an update that matched no row returned `{ ok: true }`.
  - **Fix:** a compare-and-swap on the checked `status` and `hearing_on`, plus `.select('id')`. Zero rows now returns "The hearing changed … not cancelled" (`actions.ts:327-350`).
  - **Tests:** four new cases in `cure-actions.test.ts`. No existing assertion changed.
  - **Residual:** the audit row is still written first by design, so a refused race leaves one `violation.hearing_cancelled_cured` row for an attempt that changed nothing.
- **SEC3-L1 (Low):** bank import commits race (`apps/hoa/src/lib/bank-import/actions.ts:291-323`).
  - Two concurrent commits of the same file both plan against the database before either inserts, so the rows go in twice.
  - The "second click inserts nothing" guarantee holds only when the commits run one after the other.
  - Only a board member can trigger it, and the duplicates show in the matching queue.
  - The proper fix needs a lock or unique key, which means a migration. Deferred.
- **SEC3-L2 (Low, fixed in 0069 before apply):** `owner_join_claim` copies `auth.users.email` into `requester_email` without checking `email_confirmed_at` (`migrations/0069_m5_batch.sql:588`).
  - The board's "sign-in email matches the owner on file" check, and the approve-time link by email (`:697-705`), therefore trust the project's "confirm email" setting.
  - Local `supabase/config.toml:221` has `enable_confirmations = false`. The prod signup flow asks for confirmation.
  - Before 0069 is applied, consider adding `AND au.email_confirmed_at IS NOT NULL`, or showing "unverified" to the board.
  - **Fix:** `owner_join_requests.requester_email_confirmed` (new column, default false) is set at claim time from `email_confirmed_at`. `owner_join_decide` reads the email only `WHERE email_confirmed_at IS NOT NULL`, checked live at decision time. An unconfirmed email links no on-file ownership and is not written as a new ownership's `owner_email`. The board card (`lib/owner-join/model.ts` `ownerEmailCheck`) shows a matching but unconfirmed email as `unverified`, with a warning; a missing flag counts as unconfirmed.
  - **Tests:** two CI cases in `m5-join-requests.test.ts` (unconfirmed at claim; confirmed at claim but not at decision), plus a unit case in `model.test.ts`.
- **SEC3-L3 (Low, fixed in 0069 before apply):** `owner_join_claim` work before its limits (`0069:513-517`, `:569-574`).
  - It normalizes `p_address` and `p_code` in DECLARE, before the 200- and 10-character limits are checked.
  - Each address claim scans every `units` row in every org with three regex functions.
  - It is rate-limited per account, but accounts are free. The matched path also does more work, which is a timing side channel on whether an address exists.
  - **Fix:** the raw inputs are length-checked first (code 32, address 200, ZIP 20, unit 40), and normalising happens only after that. A miss no longer returns straight after the scan: it runs the same ownership, email and name reads as a hit, with no home, so they find nothing. Only the hit's one INSERT differs. The answer is still `sent` in every case.
  - **Residual:** the scan still evaluates the normalisers on every HOA home, with no expression index. Keeping it that way avoids altering `units` in 0069. The per-account rate limit still applies.
  - **Tests:** two CI cases: over-limit raw inputs that would otherwise normalise to valid ones are `invalid` and record nothing; and a hit, a miss and an already-linked claim all answer `sent`, one attempt each.
- **SEC3-L4 (Low, fixed in 0069 before apply):** join-request spam (`0069:591-596`).
  - Any confirmed account can drop up to 5 requests a day into any HOA's /approvals, by address, carrying an attacker-chosen `profiles.full_name`. React escapes it.
  - The units scan is not limited to `hub_type = 'hoa'` orgs.
  - A board member can also approve their own request. This is not an escalation, since the board already writes ownerships, but there is no separation of duties.
  - **Fix:** the scan joins `orgs` on `hub_type = 'hoa'`, the marker from 0000 that `set-active-org.ts` also checks. `owner_join_decide` refuses approval of the caller's own request with 42501, which the app already shows as "That request isn't one you can decide". Another board member or admin approves it. The 5-a-day spam limit is unchanged.
  - **Tests:** two CI cases (a home in a `pm` org is not found, then is once the org is `hoa`; a board member and an admin each fail to approve their own request, and the other one succeeds). The existing "keeps an existing board role" case had the board member approve their own request. A second board member now decides it, and all of its assertions are unchanged.
- **SEC3-L5 (Low, fixed in 0069 before apply):** a revoked code can come back (`0069:423-448`). The `owner_join_codes` attribution trigger freezes the hash, the home and the use stamp, but not `revoked_at`. A board member can therefore un-revoke a code through PostgREST.
  - **Fix:** in the same attribution trigger, for every caller including the service role, an UPDATE that clears or changes a set `revoked_at` raises 23514. The trigger count is unchanged (still 2). The expiry of a revoked code can still move.
  - **Tests:** one CI case: the board clearing it, the board re-stamping it, and the service role clearing it all fail with 23514, the stamp is unchanged, and the code stays `invalid_code`.
- **SEC3-L6 (Low):** no replay cache on the Vonage status webhook (`apps/hoa/src/app/api/webhooks/vonage/status/route.ts:68`).
  - A captured signed receipt can be replayed within `MAX_JWT_AGE_SECONDS` (24 h, `sms-inbound.ts:70`).
  - The impact is nil today: timestamps are first-write-wins and status moves forward only.
- **SEC3-L7 (Low, fixed):** phone numbers can leak into a failed text's row (`apps/hoa/src/lib/sms.ts:148`).
  - The Vonage error text masks only runs of 7 or more contiguous digits.
  - A number echoed back formatted (`+1 404-555-0100`), or a non-RFC 7807 `err.message` fallback, would land in `communication_recipients.error_message`, which only the board sees.
  - **Fix:** the new exported `maskPhoneNumbers` masks 7 or more digits, whether contiguous or split by spaces, dashes, dots or parentheses, with or without a leading `+`. It now runs on both the RFC 7807 reason and the `err.message` fallback (capped at 200 characters).
  - **Tests:** `sms.test.ts` (eight formats masked; status codes and short error numbers kept) and `sms-messages-api.test.ts` (through the real `sendSms`, for both the title and the fallback).
- **SEC3-L8 (Low, fixed):** lone surrogates in OFX files (`apps/hoa/src/lib/bank-import/parse.ts:451`). `decodeEntities` accepts `&#xD800;`–`&#xDFFF;`. A lone surrogate may make one insert chunk fail, leaving a partial import that is resumable. Refuse the 0xD800–0xDFFF range.
  - **Fix:** a numeric entity in 0xD800–0xDFFF now decodes to a space, like any other invalid code point. Two surrogate entities that would form a pair are refused too, and a real astral character entity still decodes.
  - **Tests:** one case in `parse.test.ts` (hex, decimal and paired surrogate entities leave no `\p{Cs}`; `&#x1F600;` survives).
- **SEC3-L9 (Low, defense in depth, fixed):** the board packet reads the meeting by URL id without an org filter (`apps/hoa/src/app/(dashboard)/meetings/[id]/packet/page.tsx:68`).
  - It passes `meeting.org_id` to the service-role director roster in the BL-145 compliance section (`:123`).
  - This is safe today only because 0063 makes `hoa_meeting_minutes` readable by board members only. Add `.eq('org_id', org.id)`.
  - **Fix:** the page reads the meeting through `packetMeetingQuery(db, orgId, id)` (`lib/board-packet/queries.ts`), which filters on `id`, on `org_id` = the org from `requireBoardOrAdmin()`, and on not deleted. Another org's meeting id is "not found" before any service-role client is made.
  - **Tests:** two cases in `queries.test.ts`: the query's filters, and a source check that the page has no unscoped meeting read and calls the gate, then the scoped read, then `createAdminClient()`, in that order.
- **Not changed:** SEC3-L1, SEC3-L6 and SEC3-L10 stay as recorded here.
- **SEC3-L10 (Info):** `backlog-email.yml` uploads `preview.html` as a 30-day artifact. On a public repo, any signed-in GitHub user can download it. The content is the already-public `docs/backlog.md`, and the owner's address in the workflow is already public in `next.md`.

## Ranked open work — round 5 (2026-10-21)

**Sources:** web research on 2026-10-21 (URLs in each item's Evidence line), the statute fixtures in `scripts/fixtures/state-law/`, and the code at b0469e51. Every "Today:" line was checked against that commit.

**Georgia first.** Georgia is the launch state. Two Georgia dates drive this round:
- **SB 406 § 7 has been in force since 2026-07-01.** Attorney's fees need a certified notice and 30 days first.
- **SB 406 §§ 2–6 take effect 2027-01-01.** They bring registration, the new foreclosure threshold, 60-day notice, a 6-year lien and the payment order.

Round 4 is closed. BL-137, BL-143 and BL-145 evidence wait only on Asaf applying 0069 (runbook Section L). BL-141 needed no migration.

**Order.** Highest value first. Georgia money and registration come first; they override the raw score because a live job or a legal bar is involved. The Q1 annual-meeting items follow.

**Migration batch M6.** Only BL-156 needs one. Every other item stores in `associations.compliance_settings` or needs no storage. Write M6 only after 0069 is applied.

**Follow-ups checked against the code** (BL-140, 142, 143, 144, 145, 146):
- **Done, no follow-up:** BL-140, BL-142, BL-144 and BL-146/146b.
- **BL-143 open:** the auth-callback auto-claim. It stays below the line.
- **BL-145 open:** its elections row. That is BL-151.
- **BL-137 open (not in the asked set):** money changes through /approvals, and a dues-generation job. Below the line, after M5.

1. **BL-147 Late-fee policy the board controls, with state caps (Georgia first).** Migration: no. Effort M (1.5). Score 3.00 (I 5 × C 0.9 ÷ 1.5). Override: a live job.
   - **Status:** Built on `claude/quality-oracle`, not yet deployed. No migration.
     - **Safe default:** no policy means no late fee (`docs/decisions/2026-10-21-late-fee-policy-safe-default.md`). This replaces "keep today's 5%" below.
     - **Board screen:** /settings/late-fees.
     - **Caps:** GA, FL and CA, enforced at save and in the job. TX has no loaded rule.
     - **Visibility:** each night's charges get an audit row and a digest line, not per-fee Approvals.
     - **Not built:** the dashboard prompt. (The GA interest cap on the collections letter is built in BL-148.)
   - **Pain:** every association is charged a late fee its declaration may not allow, at a rate nobody chose. In Georgia a late charge is lawful only "to the extent that the instrument provides". It is capped at the greater of $10 or 10% of each assessment or installment (§ 44-3-232(b)(1)). From 2027, an unregistered association can't collect fees at all (BL-149). Fines are driving foreclosures in Georgia news.
   - **Evidence:**
     - fixture `ga-ocga-44-3-art6-2026.txt` § 44-3-232(b)(1)–(2);
     - FL § 720.3085(3): "the greater of $25 or 5 percent" (`flsenate-ch720-2026.html`);
     - https://codes.findlaw.com/ga/title-44-property/ga-code-sect-44-3-232/ ;
     - https://www.wsbtv.com/news/local/gwinnett-county/hoa-fines-over-400k-issues-like-leaves-ground-homeowners-say-now-its-foreclosing-people/5KXVHXPFI5EJBN3WAB5KARA76Y
   - **Today:**
     - `packages/jobs/src/hoa-late-fees.ts:11` hard-codes `HOA_LATE_FEE_RATE = 0.05` ("per-row override later").
     - `:58-62` selects every open or partial charge with `due_date < today` except `late_fee`. That includes **fines** and payment-plan installments, with no grace period.
     - `:179-181` computes 5% and posts the charge and its journal entry automatically every night.
     - No board setting exists. The guide states it as fact (`content/guide/accounting/accounting-payment-plans.md`: "Every night the app adds a one-time 5% late fee").
   - **Build:**
     - A late-fee policy in `compliance_settings`:
       - off / percent / flat;
       - grace days;
       - which charge types (fines **off** by default);
       - an "our declaration authorizes late charges" tick, with the article and section.
     - The job reads the policy.
     - Existing associations keep today's 5% until the board saves a policy. Show a one-time banner and a dashboard prompt.
     - State caps, from quoted fixtures only:
       - GA: the greater of $10 or 10%;
       - FL: the greater of $25 or 5%.

       A policy above the cap can't be saved. CA § 5650(b) and TX are not loaded, so they show "check your governing documents".
     - GA: interest above 10% a year is refused on the collections letter's interest field (§ 44-3-232(b)(2)).
     - Policy changes are audited. Fix the guide.
   - **Files:** `packages/jobs/src/hoa-late-fees.ts`, `apps/hoa/src/lib/late-fees/` (new: policy, caps, law), `apps/hoa/src/app/(dashboard)/settings/`, `apps/hoa/content/guide/accounting/accounting-payment-plans.md`.
2. **BL-148 Georgia collections letters: SB 406 § 7 fee notice and § 44-3-232(c) notice before foreclosure.** Migration: no. Letter kinds are app-only, and events reuse `demand_letter_sent` / `lien_letter_sent` (`lib/collections/statuses.ts:105-118`). Effort M (1.5). Score 2.83 (5 × 0.85 ÷ 1.5).
   - **Status:** Built on `claude/quality-oracle`, not yet deployed. No migration.
     - **Kinds:** `ga_fee_notice` (records `demand_letter_sent`; moves the case no further than "Collection letter sent", not to the attorney rung) and `ga_pre_foreclosure` (records `lien_letter_sent`). Quotes are verbatim from `ga-ocga-44-3-art6-2026.txt`, checked by `law.test.ts` and `statute-drift.test.ts`.
     - **State law check:** the fee notice never blocks itself (delivery warning only). A letter listing attorney's fees clears once a fee notice was printed 30+ days earlier, then warns that the 30 days run from receipt.
     - **Pre-foreclosure:** lot address plus designated-address BLANK; blocked under $2,000 and for interest above 10%; late charges above the (b)(1) cap flagged; four-year lapse named.
     - **Gap:** SB 406 § 5's 2027 text of § 44-3-232(c) is not in the fixtures, so the pre-foreclosure notice refuses from 2027-01-01 ("check with your attorney"). BL-154 loads it.
     - **Gap:** no certified-mail tracking columns exist; the screen says to add the tracking number as a case note. Real tracking fields need a migration.
   - **Pain:** since 2026-07-01 a Georgia association can't collect attorney's fees without first sending a certified notice that lists the fines and fees and gives 30 days to pay. Our state-law check blocks GA letters that list attorney's fees, but the app can't produce that notice, so the block can only be overridden. Georgia news reports:
     - about $8K of dues growing to about $20K with fees;
     - foreclosure over pressure-washing fines.
   - **Evidence:**
     - fixture `ga-ocga-44-3-art6-2026.txt` "Ga. L. 2026, SB 406, § 7" (f)(1)–(3) and § 44-3-232(c);
     - https://www.atlantanewsfirst.com/2026/07/06/georgia-hoas-must-follow-new-rules-attorneys-fees/ ;
     - https://www.atlantanewsfirst.com/2026/08/26/couple-fights-back-court-save-first-home-20k-hoa-foreclosure/ ;
     - https://www.atlantanewsfirst.com/2025/09/03/hoa-seeks-foreclose-77-year-olds-home-over-pressure-washing-violations/
   - **Today:**
     - `apps/hoa/src/lib/collections/letters/model.ts:54-61`: `letterJurisdiction` knows FL, CA and TX only. GA gets `generic`, and `LETTER_KINDS` has no GA kind.
     - `letters/law.ts:50` says "Every other state gets a plain past-due letter".
     - `lib/compliance/statute-drift.ts:648-660` blocks GA attorney's fees with "HomeownerHub has no record of that notice".
   - **Build:**
     - `ga_fee_notice` (SB 406 § 7(f)):
       - itemized outstanding fines and fees;
       - "30 days from receipt";
       - certified mail or statutory overnight, shown on screen;
       - an optional itemized attorney's-fee block for (f)(3).

       It records `demand_letter_sent`, and the drift check clears 30 days after it.
     - `ga_pre_foreclosure` (§ 44-3-232(c)):
       - the amount due, late charges and interest rate;
       - sent to the lot address **and** any designated address;
       - blocked below the $2,000 minimum;
       - a warning on installments near the 4-year lapse.

       BL-154 switches it to the 2027 text by date.
     - GA late charge and interest caps are checked (shared with BL-147).
     - Approvals work as for the FL letters.
   - **Files:** `apps/hoa/src/lib/collections/letters/{model,law,actions}.ts`, `apps/hoa/src/lib/compliance/statute-drift.ts`, `apps/hoa/src/app/(dashboard)/properties/[id]/collections-letter/CollectionsLetter.tsx`.
3. **BL-149 SB 406 registration kit and the registration gate.** Migration: no. Effort M (2). Score 2.00 (5 × 0.8 ÷ 2). Override: a legal bar from 2027-01-01.
   - **Pain:** from 2027-01-01 a Georgia association that hasn't registered with the Secretary of State may not "collect fines or fees against any owner, or file or record liens or initiate foreclosure proceedings". The filing needs:
     - officers;
     - the governing documents;
     - a financial statement dated no more than a year before filing;
     - an amendment within 30 days of a change of officers;
     - renewal by every Dec 31, at $100.

     None of the competitors we checked advertises SB 406 support. PayHOA is publishing Georgia law guides.
   - **Evidence:**
     - fixture `ga-sb406-2026-registration.txt` (§ 43-17A-2(a)–(e));
     - https://www.huntermaclean.com/2026/05/georgia-community-associations-face-major-regulatory-changes-under-sb-406/ ;
     - https://www.walb.com/2026/05/13/new-georgia-hoa-law-raises-foreclosure-threshold-adds-new-protections/ ;
     - https://www.payhoa.com/the-guide-to-georgia-hoa-laws/
   - **Today:**
     - `lib/compliance/obligations.ts:522-541`: the registration row is text steps only ("Gather a copy of your governing documents… officers, and a recent financial statement"), with `link: null`.
     - `:289-292`: the amendment after an officer change is a sentence. Nothing triggers it.
     - `lib/members.ts:502` `changeMemberRole` starts no 30-day clock.
     - `GA_REGISTRATION_BAR` (`lib/compliance/law.ts:50`) is only quoted on /compliance. Three places ignore it:
       - the GA fine check (`statute-drift.ts:559-567`, instrument warning only);
       - the late-fee job;
       - the lien letters.
   - **Build:**
     - **Registration kit,** board-only and printable, at `/compliance/ga-registration`:
       - name, address and officers from board roles;
       - a governing-documents checklist from Documents;
       - a balance sheet and 12-month income statement from the books, dated, with a "more than 1 year old" warning;
       - the board's register-or-opt-out decision, quoting the (a)(2)(B) consequences.
     - "Registered on", with evidence through BL-145.
     - A 30-day amended-registration clock when a board role changes or BL-141 results are recorded (with BL-151).
     - **The gate,** from 2027-01-01, for GA associations not marked registered:
       - a `block` finding on fines (statute-drift);
       - the BL-147 job skips late fees;
       - GA lien and pre-foreclosure letters are blocked;
       - every override is audited.

       An opted-out association is also blocked from fines, fees and accelerated assessments.
   - **Files:** `apps/hoa/src/lib/compliance/{obligations,law,statute-drift}.ts`, `apps/hoa/src/app/(dashboard)/compliance/ga-registration/` (new), `apps/hoa/src/lib/members.ts`, `packages/jobs/src/hoa-late-fees.ts`, `apps/hoa/src/lib/accounting/`.
   - **Status:** Built 2026-10-21, no migration; not deployed yet.
     - **Storage:** a signed record in `compliance_settings.ga_registration` (`lib/ga-registration/{model,store}.ts`, HMAC like BL-122/141/147). An unverified record counts as not registered.
     - **Kit** at `/compliance/ga-registration`, board-only and printable: the decision (register or opt out) with the (a)(2)(A) and (B)(ii) quotes; a fill-in sheet with the legal name, board names (titles by hand), units on file, and the mailing address and registered agent the board types; a governing-documents checklist from Documents; links to the balance sheet and income statement under the (a)(3)(B) quote; the fee quote.
     - **Records:** "registered on [date], confirmation number", each renewal (with the year it covers; past Dec 31 with no renewal it reads "lapsed"), and each amended registration. BL-151's 30-day amendment row is markable from the kit ("amended filing recorded" or "officers didn't change") and shows done on /compliance.
     - **Gate** in the BL-130 state law check: fines (`ga_unregistered_fine`), collections letters that list fines or fees (`ga_unregistered_fees`; dues-only letters pass) and recording "Lien filed" (`ga_unregistered_lien`, new `checkLien`). A warning before 2027-01-01, a block from then, with a link to the kit. The only override is "attorney advised", audited (ids and codes). The nightly late-fee job charges nothing for an unregistered GA association from 2027-01-01.
     - **Rules:** one board-only action (`updateGaRegistration`); the audit row has ids and codes only. `recordCollectionEvent` gained the board gate. Both are in the board-write-gates ratchet.
     - **Quotes:** every quote is tested word for word against `ga-sb406-2026-registration.txt` (`lib/ga-registration/kit-quotes.test.ts`). The fixture names no registered agent or unit count, so those are listed as facts, not quoted.
     - **Not built:** `changeMemberRole` still starts no 30-day clock (the kit's "Another change" form records an amendment by hand); no "accelerated assessments" check (the app has none); the SoS form's other fields are unknown until the portal opens.
4. **BL-150 Georgia quorum and proxy rules in the quorum kit.** Migration: no. Effort S (0.75). Score 3.60 (3 × 0.9 ÷ 0.75). Timing: Q1 annual meetings.
   - **Pain:** quorum failures stop elections. A Georgia board using the kit gets only "check your bylaws", although the statute sets a default. One Gwinnett HOA reportedly held no board election for about 10 years.
   - **Evidence:**
     - fixture § 44-3-228: "more than one-third of the votes are present at the beginning of the meeting"; board quorum is one-half;
     - fixture § 44-3-224(b): "Any proxy shall be void if it is not dated…", and an owner that isn't a natural person must vote by proxy;
     - Nonprofit Code § 14-3-724 (proxy valid 11 months; electronic appointment): https://codes.findlaw.com/ga/title-14-corporations-partnerships-and-associations/ga-code-sect-14-3-724/ ;
     - the WSB story in BL-147.
   - **Today:**
     - `apps/hoa/src/lib/meeting-quorum/law.ts:55-97` has FL and CA cases. GA falls to `default`, with `statuteQuorumPct: null` and `CHECK_BYLAWS` (`:50`).
     - `lib/elections/law.ts` already quotes §§ 44-3-228 and 44-3-224 from the same fixture.
   - **Build:**
     - A GA case:
       - quorum is more than one-third present at the start, "unless the instrument or bylaws provide otherwise";
       - the counter's target;
       - a dated-proxy line and revocation text on the form;
       - an entity-owner note;
       - joint-owner unanimity (§ 44-3-224(a)).
     - § 44-3-230(b): when no annual meeting is held by fiscal year end, tell the board that 5% of members may call one. Show it on /compliance too.
     - Quote tests against the fixture.
   - **Files:** `apps/hoa/src/lib/meeting-quorum/law.ts`, `apps/hoa/src/app/(dashboard)/meetings/[id]/quorum/`, `apps/hoa/src/lib/compliance/obligations.ts`.
   - **Status:** Built 2026-10-21, no migration; not deployed yet.
     - **GA case in `proxyLaw`:** § 44-3-228 more-than-one-third at the start, "unless the instrument or bylaws provide otherwise". The kit says the bylaws win.
     - **Counter:** the board can pick the state default in one tap (33.34%). `quorumNeeded` then equals floor(n/3)+1 for every roster up to 5,000 votes, and is never lower above that.
     - **Form clauses:** a dated-proxy line, notice-only revocation (never "revocable at any time", which would void it), joint-owner unanimity and the entity-owner proxy.
     - **Board notes card** on the kit page, quoting the statute. § 44-3-230(b) (5% may call a missed annual meeting) appears there and on /compliance's GA annual-meeting row.
     - **§ 14-3-724** is named but not quoted, since it is not in the repo.
     - **Tests:** `meeting-quorum/law.test.ts` checks every quote word for word against the fixture subsection.
     - **Not built:** the board quorum (one-half) is not shown, because the kit is for members' meetings.
5. **BL-151 Elections on /compliance, plus the registration amendment after an election (BL-145 × BL-141 follow-up).** Migration: no. Effort S (0.75). Score 3.80 (3 × 0.95 ÷ 0.75).
   - **Pain:** the Compliance page says director elections are "Not tracked yet", while the election planner now tracks every date. In Georgia, an election that changes officers starts the 30-day SB 406 amendment.
   - **Evidence:** BL-141 (a17d3a40) and BL-145 (8ab0af40); fixture § 43-17A-2(d).
   - **Today:**
     - `lib/compliance/obligations.ts:26`: "director elections are not tracked yet (BL-141)".
     - `:518`: `notLoaded(base, 'director-elections', 'Director elections', 'Not tracked yet')` for every state.
     - The planner's record lives in `compliance_settings.meeting_elections` (`lib/elections/store.ts`).
   - **Build:**
     - A row per planned election: next timeline date, overdue steps, results recorded. Link to `/meetings/[id]/election`.
     - CA: results within 15 days (§ 5120(b)).
     - GA: once results are recorded, an "amend your registration within 30 days" item (shared with BL-149).
     - A monthly board report line.
   - **Files:** `apps/hoa/src/lib/compliance/{obligations,overview-load}.ts`, `apps/hoa/src/lib/elections/{store,timeline}.ts`.
   - **Status:** Built 2026-10-21, no migration; not deployed yet. "Not tracked yet" is gone.
     - **Election rows (GA/FL/CA/TX):** one row per signed planner election whose meeting still exists. Each shows the next timeline date, any date conflict (red), the passed dates to check, and whether results are recorded. Each links to `/meetings/[id]/election`.
     - **No election:** the row says "No election planned in HomeownerHub". A failed read says "Couldn't load your elections".
     - **CA:** the § 5120(b) 15-day results notice turns amber, then overdue.
     - **GA:** once results are recorded, an amended-registration row appears. The SB 406 fixture supports it: § 43-17A-2(d) says "within 30 days" after a change in officers.
       - It reads "if the officers changed" and counts from the day the results were recorded.
       - Before 2027-01-01 it says to put the new officers in the first registration.
       - Past day 30 it turns "unknown", not overdue, because we can't know whether the officers changed or the filing went in.
       - It points to the Secretary of State's guidance.
     - **Monthly board report:** a "Director elections" line (`ComplianceSummary.election`).
     - **Not built:** the amendment is not markable as done (no deadline code), and `changeMemberRole` still starts no clock. Both stay with BL-149.
6. **BL-152 Georgia Nonprofit Code pack: the April 1 corporate registration and the records-request clock.** Migration: no. Effort M (1.25). Score 2.56 (4 × 0.8 ÷ 1.25).
   - **Pain:** a Georgia HOA has two state filings on two calendars:
     - SB 406 registration, by Dec 31;
     - the nonprofit corporation's annual registration, Jan 1 – Apr 1 (§ 14-3-1622).

     If the corporate registration is 60 days late, the Secretary of State may dissolve the corporation (§ 14-3-1420). Reinstatement costs $250 plus the past-due registrations. Georgia records requests also get "check your bylaws", though § 14-3-1602 sets 5 business days' written notice and says which records are on demand.
   - **Evidence:**
     - https://codes.findlaw.com/ga/title-14-corporations-partnerships-and-associations/ga-code-sect-14-3-1622/ ;
     - https://codes.findlaw.com/ga/title-14-corporations-partnerships-and-associations/ga-code-sect-14-3-1420/ ;
     - https://sos.ga.gov/how-to-guide/how-file-annual-registration ;
     - https://sos.ga.gov/how-to-guide/how-guide-reinstate-entity ;
     - https://codes.findlaw.com/ga/title-14-corporations-partnerships-and-associations/ga-code-sect-14-3-1602/

     Sources disagree on the fee ($30 or $40), so the app quotes no fee and links the SoS page. We found no reported case of a Georgia HOA dissolved this way.
   - **Today:**
     - No Title 14 text exists in `apps/hoa/src/lib` (grep `14-3-`: none).
     - `lib/compliance/deadlines.ts:80,100` hold only `ga-sos-registration-2027` and `tx-management-certificate`.
     - `lib/records-requests/law.ts:20-23` and `:267` return "check your bylaws" for GA.
   - **Build:**
     - **Prerequisite (S):** a `ga-ocga-14-3-2026.txt` fixture with §§ 14-3-701, 708, 724, 1420, 1601, 1602 and 1622. Use the same Public.Resource.Org release-86 source as the Art. 6 snapshot, add later acts, record the provenance, and add it to the BL-124 refresh.
     - A GA "annual registration (Jan 1 – Apr 1)" deadline on /compliance and in the digest, with evidence.
     - A dissolution-risk line from Apr 1 + 60 days.
     - Records requests:
       - a 5-business-day clock;
       - the on-demand vs "reasonable particularity" categories on `/tickets/records`.
     - Quotes tested word for word.
   - **Files:** `scripts/fixtures/state-law/`, `apps/hoa/src/lib/compliance/{deadlines,obligations,law}.ts`, `apps/hoa/src/lib/records-requests/law.ts`, `data/statutes/README.md`.
7. **BL-153 Georgia annual-meeting report for owners (§ 44-3-230(a)).** Migration: no. Effort M (1). Score 2.40 (3 × 0.8 ÷ 1).
   - **Pain:** at every annual meeting, Georgia requires "comprehensive reports of the affairs, finances, and budget projections of the association". Volunteer treasurers build these by hand. Owners in the Gwinnett story could not get financials.
   - **Evidence:** fixture § 44-3-230(a) (and § 44-3-102 for condos, see BL-155); the WSB story in BL-147.
   - **Today:**
     - `lib/compliance/obligations.ts:312` tells the board to "report on the association's affairs, finances and budget projections", with no tool.
     - The meeting packet is board-only (`app/(dashboard)/meetings/[id]/packet/page.tsx:4`, `requireBoardOrAdmin`) and carries per-home delinquency and violations (`packet/sections.tsx:241`, `:309`).
   - **Build:** an owner-safe, printable `/meetings/[id]/annual-report`. It includes:
     - income and expenses against the budget;
     - the balance sheet;
     - the reserve snapshot (BL-120);
     - next year's budget projection (BL-138);
     - collections as totals and counts only;
     - the insurance summary (BL-142);
     - compliance status (BL-145);
     - motions passed (BL-116).

     The board edits a short narrative. "Attach to the meeting notice" goes through the guarded composer. No PII.
   - **Files:** `apps/hoa/src/app/(dashboard)/meetings/[id]/annual-report/` (new), `apps/hoa/src/lib/board-packet/sections.ts`, `apps/hoa/src/lib/accounting/reserves.ts`.
   - **Status:** Built 2026-10-21, no migration; not deployed yet. Board/admin `/meetings/[id]/annual-report` (card on annual meetings), printable, plus "Draft message to owners" → composer `?from=annual-report` (owners, sessionStorage hand-off; nothing auto-sent).
     - **Sections, all from existing loaders:** income and expenses and budget vs actual (packet financials), balance sheet, reserves (BL-120), next year's budget projection (BL-138 budgets, adopted vs proposed, vs this year), collections as totals/counts/aging only (packet delinquency cut to totals inside its loader), insurance (BL-142 owner columns), compliance titles and status (BL-145), the window's meetings and passed motions from approved minutes with mover/seconder names removed (BL-116), and elections with seats and elected names only (BL-141 signed record).
     - **Window:** fiscal year to date; in the first 60 days of a new fiscal year, the whole year just closed.
     - **Owner-safe by construction:** `lib/annual-report/model.ts` rebuilds every section field by field; account names mask bank/routing numbers. The board's narrative is typed on the page and is not stored.
     - **Law:** GA quotes § 44-3-230(a) and § 44-3-235(a), checked word for word (`lib/annual-report/law.test.ts`). Other states get the same report without GA wording. § 44-3-102 (condos, BL-155) is not loaded and not quoted.
     - **Tests:** `annual-report-render.test.tsx` renders the page and the message from poisoned inputs and checks that no home, owner, per-home balance, losing candidate, mover, premium, policy number, bank number or evidence file appears.
     - **Not built:** "Attach to the meeting notice" (the message is a separate draft; print the report to attach it); the narrative is not saved. Guide `annual-report-to-owners`.
8. **BL-154 SB 406 2027 readiness: dated GA snapshot, foreclosure threshold and payment order.** Migration: no. Effort L (2.5). Score 1.20 (5 × 0.6 ÷ 2.5). Override: deadline 2027-01-01. Absorbs BL-124.
   - **Pain:** on 2027-01-01 Georgia changes these rules (secondary sources):
     - the foreclosure threshold becomes the lesser of $4,000 or 12 months of regular assessments, with a $2,000 floor and fines and fees excluded;
     - foreclosure notice goes from 30 to 60 days;
     - the lien lasts 6 years instead of 4;
     - payments apply in order: regular, then special, then specific assessments, then fees and fines;
     - associations may not refuse payment or accelerate;
     - owners can inspect 3 years of financial records and request the insurance certificate;
     - a Secretary of State complaint process stays collection while it runs.

     Today the GA adapter stops serving law on that date.
   - **Evidence:**
     - https://www.news4jax.com/news/local/2026/07/10/georgia-property-owners-bill-of-rights-what-new-hoa-law-means-for-homeowners/ ;
     - https://www.huntermaclean.com/2026/05/georgia-community-associations-face-major-regulatory-changes-under-sb-406/ ;
     - https://www.jdsupra.com/legalnews/georgia-property-owners-bill-of-rights-6426556/ ;
     - SB 406/AP, https://www.legis.ga.gov/api/legislation/document/20252026/248665

     These are secondary sources for §§ 3–6. Load the official text before any rule ships.
   - **Today:**
     - `scripts/fixtures/state-law/ga-ocga-44-3-art6-2026.txt:34-39`: §§ 3–6 are "EFFECTIVE JANUARY 1, 2027 and are NOT applied", with `@valid_until` 2027-01-01.
     - `lib/assessments.ts:510` `markAssessmentPaid` pays whichever charge the board picks.
     - `lib/pay-by-zelle.ts:254-257` orders pay lines by oldest due date, whatever the type, so a late fee or fine can be paid before a newer regular assessment.
   - **Build:**
     - Load §§ 3–6 verbatim from SB 406/AP as dated records (`@effective_date 2027-01-01`), so the snapshot serves both texts.
     - A foreclosure-threshold calculator on the collections case, excluding fines and fees.
     - BL-148's letter switches to 60 days and 6 years by date.
     - GA payment-order allocation for Zelle lines and recorded payments from 2027-01-01, as a pure allocator with a preview.
     - The insurance-certificate request in records requests.
     - A "complaint filed, collection stayed" flag on the case, in `compliance_settings` until a table is warranted.
   - **Files:** `scripts/fixtures/state-law/ga-ocga-44-3-art6-2026.txt`, `packages/workflows/src/W30-state-law-brain/sources/georgia.ts`, `apps/hoa/src/lib/collections/`, `apps/hoa/src/lib/pay-by-zelle.ts`, `apps/hoa/src/lib/assessments.ts`, `data/statutes/README.md`.
9. **BL-155 Georgia Condominium Act snapshot for condo associations.** Migration: no. Effort L (2.5). Score 1.12 (4 × 0.7 ÷ 2.5).
   - **Pain:** Atlanta-area condos are a large share of the Georgia market. Today every Georgia condo gets POA Act text or "not loaded". The Condo Act covers:
     - the lien, late-charge and interest caps (§ 44-3-109);
     - the $2,000 foreclosure floor (§ 44-3-109);
     - the 5-business-day statement (§ 44-3-109(d)). Verify on the official text: one source says 10 days.
     - 21/7-day meeting notice (§ 44-3-102);
     - records (§ 44-3-106(d));
     - mandatory replacement-cost property cover and $1M/$2M liability (§ 44-3-107);
     - a 5-business-day certificate exchange on water claims (§ 44-3-107(c)).
   - **Evidence:**
     - https://codes.findlaw.com/ga/title-44-property/ga-code-sect-44-3-109/ ;
     - https://codes.findlaw.com/ga/title-44-property/ga-code-sect-44-3-107/ ;
     - https://codes.findlaw.com/ga/title-44-property/ga-code-sect-44-3-106/ ;
     - https://law.justia.com/codes/georgia/title-44/chapter-3/article-3/section-44-3-102
   - **Today:**
     - `lib/compliance/obligations.ts:544` returns `notLoaded(base, 'ga-condominium', …)`.
     - The fixture header (`ga-ocga-44-3-art6-2026.txt:42-43`) leaves Art. 3 out of scope.
     - The GA estoppel statement cites only POA Act § 44-3-232(d) (`lib/properties/estoppel/law.ts:65`).
     - `associations.type` already has `condo` (`lib/platform-admin.ts:917`).
   - **Build:**
     - A `ga-ocga-44-3-art3-2026.txt` fixture (release 86 plus later acts).
     - Branch on `associations.type = 'condo'` in:
       - compliance;
       - estoppel;
       - collections letters (BL-148);
       - meeting notice;
       - the insurance check (BL-142).
     - A "POA Act / Condo Act / declaration only" setting, because a GA HOA not submitted to Art. 6 gets neither statute's lien rules.
   - **Files:** `scripts/fixtures/state-law/`, `apps/hoa/src/lib/compliance/`, `apps/hoa/src/lib/properties/estoppel/law.ts`, `apps/hoa/src/lib/insurance/model.ts`, `apps/hoa/src/lib/meetings/notice-law.ts`.
10. **BL-156 Electronic ballots and written consent (after BL-141).** Migration: **yes (M6)**: `ballots`, `ballot_responses` and consent records, with RLS. Effort L (4). Score 0.60 (4 × 0.6 ÷ 4).
    - **Pain:** paper ballots and proxies are why annual meetings miss quorum. Georgia's Nonprofit Code allows action by written or electronic consent that identifies the member and the date (§ 14-3-708), and proxies appointed electronically (§ 14-3-724). Competitors:
      - TownSq shipped a Digital Voting upgrade (Oct 2025).
      - Condo Control (Feb 2026) and Vantaca (Jun 2026) are moving to AI assistants.
    - **Evidence:**
      - https://codes.findlaw.com/ga/title-14-corporations-partnerships-and-associations/ga-code-sect-14-3-708/ ;
      - https://www.townsq.io/new-releases-and-updates/the-new-townsq-community-homepage-is-here ;
      - https://support.condocontrol.com/hc/en-us/articles/46357058622235-What-s-New-in-Property-Control-February-2026 ;
      - https://wilmingtonbiz.com/technology/2026/06/09/wilmingtons_vantaca_unveils_new_ai_agent_suite/27567
    - **Today:**
      - `lib/elections/model.ts:10`: no e-voting; "ballots are printed, mailed or handed out, and counted by hand".
      - BL-023 polls (M2) were never built.
    - **Build (GA first):**
      - one electronic consent or ballot per home (§ 44-3-224(a) joint owners);
      - the 10-day effect notice to members who didn't consent (§ 14-3-708);
      - a secret-ballot option;
      - an audit trail.

      CA and TX stay paper until AB 2159 / SB 2629 are loaded. Every send goes through the guarded composer.
    - **Files:** `migrations/0070_m6_*.sql` (new), `apps/hoa/src/lib/elections/`, `apps/hoa/src/app/resident/`, `docs/specs/2026-10-20-sql-runbook.md` (new Section M).

**Below the line:**
- BL-143 auth-callback auto-claim.
- BL-137 money changes through /approvals, and a dues-generation job, after M5.
- AI bank auto-coding. PayHOA shipped AI reconciliation in Jan 2026 (https://www.payhoa.com/?p=9037). Our BL-144 import feeds the manual queue.
- A resident AI over the governing documents, with citations (Condo Control, Feb 2026). We have the resident assistant; check its citation coverage first.
- Inbox Phase B: ride along in M6 if there is room.
- CA § 5650 and TX § 209.0051 fixtures (the round-4 prerequisite).

## Owner request 2026-10-22: marketing website on www.homeownerledger.online

157. **BL-157 Marketing website at www.homeownerledger.online.** Migration: no. Owner ask (Asaf, 2026-10-22: "start work on the marketing site on www.homeownerledger.online").
   - **Domain:** OA-30 (DNS CNAME fix + move the hostname from the app project to `homeownerhub-marketing`). The app stays at www.homeownerledger.com; OA-5 stays paused.
   - **Code (ours):** the site's own base URL (canonical, sitemap, robots, Open Graph) comes from one setting that defaults to www.homeownerledger.online; sign-in and sign-up links keep pointing at the app at www.homeownerledger.com.
   - **Truth pass:** every feature claim checked against shipped code; remove or fix anything not live. Fix the `ledger.ai` contact addresses (domain-split spec, "Unrelated finding").
   - **Georgia first:** the home page and HOA page lead with Georgia (SB 406 registration kit, GA collections letters, quorum/proxy, annual report), FL/CA/TX next.
   - **Status:** built 2026-10-22 (truth pass, Georgia-first home and HOA pages, sitemap/robots, origin constants); merged on claude/quality-oracle. The domain waits on OA-30.

## Round 5 follow-ups (2026-10-22, from BL-149/150/152/154 gaps)

158. **BL-158 Georgia 2027 foreclosure-threshold check on the collections case.** Migration: no. Effort S–M.
   - **Pain:** from 2027-01-01 a GA association may not foreclose below the lesser of $4,000 or 12 months of regular assessments (never below $2,000). Today the only way to apply that is the letter's "12 months" blank (BL-154).
   - **Build:** a read-only panel on the collections case for GA associations. It shows the counted balance (regular and special assessments, less unapplied credit, per BL-154's reading), the 12-month figure from the dues-rate schedule (BL-137) where one exists, the threshold, and whether the case is above it. It also shows SB 406's payment order (§ 43-17A-8) as a read-only "how payments should be applied" note. Quotes come only from `ga-sb406-2026-2027-text.txt`. It changes no payment application.
159. **BL-159 Georgia follow-ups: officer-change clock and the § 14-3-724 proxy quote.** Migration: no. Effort S.
   - **Build:** `changeMemberRole` (lib/members.ts) starts the BL-151 30-day amended-registration row when a GA association's board role changes (BL-149 "not built"). The quorum kit quotes § 14-3-724 from `ga-ocga-14-3-2026.txt` (BL-150 named it without quoting). Audit rows carry ids and codes only.

## Ranked open work — round 6 (2026-10-26)

Full items (Pain / Evidence / Today / Build / Files): `docs/research/2026-10-22-round-6.md`. Georgia first. Summary, ranked:

1. **BL-160 GA proposed 590-13 rules.** A "Proposed rules (not in force)" card on /compliance. Migration: no. **Waits on OA-32** (official PDFs; sos.ga.gov blocks our fetchers). Comments are due Nov 2.
2. **BL-161 SB 406 automatic stay on a Secretary of State complaint (§ 43-17A-5(c)).** A board-only "complaint filed" record, fines and fee letters blocked, late fees skipped. Migration: no. In force 2027-01-01.
3. **BL-162 GA owners' records rights from 2027 (§ 43-17A-7(1)–(2)).** A 3-year financial packet and an insurance-certificate request kind. Migration: no.
4. **BL-163 Apply SB 406's payment order (§ 43-17A-8) in the Zelle pay lines and in a new "record one payment" split.** Migration: no. In force 2027-01-01. Touches money: needs careful review.
5. **BL-164 GA owners' rights page in the resident portal (the § 43-17A-7 rights, quoted).** Migration: no. Ships with BL-162.
6. **BL-165 Conflict-of-interest disclosure at bid award and contract approval (§ 43-17A-7(10)).** Migration: no.
7. **BL-166 Certified-mail tracking fields on collection events.** Migration: **yes (M6, with BL-156)**.
8. **BL-167 1099-NEC and 1120-H deadlines on /compliance and in the digest.** Migration: no. Not Georgia-specific.

**Status 2026-10-26:** dispatched BL-162+BL-164 together, then BL-161.

## Owner request 2026-10-26: CPA, attorney and treasurer access

168. **BL-168 Professional and officer roles: CPA, Attorney, Treasurer.** Migration: **yes (M6, with BL-156 and BL-166)**. Owner ask (Asaf, 2026-10-26). Design: `docs/specs/2026-10-26-professional-roles.md`.
   - **CPA:** read-only accounting plus exports. Can mark a period "reviewed" and propose adjusting entries, which post only after board approval. Time-boxed grant.
   - **Attorney:** sees only the matters the board assigns (collections cases, violations and hearings, records requests). Adds notes and documents and drafts letters, which the board approves. Optional general-counsel read access to governing documents and compliance. Time-boxed grant.
   - **Treasurer:** a board member with an officer title. Money approvals and bank-reconciliation sign-off route to the Treasurer, with dual control above a board-set amount. Titles also feed the GA registration kit's officer list.
   - "Trusery" was read as Treasurer (decision in the spec). If a trustee was meant, that's an owner label, not a role.
   - **Status 2026-10-26:** built on `claude/bl-168`. CI failed (0070:612 uuid = uuid[]). The security review says don't apply 0070 as written (H1 sign-offs survive edits, H2 any board member can change the dual-control amount, M1–M3, L1–L5). Fixes plus the consent accept-link are in progress. It isn't merged to the integration branch until CI and the re-review pass.

## Added 2026-10-26 (owner ask and a finding)

169. **BL-169 Refresh the GA Article 6 fixture with the 2025 and 2026 Code revisions.** Migration: no. Found by BL-155.
   - `ga-ocga-44-3-art6-2026.txt` misses 2025 SB 153 (§ 44-3-230(b) "may called" becomes "may be called"; § 44-3-231(a)(4)) and 2026 HB 1268 (§§ 44-3-221, 225, 226, 234). Its header wrongly says "2025 none found". `lib/elections/law.ts` quotes "may called".
   - Fix: apply both Acts from the official signed copies, re-verify every Article 6 quote and the dated snapshot (BL-154), and update the header.
170. **BL-170 Marketing website visual redesign.** Migration: no. Owner ask (Asaf, 2026-10-26: "it looks terrible … lift it up dramatically").
   - A design system plus a redesign of home, /hoa, /pricing, /about, /compare and /demo, with product mockups built from real screens.
   - The truth rules from BL-157 stay. Before/after screenshots go in the release note.
   - **Status:** dispatched 2026-10-26 (Sonnet).

171. **BL-171 Marketing growth: measurement, demo funnel, Georgia SB 406 guides and readiness check.** Migration: no. Owner ask (Asaf, 2026-10-26). Plan: `docs/specs/2026-10-26-marketing-growth-plan.md`.
   - **Done 2026-10-26:** a demo request no longer fakes success in production when email isn't configured. Delivery waits on OA-34.
   - **Build:**
     - Vercel Web Analytics and conversion events;
     - a "Book a demo" button in the header and at the end of each page, and a short demo form;
     - a `/georgia` hub and 6–8 guide pages, quoting the official text only;
     - the SB 406 readiness check;
     - SEO metadata and structured data, and the Search Console verification tag (OA-35);
     - a weekly analytics digest to Asaf (counts only).
   - **Status:** dispatched 2026-10-26 (Sonnet).

172. **BL-172 SEO content program (primary growth channel, ongoing).** Migration: no. Owner decision (Asaf, 2026-10-26: "invest the most in SEO"). Plan: `docs/decisions/2026-10-26-seo-primary-growth-channel.md`.
   - **Content:** Georgia law guides, free templates and tools, self-managed-HOA how-tos, factual comparison pages, and local pages only where there is real local substance. FL, CA and TX follow.
   - **Cadence:** at least 3 new or improved pages a day through a Sonnet SEO agent; a weekly full-site SEO audit; every deploy's release note lists the new pages.
   - **Quality:** official-fixture quotes only (tested); shipped features only; "not legal advice"; a demo or tool CTA on every page.
   - **Status:** starts once BL-171's technical base lands.

173. **BL-173 Community announcements in three clicks (Halloween party, happy holidays, graduation reminders, pet control).** Migration: no (reuse the existing composer and send path). Owner ask (Asaf, 2026-10-26: "very simple to generate one; focus on simplicity").
   - **Flow:**
     1. **Pick an occasion** from a grid of ready templates (Halloween party, happy holidays, New Year, Fourth of July, graduation congratulations and parking reminder, pet waste and leash rules, pool opening and closing, trash or bulk-pickup change, landscaping and water day, community yard sale, holiday lights, meeting reminder, severe weather), or **type one sentence** ("Halloween party Oct 31 at 6pm at the clubhouse").
     2. **The app drafts it:** a friendly subject and body, plus a short SMS version (279 characters or less) and the Spanish version where the composer supports it. Event fields (date, time, place) come from the sentence.
     3. **Review and send:** one screen with a preview. Send to all residents now or schedule. The board clicks Send.
   - **Seasonal nudges:** the dashboard and digest suggest the next occasion ("Halloween is Friday: send a party notice?"), dismissible.
   - **Rules:** sending is the board's explicit action; existing opt-outs, channel consent and the outbound guard apply; no PII in logs; the tone stays neutral (no religious assumptions in "holidays" defaults).
   - **Status:** dispatched 2026-10-26 (Sonnet).

174. **BL-174 Marketing site restyle inspired by nice.com (colors and design patterns).** Migration: no. Owner ask (Asaf, 2026-10-26). Decision: `docs/decisions/2026-10-26-website-nice-inspired-design.md`.
   - Analyze www.nice.com: palette, type, sections, components. Map it onto the BL-170 design system tokens and restyle all marketing pages, including the BL-171 Georgia hub, guides and readiness check.
   - No copied assets, copy or code; the HomeownerHub identity stays.
   - **Status:** dispatched 2026-10-26 (Sonnet).

175. **BL-175 Tenant isolation audit and hardening (no cross-tenant data leaks or cross talk).** Migration: maybe (RLS fixes go into the next batch). Owner ask (Asaf, 2026-10-26).
   - **Audit scope (read-only, Opus advisor):**
     - RLS coverage and WITH CHECK, SECURITY DEFINER RPCs, service-role IDOR in server actions and routes;
     - active-org selection and impersonation, storage paths and signed URLs;
     - AI retrieval filters, jobs mixing orgs, Next caching keys, webhook org resolution;
     - exports, search, realtime, and logs.
   - **Then:** fix confirmed issues and add CI integration tests so isolation is enforced going forward.
   - **Status:** audit dispatched 2026-10-26.
