# Writing off a collection case changes its status only

**Date:** 2026-10-31 (decided by the product loop, not by Asaf; reversible)

## Context

Round 17 fixed a bug where a board could not mark a collection case Resolved, mark it Written off, or Reopen it. The action that does this existed in the code, but nothing in the app called it.

## Decision

"Written off" records a status, a close date and a reason. It also writes a case event naming who did it and why.

It does NOT:
- change the owner's ledger balance;
- post a write-off charge or a credit;
- send anything to the owner.

The confirm dialog tells the board this.

## Why

A write-off that reduces what the owner owes is an accounting entry. It affects the books, the estoppel figure and any lien. That is a policy call for the board and Asaf, not a side effect of closing a case.

## Open question for Asaf

Should "Written off" also offer an optional, separate ledger write-off? If so, it should be an explicit second step with its own approval, and it should go through dual control when it is above the two-signature amount.
