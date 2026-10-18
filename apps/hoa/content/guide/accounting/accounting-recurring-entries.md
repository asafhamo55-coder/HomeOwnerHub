---
id: accounting-recurring-entries
title: Make a ledger entry repeat on a schedule
summary: Turn a posted journal entry, like a monthly management fee or reserve transfer, into one that posts itself again each month, quarter or year.
topic: accounting
roles: [admin, board]
routes: ["/accounting/recurring", "/accounting/ledger/[id]"]
primary_route: /accounting/recurring
keywords: [recurring, recurring entry, recurring entries, repeat, repeating, automatic entry, auto post, schedule, scheduled entry, monthly entry, journal entry, template, management fee, reserve transfer, reserve contribution, monthly, quarterly, annually, weekly, make recurring, every month, post itself, automatically, management company fee]
related: [accounting-reports-overview, accounting-draft-budget]
reviewed: 2026-10-18
---

Use this for an entry the treasurer posts the same way every time, such as a monthly management fee or a transfer to the reserve fund.

## Before you start
- Board admins and board members can make an entry recurring.
- The entry must already be posted in the ledger. It becomes the model for every copy.

## Steps
1. Open **Accounting**, then the **Ledger** tab, and select the entry you want to repeat.
2. Select [[Make recurring]].
3. In **Repeats**, choose Monthly, Quarterly, Annually, Weekly or Daily.
4. In **First run**, pick the first date a copy should post.
5. Select [[Save recurring entry]].

## What happens next
- The entry is listed on the **Recurring** tab with how often it repeats, its **Next run** date and **Active**.
- Early each morning on a run date, a fresh copy of the entry's lines posts to the ledger, dated that day and marked **Recurring**. The next run date then moves forward.
- If a run was missed, the app posts one copy, not one for every missed period.

## If something goes wrong
- "Couldn’t save the template": nothing changed. Try again.
- No copy posted on the run date: copies post only into the current open fiscal period. Check **Accounting**, then **Periods**.

## Good to know
- To change how often it repeats or the next date, open the same entry and select [[Make recurring]] again. It updates the schedule instead of adding a second one.
- You can't pause, stop or delete a recurring entry in the app, and reversing the original entry doesn't stop the copies. Contact support to stop one.
- You can't change the amounts. Every copy uses the original entry's lines. For a new amount, post a new entry and make that one recurring, and ask support to stop the old one.
- [[Make recurring]] isn't shown on an entry that was reversed.
