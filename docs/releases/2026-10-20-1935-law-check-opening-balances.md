---
title: State-law check before fines and collection letters, and an opening-balance wizard
shots:
  - route: /accounting/opening-balances
    caption: Opening balances, step by step
  - route: /approvals
    caption: Approvals, with the new Opening balances section
---

## Summary

Before you fine a homeowner or send a collection letter, the app now checks your state's rules and tells you if something isn't allowed yet. New associations can enter their starting balances in a guided wizard, and nothing is posted until the board approves it.

## What's new

### State-law check before fines and collection letters
- **A "State law check" panel** appears when you move a violation to Fined and when you prepare a collection letter. It lists anything that may break your state's rules and cites the law. For example:
  - **California:** fines over $100 a day.
  - **Florida:** fines over $100 per violation (unless your documents allow more), or attorney's fees without the required notice.
  - **Texas:** fees before the 45-day notice, or a notice with no payment plan offered.
  - **Georgia:** attorney's fees after July 1, 2026.
- **To go ahead anyway,** you pick a reason, such as "our attorney advised it". The reason is recorded.
- **Approved letters with fees:** a letter approved earlier that lists fees without a recorded reason now needs a new draft before printing.

### Opening balances
- **Accounting → Opening balances** walks you through it: your bank balance per fund, what each home owed when you started (paste, upload a spreadsheet, or use your roster import), and any prepaid dues or unpaid bills.
- **Nothing posts on its own:** it all goes to Approvals as one item. When the board approves, the app re-checks everything, then posts the entries and opens each home's balance.
- **Carried-over balances** are given a due date (30 days out by default), so late fees don't hit them on day one.

### Security
- **More hardening:** the law loaders now cap download sizes, platform-admin invitations go through the same safety guard as everything else, and simultaneous Stripe subscription updates now always settle on the newest one.

### Ready for the next database update (switched off until then)
- **Late fees skip opening balances:** carried-over opening balances will never be charged late fees.
- **Inbox:** snooze a conversation, see how long the first reply took, and jump between an email and the document filed from it.
- **State-law deadlines:** "Mark as done" saves to a proper record.
- **When:** these switch on after the owner applies the next database update (owner checklist OA-1, runbook section J).

### Fixed
- **"Fined" and "Dismissed" violation statuses** couldn't be saved before this update, because the database rejected them. They're hidden until the next database update (owner checklist OA-1, runbook section I), then they come back and work.

## Good to know
- No one has checked these screens in a browser yet. Please try Accounting → Opening balances once.
