---
title: Find every account, a safer lease cap, background jobs that report problems, and a documents overview
---

## Fixes

- **Accounts beyond the first 50.** Inviting someone who already has an account, filling in members' emails, and building the board's email list now find every account. Before, they only looked at the first page of about 50. Inviting a platform admin now stops and asks you to try again if the check for an existing account fails, instead of sending a second invite.
- **Rental cap.** If the cap can't load, the Leases page says so and locks the cap editor, so nobody saves over a cap they couldn't see. Before, it showed "No cap set".
- **Platform admin.** The audit log, stats and tenant pages show a clear error when something fails to load, instead of "no activity" or zeros.
- **New-ticket alerts to the board.** If the alert can't be prepared, the job now retries and reports the problem. Before, it finished quietly. A replayed alert no longer pushes again to board members who already got it.
- **Nightly late fees and recurring journal entries.** If any association or rule fails, the team now gets a report. Amounts and postings are unchanged.

## What's new

### Documents
- Counts at the top: total documents, documents that can't be searched yet, CC&Rs and rules. "Not searchable" opens the list of documents that need text.

### Website
- New pages:
  - /guides/texas-hoa-violation-notice-and-hearing-209-006
  - /templates/texas-hoa-violation-notice-checklist
