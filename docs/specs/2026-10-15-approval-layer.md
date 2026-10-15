# Sub-project D: Approval layer (first consumer: W18)

Date: 2026-10-15. Status: implemented on `claude/approval-layer`; migration
`0060_approval_requests.sql` has **not** been applied to production yet.
The apply SQL is `docs/specs/2026-10-15-approval-layer-apply.sql`.

## Problem

W18 Step A (exact memo + amount match) used to post a cash-receipt journal
entry, insert a `payments` row and mark the assessment `paid`/`partial`, all with
no person involved. Three separate reviews flagged it, and the owner has accepted
the recommendation to put a board/admin approval in front of it before a real
bank account is connected.

## What already existed, and what this design reuses

| Existing piece | What it does | How it is used here |
|---|---|---|
| `defineWorkflow` `humanApprovalRequired` / `api.requireHumanApproval()` (`packages/ai/src/workflow.ts`) | Sets `ai_runs.status = 'pending_human_approval'` | W18 Step A now calls `requireHumanApproval()`, so its audit row says it is waiting on a person. |
| `ai_runs.human_approved / human_approver / approved_at` | Columns for recording a decision. **No code anywhere has ever written them.** W3's queue only reads `pending_human_approval` runs. | Not used as the store (see "why a table" below). |
| `/accounting/bank/queue` + `apps/hoa/src/lib/bank-rec.ts` | The human-review queue for transactions W18 leaves unmatched (Steps B/D). `confirmFuzzyMatch` is already a person-approved posting. | The proposals section is part of this page. Pending proposals are listed above the unmatched list, and their transactions are left out of that list. The approved posting has the same JE shape and side effects as Step A and `confirmFuzzyMatch`. |
| `bank_transactions.reconciliation_attempted_at` (0057) | Stops plaid-sync re-submitting the human-review backlog each tick | No change. A transaction with a proposal is "attempted", so plaid-sync does not re-propose it. |
| `zelle_inbound_matches` | Audit row per Zelle match | Still written. It is now written when the posting happens, not when the proposal is made, because "matched" should mean money was booked. |

No Inngest `waitForEvent` approval pattern exists in this repo (searched
`packages/jobs`). W18 runs synchronously from the Plaid webhook, from plaid-sync
and from the queue's Re-match button. A durable workflow that sleeps for days
waiting on a board member would add a second runtime and give nothing a table
row doesn't, so this design doesn't use one.

### Why a table, and why not `ai_runs`

`ai_runs` is an append-only audit log of model calls: one row per *run*. Re-match
and plaid-sync can each run W18 against the same transaction, which produces
several runs. An approval has to be one row per proposed *action*, with:

- a uniqueness rule (at most one live proposal per bank transaction). That can't
  be expressed on `ai_runs` without an expression index over `input` JSON.
- a `posted` state and a link to the journal entry it produced, which `ai_runs`
  has no way to hold.
- a structured payload that the executor posts from.

`ai_runs` also gets its row id only after `run()` returns, which is too late for
the workflow body to cite it. So the proposal is keyed by
`(workflow_id, subject_type, subject_id)`, and the run that produced it can be
found the same way the queue page already finds it, by
`ai_runs.workflow_id = 'W18'` and `input->>'bankTransactionId'`.

## Data model: `public.approval_requests` (migration 0060)

| column | notes |
|---|---|
| `id uuid pk` | |
| `organization_id uuid not null → orgs` | RLS key |
| `workflow_id text not null` | `'W18'` |
| `action_type text not null` | `'w18.cash_receipt'`: selects the executor (see "Adoption") |
| `subject_type text not null`, `subject_id uuid not null` | `'bank_transaction'`, the txn id |
| `payload jsonb not null` | Everything the executor needs, captured when the proposal is made |
| `summary text not null`, `amount numeric(12,2)` | For the queue UI without parsing the payload |
| `status text` | `proposed` / `approved` / `rejected` / `posted` / `failed` |
| `proposed_at` | |
| `decided_by → profiles`, `decided_at`, `decision_reason` | Who approved or rejected, and why (a reason is required to reject) |
| `posted_at`, `result_ref uuid` | When the posting landed, and the journal entry id it produced |
| `error text` | Why posting failed, or a note on a partial side-effect failure |

Partial unique index `approval_requests_live_subject_uniq` on
`(action_type, subject_id) WHERE status IN ('proposed','approved','posted')`:
at most one live proposal per transaction. A `rejected` or `failed` proposal
frees the slot, so a deliberate Re-match can propose again.

## States

```
              decide(approve)            executor ok
 proposed ───────────────────▶ approved ─────────────▶ posted
    │                              │
    │ decide(reject, reason)       │ executor refused / JE failed cleanly
    ▼                              ▼
 rejected                        failed
```

- Transitions only move forward, and each one stamps its own columns, so nothing
  is overwritten. The row is its own audit trail.
- `proposed → approved|rejected` happens only through the
  `public.decide_approval_request(id, decision, reason)` RPC.
- `approved → posted|failed` happens only in server code under service role
  (`packages/workflows/src/approvals`).

## Who can approve

`decide_approval_request` is `SECURITY DEFINER`. It raises `42501` unless
`auth.uid()` is set and `auth_is_board_or_admin(row.organization_id)` is true.
A resident, a board member of another org, and an anonymous caller all get the
same error. A missing id gets that error too, so the RPC can't be used to probe
which ids exist.

