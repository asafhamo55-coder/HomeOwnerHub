# W18 — Bank Reconciliation Agent

**Purpose:** Match incoming bank transactions (via Plaid) to journal entries. Auto-match Pay-by-Zelle deposits to assessments by memo code. Flag exceptions to a manager queue.

The reconciliation half of ADR-005 — the differentiator that makes "Pay by Zelle, finally reconciled" real.

## Public API

```ts
import { bankReconciliationAgent } from '@homeowner-portal/workflows/W18'

const { output, runId } = await bankReconciliationAgent.execute(
  { bankTransactionId },
  { organizationId },
)
```

`output.matchMethod` is one of `auto_exact`, `auto_fuzzy`, or `unmatched`. Auto-match writes the matching JE and updates `bank_transactions.matched_journal_entry_id` directly. Fuzzy matches land on the manager queue (an `ai_runs` row with `status='pending_human_approval'`).

## Pipeline (spec §5 W18)

For each unmatched `bank_transactions` row:

1. **Step A — exact memo match.** If memo contains `[A-Z]{2,4}-\d{3,5}-(DUES|FEE|FINE|ASSESS)`, look up the assessment by `memo_code`, confirm amount within ±$0.50, post the matching JE, mark the assessment paid. Write `zelle_inbound_matches.status='matched'`. **Confidence 0.99.**
2. **Step B — fuzzy memo + amount.** Match memo to a known resident name + amount within ±5% of an open assessment. **Confidence 0.7–0.9.** Manager queue.
3. **Step C — duplicate of recent JE.** Check for a matching JE posted within 7 days (likely a manual entry). If found, link `bank_transaction` to the existing JE without creating a new one.
4. **Step D — unmatched.** Present in the exception queue with the LLM's suggested categorization (account + fund + memo) for human disposition.

Confidence floor for auto-post: **0.95**. Below that, queue.

## Inputs / Outputs

| Field | Schema |
|---|---|
| Input.bankTransactionId | `uuid` |
| Output.matchMethod | `'auto_exact' \| 'auto_fuzzy' \| 'duplicate_je' \| 'unmatched'` |
| Output.matchedJournalEntryId | `uuid \| null` |
| Output.matchedAssessmentId | `uuid \| null` |
| Output.confidence | `number` (0..1) |
| Output.suggestedCategorization | `{ accountId, fundId, memo } \| null` (Step D only) |
| Output.notes | `string` (W18's plain-English reasoning summary) |

## Acceptance (spec §5 W18)

- [ ] Madison Park's last 90 days of bank transactions ingested via Plaid Sandbox; ≥ 70% auto-match rate at ≥ 95% accuracy.
- [ ] Pay-by-Zelle test: 10 synthetic Zelle deposits with correct memo codes auto-match 100%.
- [ ] Pay-by-Zelle test: 10 deposits with malformed memos go to fuzzy match correctly (no false auto-posts).

## Open work to hit acceptance

- [ ] Migration 0006 must be applied (this workflow assumes the accounting tables exist).
- [ ] Plaid webhook handler to ingest new transactions every 4 hours into `bank_transactions` (lives in `apps/hoa/.../api/webhooks/plaid/route.ts`, not in this package).
- [ ] Synthetic fixture set: 20 bank-transaction rows + matching/non-matching assessments for `eval.ts`.
- [ ] Resident-side Pay modal that displays the memo code (lives in the HOA app dues page; references `assessments.memo_code`).

## Versions

| Version | Changed | Notes |
|---|---|---|
| 1.0.0 (prompt 1.0.0) | initial | Memo-code regex per ADR-005; LLM only consulted for Step D categorization. |
