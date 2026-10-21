---
id: settings-resident-payments
title: Turn on online dues payments with Zelle
summary: Enter your association's Zelle email or phone so residents get a Pay button with the exact amount and a memo code that matches the payment to their home.
topic: settings
roles: [admin, board]
routes: ["/settings/payments", "/accounting/bank/queue"]
primary_route: /settings/payments
keywords: [zelle, online payment, pay online, pay dues online, resident payments, pay button, turn on payments, set up payments, enable payments, memo, memo code, recipient, treasurer, receive payments, collect dues, accept payments, credit card, ach, venmo, turn off zelle, payment settings, receipt, payment receipt, email receipt, automatic receipt]
related: [dues-record-payment, resident-portal-basics, dues-generate-monthly]
reviewed: 2026-10-20
---

Do this once so residents can pay their dues from their phone. Until you do, residents see "Online payments aren’t set up yet" and are asked to contact the board.

## Before you start
- Board admins and board members can set this up. It's usually the treasurer's job.
- Use the Zelle email or mobile number of your **association's bank account**. Never use a board member's personal account.
- Your association must be set up in the app first. If it isn't, the page tells you so.

## Steps
1. In the sidebar, open [[Resident payments]]. It's also a tab in **Settings**.
2. In **Zelle email or mobile number**, enter what residents should type into "Send to" in their bank app. Use an email or a 10-digit US mobile number.
3. Optional: in **Name Zelle shows**, enter the account name residents will see before they confirm. It starts as your association's name.
4. Optional: in **Note to residents**, add other ways to pay or who to call.
5. Check **What residents see**. It's a live preview of the Pay screen for a sample $325.00 charge.
6. Select [[Turn on Pay by Zelle]].

## What happens next
- The status changes to **On — residents can pay**, and residents see a **Pay** button with the steps.
- Each dues charge has its own memo code. Residents send one Zelle payment per charge, with that amount and memo.
- When the deposit shows up in your bank feed, the app matches it to the charge by its memo code. A board member approves every match in the **Matching queue** (**Accounting**, then **Bank**) before it posts.
- To change the details later, edit them and select [[Save changes]]. To stop, select [[Turn off]] and confirm.

## If something goes wrong
- "Enter the email or US mobile number your association’s Zelle is registered to.": the Zelle field is empty. Fill it in.
- "Use an email address or a 10-digit US mobile number.": check the email or number for typos.
- "Payment settings can’t be saved on this server yet. Contact support.": the app isn't fully set up for this yet. Contact support.
- "Couldn’t save the payment settings. Try again.": nothing was saved. Try again.
- "Automatic receipts are paused": the saved receipt setting was changed outside this screen, so no receipt sends on its own. Turn it on again.
- "Residents can’t see your Zelle details right now": the saved details were changed outside this screen, so they're hidden from residents. Check them and save again.

## Good to know
- **Payment receipts**, below the Zelle settings, has one switch: [[Email owners a receipt when we record their payment]]. It's off until a board turns it on, and it applies to the whole association. When it's on, every time a board member records a payment (**Mark paid** on Dues, or confirming a bank deposit against a charge), the home's owners get one email receipt with the amount, date, how it was paid, the balance left and a link to their ledger. Owners who turned off emails don't get one. With it off, you can still send a receipt for any payment with **Send receipt** on Dues.
- Zelle is the only online payment option. Residents can't pay by credit card or ACH in the portal.
- There is no autopay. Each resident sends each payment from their own bank.
- No money goes through HomeownerHub. Residents send Zelle from their own bank straight to your association's account.
- Turning it off doesn't stop payments already sent. They still arrive and match.
- If a charge is already partly paid, the resident still sees a memo, but the board confirms that payment by hand.
- If a charge has no memo code, residents are told to put their street address in the memo, and the board matches it by hand.
- For checks or cash, see [Record a payment by check or cash](guide:dues-record-payment).
