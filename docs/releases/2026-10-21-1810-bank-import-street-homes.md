---
title: Import bank statements, leave homes out of a street message, and a cleaner Spanish editor
shots:
  - route: /accounting/bank
    caption: Bank accounts, with Add manual account
  - route: /communications/new
    caption: The message composer
---

## Summary

Boards whose bank isn't linked can now add the account by hand and import a statement file. When sending to a street, you can now leave out individual homes. The Spanish version of a message is written in the same plain editor as the English one.

## What's new

### Bank
- **Manual bank account:** add an account without linking your bank, for credit unions or treasurers who prefer not to link.
- **Import a statement:** upload a CSV, OFX or QFX file from your bank. A preview shows the new transactions, money in and out, and anything already imported, before anything is saved. Imported transactions go to the reconciliation queue like linked ones. Re-importing the same or an overlapping statement never adds a transaction twice.

### Messages
- **Leave homes out:** when you send to a street, every home is ticked and you can untick any of them. Unticked homes get nothing, including on scheduled sends.
- **Spanish version:** written in the same plain editor as English, with the "I've read the Spanish version" tick kept.

### Behind the scenes (not visible yet)
- **Dues rates:** a schedule of dues rates, with billing that pre-fills the rate in effect and a draft owner notice for an increase, including the Georgia rules. It turns on after a one-time database update (owner action).
- **"Delivered" on texts:** built and switched off until texting is set up.

## Good to know
- Only board members and admins can add accounts or import statements, and every import is recorded in the activity log.
