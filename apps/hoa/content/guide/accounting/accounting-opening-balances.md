---
id: accounting-opening-balances
title: Enter opening balances
summary: Start the books from a date with each fund's bank balance and what each home owed. A board member approves them before anything posts.
topic: accounting
roles: [admin, board]
routes: ["/accounting/opening-balances"]
primary_route: /accounting/opening-balances
keywords: [opening balances, opening balance, starting balance, beginning balance, cutover, conversion, switch from manager, take over books, migrate books, carry forward, balance forward, owner balances, homeowner balances, arrears, past due balances, aging, cinc, import balances, bank balance, reserve balance, fund balance, opening equity, prepaid assessments, unpaid bills, accounts payable]
related: [setup-import-roster, accounting-reports-overview, accounting-reserves]
reviewed: 2026-10-20
---

Use this when you take over the books, from a management company or a spreadsheet. Pick a start date. Enter what the bank held and what each home owed on that date. From then on the reports, the resident ledgers and the dues aging match the bank.

## Before you start
- Board admins and board members can enter opening balances. Residents can't.
- The books must be open, with a fiscal year that covers your start date. The first day of the fiscal year is usually easiest: the old books close the day before.
- Have the bank statement balance for each fund's account on the start date.
- Have a list of what each home owed: the old manager's aging report, or the balances column of your roster spreadsheet.
- Import your homes first. Every home on the list must already be in HomeownerHub.

## Steps
1. Open **Accounting** and select the **Opening balances** tab.
2. Choose the **Start date**. For each fund, enter its bank balance on that date. Leave a fund blank if it has no bank account yet. Select [[Next]].
3. Under **Homes and amounts**, paste one line per home that owed money: the home and the amount, for example "12 Oak Street, 450.00" or "Unit 7, 1,200". You can paste from a spreadsheet, select [[Upload a CSV]], or, just after a roster import, select [[Use the roster balances]].
4. Fix any line listed under **Fix these lines to continue**. Each one says what is wrong. Choose when **These balances are due on**, then select [[Next]].
5. Optional: enter **Prepaid assessments** (dues owners paid before they were billed) and **Unpaid bills** for each fund. Select [[Next]].
6. Check the review: the journal entry, fund by fund, and the charge each home gets. Select [[Send to Approvals]].
7. A board member opens **Approvals**, checks the opening balances and selects [[Approve & post]]. If something is wrong, they select **Reject** and give the reason, and you enter the balances again.

## What happens next
- Nothing posts until a board member approves it in Approvals.
- Approving posts one journal entry, dated the start date. It debits each fund's cash account. It debits accounts receivable with the total the homes owe, in the Operating fund. It credits prepaid assessments and accounts payable. The difference goes to that fund's balance account (3000 Fund Balance — Operating, 3010 Fund Balance — Reserve). So the entry balances in every fund.
- Each home that owed money gets one charge for that amount, due on the date you chose. It shows on the resident's ledger and statement, and in dues aging.
- The Opening balances page shows what was proposed, whether it is waiting, posted or rejected, and links to the posted entry.

## If something goes wrong
- "No open fiscal year covers that start date.": choose a date in an open year, or an admin opens the year under **Periods** first.
- "No home in this association matches.": check the address or unit number against **Properties**, or import the missing home first.
- "Several homes match. Add the unit number to tell them apart.": the address has several units. Add the unit, for example "40 Elm Court, 101, 250.00".
- "A credit balance can't be a charge.": leave that home out of step 2 and add its credit to **Prepaid assessments** in step 3.
- "This home is already on line 3.": list each home once, with its total.
- "Opening balances … are already waiting in Approvals.": a board member approves or rejects them there first. Sending the same start date again doesn't make a second copy.

## Good to know
- You can enter opening balances only once. If they are already posted, correct them with an entry in the ledger. A second opening balance would count everything twice.
- Charges still unpaid after their due date get the nightly late fee, like any other charge. If the old balances already include late fees, give owners a due date a few weeks out.
- The page warns you if homes already have open charges, or the ledger already has entries. Leave out anything already recorded, or it will be counted twice.
- Amounts in parentheses, such as "(50.00)", are read as credits.
