---
id: accounting-recurring-entries
title: Make a ledger entry repeat on a schedule
summary: Make a posted entry, like a monthly management fee, post itself again each month, quarter or year — then edit, pause or stop it.
topic: accounting
roles: [admin, board]
routes: ["/accounting/recurring", "/accounting/ledger/[id]"]
primary_route: /accounting/recurring
keywords: [recurring, recurring entry, recurring entries, pause recurring entry, edit recurring, change amount, cancel recurring entry, new rate, repeat, repeating, automatic entry, auto post, schedule, scheduled entry, monthly entry, journal entry, template, management fee, reserve transfer, reserve contribution, monthly, quarterly, annually, weekly, make recurring, every month, post itself, automatically, management company fee]
related: [accounting-reports-overview, accounting-draft-budget]
reviewed: 2026-10-18
---

Use this for an entry the treasurer posts the same way every time, such as a monthly management fee or a transfer to the reserve fund.

## Before you start
- Board admins and board members can make an entry recurring.
- The entry must already be posted in the ledger. It becomes the model for every copy.

## Steps
### Make an entry recurring
1. Open **Accounting**, then the **Ledger** tab, and select the entry you want to repeat.
2. Select [[Make recurring]].
3. In **Repeats**, choose Monthly, Quarterly, Annually, Weekly or Daily.
4. In **First run**, pick the first date a copy should post.
5. Select [[Save recurring entry]].

### Change the amount, accounts or schedule
1. Open **Accounting**, then the **Recurring** tab.
2. On the entry's row, select [[Edit]].
3. Change the **Description**, **Repeats**, **Next run**, or any line's **Account**, **Fund**, **Debit** or **Credit**.
4. Check the totals under the lines. Debits and credits must be equal, and each fund must balance on its own.
5. Select [[Save changes]].

The next copy uses the new details. Entries already posted, including the original, don't change. The row then says **Edited template** instead of the entry it copies.

### Pause, resume or stop it
- **Pause:** on the row, open the **⋯** menu and select [[Pause]]. Nothing posts until you resume it. The row shows **Paused**.
- **Resume:** open the **⋯** menu, select [[Resume]], pick the **Next run** date, then select [[Resume]] again.
- **Stop:** open the **⋯** menu, select [[Stop]], then [[Stop entry]] to confirm. No more copies post, and a stopped entry can't be resumed or edited. To repeat it again later, open the entry in the ledger and select [[Make recurring]].

## What happens next
- The entry is listed on the **Recurring** tab with how often it repeats, its **Next run** date and **Active**.
- Early each morning on a run date, a fresh copy of the entry's lines posts to the ledger, dated that day and marked **Recurring**. The next run date then moves forward.
- If a run was missed, the app posts one copy, not one for every missed period.

## If something goes wrong
- "Couldn’t save the template": nothing changed. Try again.
- "Pick today or a later date.": the **Next run** date is in the past for your association. Choose today or later.
- "Debits … and credits … must be equal.": change an amount so both sides match.
- "Each fund must balance on its own.": move money between funds with a separate transfer entry.
- "Choose an account in this association’s chart of accounts.": pick an account from the list.
- "This recurring entry was stopped.": a stopped entry can't change. Make the entry recurring again from the ledger.
- No copy posted on the run date: copies post only into the current open fiscal period. Check **Accounting**, then **Periods**.

## Good to know
- Board admins and board members can edit, pause, resume and stop recurring entries. The app records who made each change.
- You can't set an end date. Stop the entry when it should end.
- [[Make recurring]] on the same ledger entry again updates its schedule instead of adding a second one, and starts a stopped one again.
- Reversing the original entry doesn't stop the copies. Pause or stop the recurring entry instead.
- [[Make recurring]] isn't shown on an entry that was reversed.