Authenticated callers get **no** INSERT, UPDATE or DELETE policy on the table.
Without a policy RLS denies, so a board member can't edit `payload` (the amount
or the assessment) and then approve, and can't set `posted` by hand. The only
thing a user can do is the decision. SELECT is limited to board/admin of the org
(`auth_org_ids()` + `auth_is_board_or_admin()`), the same as `ai_runs` after
0036, because the payload holds financial detail.

## Idempotency: never double-post

1. **Decision claim.** The RPC updates with `WHERE id = $1 AND status = 'proposed'`
   and returns `won: true` only to the call that changed the row. Postgres row
   locking makes two concurrent approvals serialise, and the second one
   re-checks `status` and finds `approved`. **Only the winner runs the
   executor.** A losing call returns the current state (`approved` or `posted`)
   as an idempotent success.
2. **Executor re-validation.** Before posting, the executor re-reads the bank
   transaction and the assessment. If the transaction is already matched (for
   example, a manager used "Confirm match" in the meantime), the amount or
   association no longer agrees with the payload, or the assessment is no
   longer open or partial, it marks the proposal `failed` with the reason and
   posts nothing.
3. **Posting order.** The JE is posted first (`postJournalEntry` rolls back its
   own header on failure, so a failed post leaves no JE behind). Next comes the
   conditional link `bank_transactions.matched_journal_entry_id` (`... IS NULL`),
   then the payment, the assessment status and the `zelle_inbound_matches` row.
   After a JE exists, the proposal is always marked `posted` with
   `result_ref = JE`, even if a later side effect fails. That error goes into
   `error` instead of reverting to a state that would allow a retry.
4. **Crash between JE and `posted`.** The row stays `approved` with no
   `posted_at`. Nobody can claim it again, so there is no automatic re-post. The
   queue shows it as "approved, posting incomplete" for an operator to resolve by
   hand. Choosing a stuck row over a possible double post is deliberate.

Known residual risk: the conditional link in step 3 runs *after* the JE posts. A
manager running "Confirm match" on the same transaction in that same
millisecond window could produce two JEs. The executor detects this (the link
updates zero rows) and records it in `error` for review. The complete fix is a
DB-level partial unique index on `journal_entries(source_id) WHERE source =
'bank_rec' AND status = 'posted'`. It is parked because it needs a production
duplicate audit first (see "Follow-ups").

## What happens to existing auto-posted rows

Nothing. This change only affects new postings. JEs that W18 already auto-posted
stay as they are. No backfill of `approval_requests` is done, and no
re-validation of past postings. In production today there is no live bank
connection posting through W18 (it is the reason this was a precondition), so
the historical set is expected to be empty or demo-only.

## What W18 does now

- **Step A** (exact memo + amount) **proposes** instead of posting. It inserts
  an `approval_requests` row (`w18.cash_receipt`), calls
  `api.requireHumanApproval()`, and returns `matchMethod: 'proposed_exact'` with
  `matchedJournalEntryId: null` and `approvalRequestId`. If a live proposal
  already exists (unique violation), it returns that one.
- Steps B and D: unchanged. They were already queue-only.
- **Step C** (link to an existing, person-posted JE within ±7 days): unchanged.
  It still auto-links. It creates no JE, moves no money and changes no
  assessment. It only records that a bank line corresponds to a JE a person
  already posted. Gating it would add approvals for entries that already had a
  person behind them. (Follow-up: if the board wants Step C gated too, it is a
  second `action_type` with a trivial executor.)
- `humanApprovalRequired` on the workflow definition stays `false`. That flag
  means "every run needs approval", and Step C runs do not. The per-step
  `requireHumanApproval()` calls are where the gate actually lives. The comment
  in the definition says so.

## How other workflows adopt this later

1. Pick an `action_type` (`'<workflow>.<verb>'`).
2. From the workflow body, call `proposeApproval(db, {...})` (in
   `packages/workflows/src/approvals`) instead of performing the side effect, and
   call `api.requireHumanApproval()`.
3. Register an executor in `APPROVAL_EXECUTORS`:
   `(adminDb, request, approverId) => Promise<{ ok: true, resultRef } | { ok: false, error }>`.
   It must re-validate against current state and must be safe to run exactly
   once.
4. The generic `approveRequest` / `rejectRequest` server actions and the
   decision RPC need no changes. The queue UI lists by `action_type`.

Candidate next consumers: W3 violation notices (today `pending_human_approval`
runs nobody can resolve), invoice auto-coding, and W18 Step C if wanted.

## Out of scope / follow-ups

- **Accounting RLS is org-only.** `journal_entries`, `ledger_entries`,
  `payments`, `assessments` and `bank_transactions` use `org_access` (0006), so
  any org member, a resident included, can write them directly through
  PostgREST. The approval layer gates the *automated* path. It can't stop a
  resident who goes around the app. This is pre-existing and recorded in
  `docs/parking-lot.md`.
- The DB-level `journal_entries` bank_rec uniqueness index (see above).
- A dashboard "Waiting on you" entry for pending postings
  (`apps/hoa/src/lib/dashboard/queries.ts` `ApprovalKind`).
- Notifications to the board when a proposal is created.
