# Accounting RLS (migration 0061)

Status: in code on `claude/accounting-rls`, **not yet applied to production**.
Apply with `docs/specs/2026-10-15-accounting-rls-apply.sql`.

## Problem (proven)

Every money table still had 0006's single policy:

```sql
CREATE POLICY org_access ON public.<t> USING (organization_id = ANY (public.auth_org_ids()));
```

It is a FOR ALL policy with no WITH CHECK, so membership alone gated SELECT, INSERT,
UPDATE and DELETE. Any member, a plain resident included, could use the anon key
and their own session to do all of the following:

- post journal entries, edit or delete ledger lines;
- mark their own assessment `paid`, insert payments, delete fines;
- re-point bank matches, close fiscal periods, approve budgets;
- **read `plaid_items.access_token`** (live bank credentials), the whole GL, the bank
  feed, and every neighbour's assessments and payments.

`tests/integration/security/accounting-rls.test.ts` ran against the pre-0061
schema with **89 failed / 9 passed** (all 9 passes were positive controls). After
0061: **98 / 98 pass**.

The accounting server actions also never checked role. The `(dashboard)` layout
redirect is not a gate, because a server action is a public POST endpoint.

## Inventory

### Money tables (21)

| Table | Org column | User-session writers (board UI) | Service-role writers |
|---|---|---|---|
| journal_entries, ledger_entries | organization_id | `postJournalEntry` via bank-rec, invoices, assessments, journal-entries, periods, bank-reconciliation actions | W18 approval executor, recurring-jes, late-fees jobs |
| assessments | organization_id | lib/assessments.ts, payment-plans.ts, bank-rec.ts | hoa-late-fees job, W18 approval |
| payments | organization_id | assessments.ts, invoices.ts, bank-rec.ts | W18 approval |
| bank_accounts | organization_id | /api/plaid/exchange | plaid webhook / sync |
| bank_transactions | organization_id | bank-rec.ts, bank-reconciliation.ts | plaid-sync, W18 |
| bank_reconciliations | organization_id | bank-reconciliation.ts | — |
| zelle_inbound_matches | organization_id | bank-rec.ts | W18, W18 approval |
| funds, chart_of_accounts | organization_id | — (seeded) | seed scripts |
| fiscal_periods | organization_id | periods.ts (close), assessments.ts | — |
| budgets, budget_line_items (via budget) | organization_id | budgets.ts | — |
| invoices | organization_id | invoices.ts | — |
| payment_plans | organization_id | payment-plans.ts | — |
| payment_methods | organization_id | none | none |
| recurring_journal_entries | organization_id | journal-entries.ts (promote) | recurring-jes job |
| adjusting_entries, closing_entries (via JE) | — | periods.ts (closing) | — |
| plaid_items | organization_id | /api/plaid/exchange (INSERT, no RETURNING) | plaid-sync |
| hoa_dues (legacy) | org_id | none | platform-admin reads (admin client) |

Stripe webhooks (`apps/*/api/webhooks/stripe`) handle subscription billing only.
They touch no money table. There is no resident payment flow yet.

### Resident read paths (the only ones)

`apps/hoa/src/lib/resident-dashboard.ts` `getDues()`, used by `/resident` and
`/resident/dues`, makes two reads:

1. `assessments` filtered `.in('unit_id', unitIds)` for status open/partial;
2. `payments` filtered `.in('assessment_id', …)` for those assessments.

`unitIds` comes from `lib/resident.ts` `getOwnedUnits()`. It uses current
`ownerships.owner_user_id` first. If there are none, it falls back to
`property_residents` matched by email (moved_out_at IS NULL), then
`units.legacy_hoa_property_id`. No other resident-reachable code reads a money
table. Every other reader lives under `(dashboard)`, which redirects residents,
or is board-gated (`/api/ai/ask-community`) or uses the service role.

Impersonated resident views use the service-role client and are unaffected.

## Policy shape (0061)

- **14 board-only tables** (funds, chart_of_accounts, fiscal_periods,
  journal_entries, ledger_entries, budgets, bank_accounts, bank_transactions,
  bank_reconciliations, invoices, payment_methods, payment_plans,
  zelle_inbound_matches, recurring_journal_entries) and **hoa_dues**: SELECT,
  INSERT, UPDATE and DELETE each require `auth_is_board_or_admin(org)`.
