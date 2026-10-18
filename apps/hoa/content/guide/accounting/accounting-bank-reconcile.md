---
id: accounting-bank-reconcile
title: Connect your bank, match transactions and reconcile
summary: Link the bank through Plaid, clear the matching queue, then check the bank statement against the books each month.
topic: accounting
roles: [admin, board]
routes: ["/accounting/bank", "/accounting/bank/queue", "/accounting/bank/[accountId]/reconcile"]
primary_route: /accounting/bank
keywords: [bank, bank account, connect bank, link bank, plaid, checking, savings, operating account, reserve account, bank feed, bank sync, transactions, bank transactions, unmatched, matching queue, match deposit, deposit, categorize, expense, ignore transaction, ai match, suggested match, reconcile, reconciliation, bank reconciliation, bank statement, statement balance, ending balance, month end, doesn't match, off by, difference, balance the checkbook, hook up bank, transactions come in automatically, withdrawal, shows unmatched, record expense]
related: [accounting-reports-overview, accounting-enter-pay-bills, approvals-queue, accounting-monthly-board-report]
reviewed: 2026-10-18
---

Use this to bring the association's bank activity into the books and, once a month, prove that the bank statement and the books agree.

## Before you start
- Board admins and board members can link a bank, work the queue and reconcile.
- A bank account belongs to a fund, like **Operating** or **Reserve**. If your association has no funds yet, an admin opens the books first. The link dialog offers this.
- Have your bank sign-in ready for Plaid, and your latest bank statement for reconciling.

## Steps
1. Open **Accounting**, then the [[Bank]] tab, and select [[Connect bank]] (or [[Link bank account]] once one is linked).
2. Pick the **Fund** the account belongs to, select [[Continue to Plaid]], and sign in to your bank in Plaid's window.
3. When transactions arrive, select [[Review queue]] or [[Matching queue]]. Under **Suggested matches**, select [[Approve & post]] for each deposit the AI paired with an owner's charge, or [[Reject]] and give a **Reason**.
4. Under **Unmatched transactions**, deal with each one. For a deposit with a hint, select [[Confirm match]]. For a payment out, select [[Categorize]], pick the **Expense account**, then [[Post expense]]. Otherwise select [[Re-match]] to have the matcher try again.
5. Each month, go back to [[Bank]] and select [[Reconcile]] on the account's card.
6. Enter the **Statement date** and the **Ending balance** printed on the statement, then select [[Reconcile]].
7. In **History**, select [[Approve]] on that row. If there is a difference, the app asks first. Select [[Approve anyway]] to keep the difference on record.

## What happens next
- After linking, transactions appear after the first sync, usually within a few hours. After that they sync every few hours and most are matched to the ledger on their own.
- Approving a suggested match posts the payment and marks the owner's charge paid. Rejecting it sends the deposit back to the matching queue.
- An approved reconciliation shows **Approved** with the date in **History**.

## If something goes wrong
- "Bank linking is not set up yet. Ask support to enable Plaid.": bank linking isn't turned on for your account. Contact support.
- "Plaid is not reachable right now. Try again shortly.": wait a minute and try again.
- "This bank connection is already linked.": that bank is already connected. You'll see its accounts on the **Bank** page.
- "No funds yet": a bank account needs a fund. An admin selects [[Open the books]] in the dialog. A board member is pointed to the admins.
- **Off by** a dollar amount after you reconcile: usually deposits or cleared checks the books don't have yet. Match them in the queue, then reconcile again with the same statement date. Or approve with the difference on record.
- "Cash account for this fund is missing in the COA.": the fund has no cash account to compare against. Contact support.
- "Couldn't read the ledger balance, so nothing was saved. Try again.": nothing was recorded. Try again.

## Good to know
- Only checking, savings and money market accounts are added. Credit cards on the same bank login are skipped.
- Plaid handles your bank sign-in. The app never sees your bank password.
- A suggested match never posts, and no charge is marked paid, until a board member approves it. You can also approve these from **Approvals**.
- **Ignore (mark reviewed)**, in the **More actions** menu, records that you looked at a transaction without posting anything. It still stays in the unmatched list.
- Reconciling compares the statement with the books' cash balance for that account's fund, through the statement date. If you reconcile again for the same date, the new numbers replace the old ones.
- You can't type in or import bank transactions by hand. They only come from the linked bank.
