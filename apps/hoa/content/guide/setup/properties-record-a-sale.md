---
id: properties-record-a-sale
title: Record a sale when a home changes hands
summary: When an owner sells, record the sale so the buyer becomes the owner, the seller's portal access ends and the history is kept.
topic: people
roles: [admin, board]
routes: ["/properties/[id]"]
primary_route: /properties/[id]
keywords: [sale, sold, sell, seller, buyer, new owner, previous owner, former owner, closing, settlement, transfer, ownership, change owner, moved, deed, co-owner, invite]
related: [setup-properties-residents, members-invite-board, dues-record-payment]
reviewed: 2026-10-18
---

When a home is sold, record the sale on its page instead of editing the owner's name. The buyer becomes the owner from the settlement date, the seller becomes a previous owner, and nothing is overwritten.

## Before you start
- Board admins and board members can record a sale.
- You need the settlement date (the day the deed transferred) and each buyer's name. Email, phone and a mailing address are optional.
- Record the sale on or after the settlement date. A date in the future isn't accepted, because the seller's access ends as soon as you confirm.
- The home needs its unit record. If the page says it isn't linked to one, open [[Edit]], save once, then come back.

## Steps
1. Open **Properties**, then the home that was sold.
2. Select [[Record a sale]] at the top of the page.
3. Enter the **Settlement date** and the buyer's **Full name**, plus their email and phone if you have them.
4. Bought by more than one person? Select [[Add a co-buyer]] and give each buyer their **Share**. The shares must add up to 100%. The first buyer is the primary owner: notices and dues go to them.
5. If tenants live there, choose whether they stay. Leave **Add the buyers to the household list** ticked so notices reach the new owners.
6. Read **When you confirm**, then select [[Record sale]].
7. To give a buyer portal access, select [[Invite to portal]] next to them, then [[Send invite]]. Select [[Done]] when you're finished.

## What happens next
- The seller and their household become previous owners. Their portal access to this home ends straight away. Under **People**, **Ownership history** lists every previous owner with their dates.
- The home's owner details now show the primary buyer, so notices and dues reminders go to them.
- The balance stays with the home. It isn't cleared or moved. In the portal, the buyer sees only charges and payments from the settlement date on. The board still sees the full ledger under **Money**.
- If the tenants left, their leases end on the settlement date and tenure goes back to **Unknown**. Set it under **Leases**, in the **Tenure** card.
- **Activity** shows "Sale recorded" with the settlement date.
- Recording the sale sends no email. A buyer only gets an invitation when you select [[Invite to portal]].

## If something goes wrong
- "The settlement date can’t be in the future.": wait until the sale has settled, then record it.
- "The buyers’ shares add up to …%.": change the shares so they add up to exactly 100.
- "A buyer has the same email as the current owner.": a sale moves the home to someone new. To fix the current owner's contact details, select [[Edit]] instead.
- "A mailing address is kept on the buyer’s household entry.": tick **Add the buyers to the household list**, or leave the mailing address blank.
- "Couldn’t record the sale. Nothing was changed.": nothing was saved, so it's safe to try again.

## Good to know
- Don't use [[Edit]] for a sale. Editing changes the current owner's details, keeps no history, and leaves the seller's portal access in place.
- The seller's charges and payments stay in the home's ledger, so you can still collect what they owed.
- An owner on file without a portal account shows [[Invite to portal]] under **People** too. The invite links them to their existing ownership, so their start date doesn't change.