- **assessments, payments**: writes require board/admin. SELECT is board/admin,
  or an org member reading rows for a unit in `auth_resident_unit_ids()`.
  For payments that means the payment's unit, or the unit of its assessment.
- **budget_line_items, adjusting_entries, closing_entries**: FOR ALL, scoped
  through the parent (budget or journal entry) with board/admin.
- **plaid_items**: INSERT only, board/admin. No user can SELECT, UPDATE or
  DELETE an access token.
- New helper `auth_resident_unit_ids()` (SECURITY DEFINER, STABLE) mirrors
  `getOwnedUnits()`: the union of current ownerships and an email match on
  current property_residents. The email match is case-insensitive, and the
  test seeds the email upper-cased on purpose.
- The migration drops **every** existing policy on these 21 tables, not only
  `org_access`. Permissive policies OR together, so a leftover hand-made policy
  would keep the hole open.

### Decisions

- **Resident read tightened** from org-wide to their own units. Before, a
  resident could read every neighbour's balance. The portal only ever asks for
  its own units, and both link paths are covered by tests.
- **Closing a period stays board-or-admin.** The app lets board close periods
  today, so admin-only would be a product change. Parked.
- **`pm_rent_ledger` is out of scope.** The PM role model is unclear: PM
  onboarding inserts `role = 'owner'`, which the 0012 CHECK rejects. Parked.
- **`ownerships` / `units` are still org-only FOR ALL.** A resident could forge
  an ownership row and then read that unit's dues. That is still far less than
  before 0061, when they could read every unit. Parked.

## App-layer gates

`apps/hoa/src/lib/accounting/guard.ts` `requireBoardOrAdminForAction()` returns
`{ ok: false, error }` and never redirects, the same pattern as `members.ts`.
It runs before any DB access, W18 run or Plaid call in the following places:

- bank-rec.ts: reRunBankMatch, confirmFuzzyMatch, categorizeAsExpense, ignoreTransaction
- assessments.ts: materializeCurrentPeriodAssessments, createDues, deleteAssessment, markAssessmentPaid
- bank-reconciliation.ts: reconcileBankAccount, approveReconciliation
- budgets.ts: createBudget, deleteBudget, saveBudgetLineItems, approveBudget
- invoices.ts: enterBill, deleteInvoice, markInvoicePaid
- journal-entries.ts: reverseJournalEntry, promoteJeToRecurring
- payment-plans.ts: createPaymentPlan
- periods.ts: closePeriod
- routes, returning 403: `/api/plaid/link-token`, `/api/plaid/exchange` (checked
  before the token exchange), `/api/accounting/board-packet/[periodId]`

The following were already gated and are unchanged: dues-reminders actions,
`approvals.ts` (role is checked inside `decide_approval_request`), and
`/api/ai/ask-community`.

## Double-post guard

`journal_entries_bank_rec_posted_uniq` is a unique index on `(source_id)` WHERE
`source = 'bank_rec' AND status = 'posted' AND source_id IS NOT NULL`.

- **Drafts are excluded.** Two racers both insert drafts. The loser's
  draft→posted UPDATE then hits 23505, and `postJournalEntry` deletes its draft
  and returns an error, before `confirmFuzzyMatch` or the approval executor
  writes any payment. An orphan draft can never block a re-post.
- **Reversed entries are excluded**, so a corrected re-match after a reversal
  still works.
- **Existing duplicates in prod**: the migration counts them first. If any
  exist, it skips the index with a WARNING and still applies the RLS. Part 1c
  of the apply script lists them by id. This skip path was exercised locally:
  the DO block succeeded and no index was created.

## Tests

- `tests/integration/security/accounting-rls.test.ts` (98 tests):
  - a resident is refused INSERT, UPDATE and DELETE on all 21 tables (re-read
    as service role);
  - a resident cannot post through the real `postJournalEntry`;
  - resident dues reads work via both the ownership and the email link;
  - a resident cannot see a neighbour's rows;
  - a resident reads nothing from the 19 board-only tables;
  - board/admin positive controls, including the real `postJournalEntry`, the
    bank-queue writes, the Plaid insert without RETURNING, and closing a period;
  - cross-org denial;
  - double-post: sequential, concurrent, and after a reversal.
- `apps/hoa/src/lib/accounting/guard.test.ts`: the guard itself, plus the four
  bank-queue actions refusing a resident before touching the association
  lookup, the DB or W18.
