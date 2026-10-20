---
title: More security fixes, residents can answer violations, and invite all owners at once
shots:
  - route: /settings/members
    caption: Members, with Invite all owners and pending invitations
  - route: /settings/billing
    caption: Billing settings
---

## Summary

A second security review closed more gaps, including two serious ones in billing and event alerts. Residents can now open a violation on their home and reply to the board, and boards can invite every owner who doesn't have an account yet in one step.

## What's new

### Residents can answer violations
- **On their own home only:** a resident can open a violation from their portal, see the notice, the rule, the fix-by date and the history, and reply with a message and a photo of the fix.
- **For the board:** each reply arrives as a ticket and shows on the violation under "Homeowner responses".

### Invite all owners at once
- **One step:** Settings → Members → "Invite all owners without an account" shows how many will be invited, asks you to confirm, and sends the invitations in batches through the safety guard.
- **Pending invitations:** a list of everyone who hasn't accepted yet, with Resend and Revoke.

### Security
- **Billing is admin-only:** only admins can open the billing portal or start a checkout. Before this fix, any member could.
- **Event alerts and messages stay inside your association:** event alerts and "specific residents" messages can only reach your own association's residents.
- **Billing records can't be faked:** billing only trusts records written by the billing system itself.
- **Vendor invitations** are limited to your board.
- **Single invitations** go through the same safety guard as bulk invitations.
- **Plan and billing details** can only be changed by the billing system, once the next database update is applied (owner checklist OA-1, runbook section I).
- **Safer PDF reading:** the app reads uploaded PDFs with a maintained, sandboxed reader with size, page and time limits.

## Good to know
- No one has checked these screens in a browser yet. Please try Settings → Members once.
