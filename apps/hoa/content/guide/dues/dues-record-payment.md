---
id: dues-record-payment
title: Record a payment by check or cash
summary: Mark a dues charge paid when the owner paid outside the portal, so their balance is right.
topic: dues
roles: [admin, board]
routes: ["/dues", "/properties/[id]"]
primary_route: /dues
keywords: [record payment, split payment, one payment several charges, lump sum, payment order, order of payment, how payments are applied, "43-17A-8", SB 406, Georgia, ask your attorney, check, cheque, cash, paid, payment, mark paid, record, ledger, zelle, online payment, receipt, payment receipt, send receipt, email receipt, proof of payment, did you get my check]
shots:
  - name: guide-dues-record-payment
    alt: The Record payment confirmation over the Dues page, with the Record payment button highlighted
related: [dues-generate-monthly, settings-resident-payments]
reviewed: 2026-10-27
---

Use this when an owner paid by check (or cheque), cash or any other way outside the portal.

## Before you start
- Only board admins and board members can record payments.

## Steps
1. Open **Dues** from the sidebar.
2. Find the charge in its month and select [[Mark paid]] on that row.
3. Check the amount and the home in the confirmation, then select [[Record payment]].

![[guide-dues-record-payment]]

### Georgia: one payment across several charges
In a Georgia association, an owner's payment has to be applied in a set order from January 1, 2027 (§ 43-17A-8). Use [[Record payment…]] on any of the home's open charges when one check or transfer covers more than one charge.

1. Select [[Record payment…]] on a row for the home.
2. Enter **Amount received** and select [[Show the split]]. Nothing is saved yet.
3. Read the split. From January 1, 2027 it follows the statute: "(1) Regular assessments or dues until current; (2) Special assessments until current; (3) Specific assessments until current; and (4) Other fees and fines." Within each step the oldest charge is paid first. Before 2027 it is oldest charge first, whatever the type.
4. If the split is right, select [[Record]] with the amount shown. Each charge gets its own payment and ledger entry.

Good to know about the split:
- Only charges due on or before today are paid ("until current"). A charge not yet due is left alone.
- Late fees and fines count as specific assessments. Interest, lien and collection costs, attorney fees and payment-plan installments aren't named in the statute, so they go last and show **Ask your attorney**. Ask yours how they should rank before relying on that order.
- If the amount is more than is currently due, it can't be saved here. Lower it to the amount due, then record the rest on a charge you choose with [[Mark paid]].
- If the home's charges change while you're looking, you'll be asked to preview again. If a part fails, the parts before it stay recorded and you're told so.
- This doesn't change payments already recorded and doesn't re-apply old ones. [[Mark paid]] still pays only the charge you pick.

## What happens next
The charge shows **Paid**, the home's balance goes down, and the payment posts to the ledger.

If your board turned on **Email owners a receipt when we record their payment** (in [[Resident payments]]), the home's owners get one email receipt. It's off until a board turns it on.

To send a receipt yourself (an owner asks "did you get my check?", or automatic receipts are off), select [[Send receipt]] on the charge's row in **Dues**, check the amount, date and home, then confirm with [[Send receipt]]. It receipts the most recent payment on that charge, whether or not automatic receipts are on.

## If something goes wrong
- "Couldn’t record the payment": nothing was saved. Try again; if it keeps failing, contact support.
- "No owner of this property has an email address on file.": add the owner's email on the property's page, then send again.
- "The owners of this property turned off emails, so no receipt was sent.": the owner chose not to get emails in their preferences. Give them a paper receipt instead.
- "A receipt for this payment was already sent from this button.": each payment gets one receipt from the button, so a double click doesn't email twice.
- "Receipt held": the safety guard held the email back. Nothing went out and nothing is broken.
- [[The books aren’t open yet]]: your association has no fiscal period or chart of accounts, so the payment can't be posted. An admin selects [[Open the books]], then records the payment again. A board member is pointed to the admins.

## Good to know
- A receipt shows your association's name, the amount, the date, how it was paid, the balance left on the home, and a link to the owner's ledger in the resident portal. It never shows other residents' details. Each owner on the home with an email on file gets their own copy, unless they turned off emails.
- **Mark paid** always records the full amount still owed on that charge, dated today. You can't enter a partial amount, a different date or the payment method on this screen.
- On a property's page, [[Record payment]] opens the Dues page showing only that home's charges, so you can mark the right one paid.
- Residents can pay dues online with Zelle. Set it up in [[Resident payments]] in the Account section of the sidebar: enter the Zelle email or phone your association's bank account receives payments on, then select [[Turn on Pay by Zelle]]. Zelle is the only online option.
