---
id: accounting-enter-pay-bills
title: Enter a vendor bill and mark it paid
summary: Enter a vendor's bill by hand or let the AI read a photo or PDF of it, uploaded or emailed to the HOA, then record the payment when you pay the vendor.
topic: accounting
roles: [admin, board]
routes: ["/accounting/invoices", "/accounting/invoices/new", "/accounting/invoices/[id]"]
primary_route: /accounting/invoices/new
keywords: [bill, bills, emailed bill, emailed invoice, invoice in inbox, scan as a bill, bill from email, vendor bill, invoice, invoices, enter bill, pay bill, pay vendor, pay a vendor, mark paid, bill paid, accounts payable, payables, ap, expense, scan bill, scan a bill, upload bill, bill photo, bill pdf, ai bill, read by ai, receipt, landscaper bill, contractor invoice, check number, past due bill, unpaid bills, delete invoice, picture, photo, paper bill, fill in, mailed a check, paid by check, partial payment, pay half, pay part]
related: [approvals-queue, inbox-reply-to-resident, accounting-reports-overview, accounting-bank-reconcile, vendors-insurance-compliance]
reviewed: 2026-10-20
---

Use this when a vendor sends the association a bill. Entering it records what you owe. Marking it paid records that you paid it.

## Before you start
- Board admins and board members can enter and pay bills.
- The vendor must be on file. If you have no vendors yet, the page says "Add a vendor first" and links to [[Add vendor]].
- The books must be open, with at least one active expense account.

## Steps
1. Open **Accounting**, then the **Invoices** tab, and select [[Enter bill]].
2. To let the AI read it, select [[Choose a bill]] under **Scan a bill** and pick a PDF or a photo of the bill. Then select [[Review in Approvals]] and approve it there (see below). If the vendor emailed the bill to the HOA mailbox, open the email in **Messages** and select [[Scan as a bill]] on the PDF or photo, then [[Scan bill]] instead. Its card in Approvals has [[Open the email it came from]].
3. To enter it by hand instead, fill in **Vendor**, **Invoice number**, **Amount**, **Invoice date** and **Expense account**. **Due date** and **Memo** are optional.
4. Select [[Enter bill]]. The bill's page opens.
5. When you pay the vendor, open the bill from **Invoices**. Under **Record payment**, choose how you paid in **Paid by** (check, ACH, card, cash or other).
6. Optional: type the check number or confirmation code in **Reference**.
7. Select [[Mark paid]]. The button shows the full amount of the bill.

## What happens next
- An entered bill shows **Approved · unpaid**. The expense posts to the ledger right away, and the bill counts in **Unpaid** on the Invoices page. A late bill shows how many days late it is.
- A scanned bill is not entered yet. It waits in **Approvals** under **Bills**. When a board member selects [[Approve & enter]], it is entered just like a bill you typed, and its page shows **Read by AI**. See [the Approvals queue](guide:approvals-queue), including how to fix anything the AI read wrong with [[Edit details]].
- Marking a bill paid posts the payment from operating cash and changes the bill to **Paid**.

## If something goes wrong
- "Sent to Approvals — incomplete": the AI couldn't find part of the bill, so it left it blank instead of guessing. Reject it in Approvals and enter the bill by hand.
- "Low confidence on the …": check those parts against the paper bill before you approve it.
- "This bill is already waiting for approval": the same file was scanned before. Open it in Approvals instead.
- "This PDF has no readable text (it is probably a scan). Upload a photo of the bill (JPG or PNG) instead."
- "Photos of a bill must be under 3 MB. Try a smaller photo or a PDF."
- "The AI couldn’t read this bill right now. Try again, or enter it by hand."
- A message that you or your community reached the limit of **board AI drafts**: bill scans share your community's daily board AI limit with the other board AI tools. Try again later, or enter the bill by hand.
- "The books aren’t open yet" when you mark a bill paid: an admin selects [[Open the books]], then tries again. A board member is pointed to the admins.
- "Not ready to pay": the bill was saved but not fully entered, so it can't be paid from here. Contact support.

## Good to know
- The AI scan takes PDF, JPG, PNG or WebP files. A PDF must have real text in it; a scanned PDF won't work, so use a photo.
- Nothing the AI reads is entered until a board member approves it. Paying is always a separate step.
- An emailed bill could come from anyone. The AI only reads what the bill says and fills nothing it can't find, but check the vendor and amount against what you expect before you approve it.
- The same file is only scanned once while its bill is waiting or entered, whether it was uploaded or came by email.
- [[Mark paid]] records the full amount, dated today. You can't record a partial payment or pick a different date.
- The app records that you paid. It doesn't send money to the vendor. Pay by check or through your bank as usual.
- You can't edit a bill after you enter it. To fix a mistake, select [[Delete]] on an unpaid bill and enter it again. Deleting hides the bill, but its ledger entry stays. Reverse that entry in the ledger if it was wrong.
- You can't delete a bill once it's paid.
- Vendors marked as blacklisted don't appear in the **Vendor** list.
