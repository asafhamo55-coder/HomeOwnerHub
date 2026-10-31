---
title: Safer budgets and more honest reports for treasurers
---

## Fixes

- **Saving a budget can no longer wipe it.** Before, a failed save could leave the budget with no lines. Now the new lines are saved first, and the old ones are removed only after that works.
- **Approved bank reconciliations are locked.** Reconciling the same statement date again used to overwrite the numbers but keep the approval. Now it refuses, and asks you to use a different date.
- **Plain error messages.** Accounting actions that fail now say "Couldn't save that. Try again." instead of a technical database message.

## What's new

### Budget vs actual
- Spending on accounts that have no budget line now shows up, marked "Not in the budget". It is counted in the totals, so actual spending and the variance are no longer understated.
- The same rows appear in the annual report and the records-request packet, labelled "(not budgeted)".
- The "ahead of plan" hint now says it compares against the full-year budget.

### Bank accounts
- A bank account counts as reconciled only once a reconciliation is approved. A saved but unapproved statement no longer hides the "needs reconciling" reminder.
