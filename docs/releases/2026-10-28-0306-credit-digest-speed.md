---
title: Residents see their credit, holiday reminders in the daily email, a faster dashboard
---

## Summary

Residents with an overpayment now see their credit on the dues and pay pages. The board's daily email mentions an upcoming holiday when there's a good moment to send the community a note. The dashboard's lease summary loads one step faster.

## What's new

### Credit on account for residents
- **Where it shows:** "Credit on account: $X" on the resident's Dues and Pay pages, only when they have credit.
- **On the pay page:** it explains that the board applies the credit to a charge, so the resident can pay the remaining balance or ask the board to apply the credit first.
- **What doesn't change:** the amount due shown is not changed by the credit.

### Holiday reminders in the board's daily email
- **The line:** when the daily email is going out anyway, it can include a line like "Halloween is Saturday: send your community a note →", which opens a ready draft.
- **When it appears:** only on the first day of the holiday's reminder window and the day before.
- **Dismissed holidays:** if the board dismissed that holiday on the dashboard, it doesn't appear.
- **No extra emails:** a holiday reminder never sends an email on its own.

### Faster dashboard
- **Lease summary:** now starts its counts while it is still reading homes, saving one database round trip.
- **Approvals, at-risk and heat-map:** these cards start some reads earlier.

## Under the hood

- **Daylight-saving test fix:** fixed a test that came up a day short around the daylight-saving change.
