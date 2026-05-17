# 005 — Payment rails strategy for v1

**Date:** 2026-05-13
**Status:** Accepted
**Context:** Build Spec v1.1 §16. Residents expect the low-friction feel of
Zelle / Venmo. Direct API integration is **not viable**: Zelle has no
commercial API for non-bank entities, and Venmo personal-account API
explicitly forbids merchant use. We need to deliver that UX without those
APIs.

## Decision

Ship four rails in v1. The fourth — Pay-by-Zelle assisted — is the
differentiator most self-managed HOA boards will recognize on sight.

| Rail | How | Resident UX | Reconciliation | Cost |
|---|---|---|---|---|
| **ACH** | Plaid + Stripe ACH | "Connect bank, autopay, done" | Auto via Stripe webhook | Free integration; per-txn Stripe fee |
| **Card** | Stripe Checkout | One-tap | Auto via webhook | Free; 2.9% + 30¢ (passed to resident as convenience fee) |
| **Apple Pay / Google Pay** | Stripe Checkout (enable in dashboard) | One-tap on phone — same feel as Venmo | Auto via webhook | Free; same as card |
| **Pay-by-Zelle (assisted)** | No Zelle API; we close the reconciliation loop via Plaid bank feed + W18 | Resident sends from their bank's Zelle app with our memo code; we auto-match the inbound deposit | **W18 Bank Reconciliation Agent** matches memo `<assoc>-<unit>-<purpose>` to assessment | Free integration; per-txn Plaid usage only |

## Pay-by-Zelle UX (the killer feature for self-managed boards)

Most HOAs already accept Zelle today. The entire pain is **manual
treasurer reconciliation**. We don't need a Zelle API to win — we need
to close the reconciliation loop with W18.

### Resident flow

1. Resident opens portal, sees balance ($345 due), taps **Pay**.
2. Sees four options: Bank · Card · Apple Pay/Google Pay · **Pay by Zelle**.
3. Taps Pay by Zelle. Modal shows:
   ```
   Send $345.00 from your bank's Zelle app to:
     pay@madisonpark.homeownerportal.com
   Memo: MP-1247-DUES
   We'll mark your account paid the moment it arrives. Usually within 1 hour.
   ```
4. Resident leaves the portal, opens their bank app, sends Zelle with
   the memo code.
5. Plaid feeds the inbound deposit into our `bank_transactions` table.
6. **W18 (Bank Reconciliation Agent)** parses the memo, finds
   `MP-1247-DUES`, looks up the assessment, confirms amount, posts the
   matching JE, marks the assessment paid.
7. Resident gets confirmation email within an hour.

### Per-association setup

- Each association gets a unique sub-address:
  `pay@<association-slug>.homeownerportal.com` (one option) **or** a
  shared inbox with longer memo prefixes (the other option). Decision
  deferred to spec §18 open question #1 — resolve before W18 ships
  Pay-by-Zelle in production.
- Each unit gets a memo prefix: `<assoc-slug>-<unit-number>-<purpose>`
  where purpose ∈ {`DUES`, `FEE`, `FINE`, `ASSESS`}.
- Association's primary bank account is connected via Plaid; deposits
  flow into `bank_transactions`.

## Memo-code grammar (W18 input contract)

Regex: `[A-Z]{2,4}-\d{3,5}-(DUES|FEE|FINE|ASSESS)`

Components:
- `[A-Z]{2,4}` — association slug, e.g. `MP` (Madison Park). Stored on
  `associations.slug` (the spec doesn't name this column today; add
  in migration 0006 next to `associations.state`).
- `\d{3,5}` — unit number (lot or unit_number).
- `(DUES|FEE|FINE|ASSESS)` — purpose; maps to `assessments.assessment_type`.

W18 auto-matches at **confidence ≥ 0.99** on exact memo + amount within
±$0.50. Anything below threshold goes to the manager queue.

## What we explicitly DO NOT do in v1

| Rail | Why not |
|---|---|
| Direct Zelle API | Does not exist for non-bank entities. Not negotiable. |
| Direct Venmo personal-account API | Venmo ToS explicitly forbids merchant payments via personal accounts. |
| Venmo for Business | Defer to v1.5. Requires per-association PayPal Business onboarding — operational complexity not justified for the design-partner phase. |
| Cash App | No production API for businesses. |

## Acceptance criteria

- [ ] Madison Park residents can pay via all four v1 rails in production
- [ ] Pay-by-Zelle test: 5 inbound Zelle deposits with valid memo codes auto-match within 1 hour at 100%
- [ ] Pay-by-Zelle test: 2 deposits with malformed memos route to the fuzzy-match queue and resolve within 1 day with manager approval
- [ ] No payment posts without a corresponding JE in the ledger (enforce at API layer in `packages/payments/`)
- [ ] Each rail's reconciliation lands in W18's `ai_runs` row with `match_method` recorded (`auto_exact` / `auto_fuzzy` / `manual`)

## Marketing posture

Per spec §19 deliverable #2: a "Pay by Zelle, finally reconciled"
landing page ships at end of month 3 alongside the W18 production
rollout. Vantaca and CINC don't do this for self-managed boards;
PayHOA doesn't have real accounting. The landing page slot is between
"low-friction resident UX" and "real treasurer-grade accounting."

## Open follow-ups

1. **Per-association sub-domain email vs single inbox** (spec §18 #1) —
   decide week 8.
2. **Single Plaid item per association vs per-bank-account** (§18 #2) —
   decide week 6. Affects `bank_accounts.plaid_item_id` cardinality in
   migration 0006.
3. **Venmo for Business in v1.5** — open, prioritize once we have
   ≥ 3 residents asking for it.
4. **CAM-friendly ACH (Heritage Bank, Alliance Association Bank) vs
   Stripe** — defer; Stripe is sufficient for the design-partner phase.
