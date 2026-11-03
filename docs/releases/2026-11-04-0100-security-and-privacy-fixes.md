---
title: Security and privacy fixes across the app
---

## Summary

This release has no new screens. It tightens who can see what, closes several security findings from the November 2 audit, and updates the web framework the app runs on.

## What's better

### Residents only see their own homes and associations
- Documents, insurance details, the resident assistant and account credit now come only from the associations a resident actually lives in.
- After a home is sold, the buyer no longer sees the seller's credits, messages, announcements or violation fines from before the sale. Violations that stay with the home still show, without the seller's fines.

### Safer sign-out on shared devices
- Signing out (or signing in as someone else) now clears the app's saved pages and turns off that device's push notifications. Someone using the same phone or computer next can't see the previous person's data.

### Boards
- Recording a payment against a charge or bill can no longer pay it twice, or pay more than is owed, if two people click at the same time.
- Reply drafts in the shared inbox use only the documents and records of the thread's own association.
- Mailing lists typed in by hand are no longer stored on the message record.

### Website
- The competitor comparison page is off the public website. Old links to it now open the pricing page. The comparison now lives in the investor deck.

## Under the hood

- The web framework and image library were updated to versions with security fixes.
- The browser security policy is stricter in production, outside tools used by our build system are locked to exact versions, and the developer sign-in shortcut now also refuses to run on test preview sites.
- Online payments, autopay, voting, polls, amenity booking, the community page, the message board and mailed letters are still switched off until their database changes and legal reviews are done.
