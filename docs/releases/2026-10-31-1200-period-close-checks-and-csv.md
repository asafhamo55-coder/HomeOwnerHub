---
title: Closing a period now checks first, and Budget vs actual exports to a spreadsheet
---

## What's new

### Closing a period
- You can close a period only after its end date has passed. Before that, the page says when you can close it.
- Before you confirm, the close dialog warns you about:
  - draft journal entries dated in the period, which won't be included;
  - bank proposals that are still waiting for review;
  - any bank account that isn't reconciled through the period's end date. This uses the statement date of the last approved reconciliation.
- If one of these checks can't run, the dialog says so instead of showing an all-clear. You can still close the period after reading the warnings.

### Budget vs actual
- A new "Export CSV" button downloads the report as a spreadsheet with budgeted, actual and variance for each account. Accounts that aren't in the budget are marked as such.
- Negative amounts in all CSV exports now open in spreadsheets as numbers, not text.
