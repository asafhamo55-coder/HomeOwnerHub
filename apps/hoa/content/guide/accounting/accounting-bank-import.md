---
id: accounting-bank-import
title: Add a manual bank account and import statements
summary: Keep a bank account without linking it through Plaid. Import its statements as CSV, OFX or QFX files, then match them in the queue.
topic: accounting
roles: [admin, board]
routes: ["/accounting/bank", "/accounting/bank/[accountId]/import"]
primary_route: /accounting/bank
keywords: [import statement, upload statement, bank statement, csv, ofx, qfx, quicken, manual account, manual bank account, without plaid, don't want to link, credit union, small bank, bank export, download transactions, upload transactions, import transactions, duplicate transactions, already imported, skipped rows, rows not imported, new treasurer, new bank account]
related: [accounting-bank-reconcile, accounting-reports-overview, approvals-queue]
reviewed: 2026-10-21
---

Use this when your bank or credit union can't be linked through Plaid, or the board would rather not link it. You keep the account by importing the statement files your bank lets you download.

## Before you start
- Board admins and board members can add a manual account and import statements.
- A bank account belongs to a fund, like **Operating** or **Reserve**. If your association has no funds yet, an admin opens the books first, from **Link bank account**.
- From your bank's website, download the statement as **CSV**, **OFX** or **QFX** (the Quicken format). One file can be up to 2 MB and 5,000 transactions.

## Steps
1. Open **Accounting**, then the [[Bank]] tab, and select [[Add manual account]].
2. Enter the **Account name**, and if you like the **Bank name** and the **Last 4 digits**. Pick the **Fund**, then select [[Add account]].
3. On the import page, choose the **Statement file** and select [[Preview import]]. Nothing is saved yet.
4. Check the preview: how many transactions are new, how many are **Already imported, skipped**, and how many rows couldn't be read. The first new transactions are listed with their date, description and amount.
5. Select [[Import]] to save the new transactions, or [[Start over]] to pick another file. If rows couldn't be read, select [[Download these rows]] first to see them. They are usually totals, balance lines or notes from the bank.
6. Open the [[Matching queue]] and match, categorize or ignore each imported transaction, just like a linked bank's.
7. Next month, go back to [[Bank]] and select [[Import statement]] on the account's card.

## What happens next
- Imported transactions appear under **Unmatched transactions** in the matching queue until each one is matched or categorized.
- The account's card shows **Manual** and when a statement was last imported.
- Each import is recorded in the activity log with how many rows were added and skipped.
- Reconcile the account each month as usual, from [[Reconcile]] on its card.

## If something goes wrong
- "We couldn't find the date and amount columns.": the file needs a header row with a date column and either an amount column or separate debit and credit columns. Download the CSV again from your bank, without editing it.
- "That file isn't a CSV or OFX export.": you picked a spreadsheet, PDF or image. Download the statement as CSV, OFX or QFX.
- "The file is larger than 2 MB." or "more than 5,000 transactions": export a shorter date range and import it in parts.
- "The file changed since the preview.": preview the file again, then import.
- "This account is linked through Plaid": its transactions arrive on their own. Statements only go into a manual account.
- "Imported … transactions, then the rest failed.": import the same file again. Rows already in are skipped.

## Good to know
- A row counts as already imported when its date, amount and description match one in the account. Case, punctuation and spacing in the description don't matter. Importing the same or an overlapping statement twice is safe.
- Two identical transactions on the same day, like two equal checks, are both kept.
- Dates are read month first, the way US banks write them: 03/04/2026 is March 4.
- Money in is positive and money out is negative. Files with separate debit and credit columns are converted for you.
- The file is only read; nothing in it runs. Descriptions are stored as plain text, and the download of skipped rows is safe to open in Excel.
- Imported transactions aren't sent to the AI matcher on their own. Select **Re-match** on one in the queue to ask it.
