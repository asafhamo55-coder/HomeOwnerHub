---
title: The books now protect themselves at the database level
---

## Summary

This release has no new screens. The money rules that the app already followed are now enforced by the database too, so they hold even if a screen or a background job gets something wrong.

## What's better

### Accounting
- Nothing can be added, changed or deleted in a month the treasurer has closed. To correct a closed month, reverse the entry; the reversal is booked in the current open month.
- Posted journal entries can't be edited or deleted. A mistake is fixed with a reversal, so the history always shows what happened.
- After a home is sold, the buyer can't see credits the seller had on the account.

### Online payments (still switched off)
- When online payments are turned on, a refund that fails after it was recorded will go back on the books automatically, so the resident's balance stays right.

## Under the hood

- Database update 0082 was applied and all seven of its checks passed. 113 older entries already sat in closed months; they are history and were left as they are.
- The database type definitions were regenerated. Nothing was removed.
