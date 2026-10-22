---
title: Import a CINC aging report as opening balances, plus security fixes
shots:
  - route: /accounting/opening-balances
    caption: Opening balances, with the CINC aging report option
---

## Summary

Associations moving from CINC can now upload their aging report to set each home's opening balance. As with every opening balance, nothing posts until a board member approves. This release also includes fixes from today's security review.

## What's new

### Accounting
- **CINC aging report:** in Opening balances, choose "Upload a CINC aging report". A preview matches each row to a home by address, lists anything it couldn't match and why, and checks the file against the report's own grand total. "Use these balances" fills the wizard, which proposes one journal entry through Approvals. Homeowner names in the file are never read.

### Security
- **Board packet:** a meeting is now read only within your own association.
- **Text errors:** phone numbers are hidden from error messages even when formatted with spaces or dashes.
- **Bank import:** stricter decoding of bank statement files.

## Good to know
- The CINC column layout hasn't yet been checked against a real export. If your board used CINC, please try it and tell us if any column isn't recognised.
