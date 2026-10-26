---
id: dues-collections-case
title: Track a delinquent account in the collections file
summary: Open a collections case on a property and log each letter, lien and attorney step, so the board has one dated record of the account.
topic: dues
roles: [admin, board]
routes: ["/properties/[id]"]
primary_route: /properties/[id]
keywords: [collections, foreclosure threshold, Georgia threshold, "$2,000", "$4,000", 12 months of dues, SB 406, "44-3-232", "43-17A-8", payment order, how payments are applied, collection, collections case, delinquent, delinquency, past due, behind on dues, lien, lien letter, lien warning, 30-day lien warning, attorney, lawyer, demand letter, suit, lawsuit, foreclosure, write off, collection letter, bad debt, owner won't pay, arrears, app, logged, delete entry, paid in full, paid everything, close out, close file]
related: [dues-collections-letter, accounting-payment-plans, dues-record-payment]
reviewed: 2026-10-26
---

Use this when an owner's account is seriously past due and the board starts sending letters or hands it to an attorney. The collections file is a dated record of what was done.

## Before you start
- Board admins and board members can open cases and record actions.
- A home can have only one open case at a time.

## Steps
1. Open **Properties** and select the home.
2. Go to its **Money** section and find **Collections file**.
3. Select [[Open a collections case]]. Choose the **Current stage**, for example "Lien letter sent" if that already happened. Add the **Opened on** date and the attorney's details if you have them.
4. Select [[Open case]].
5. Each time something happens, select [[Record an action]]. In **What happened**, choose what was done, and set **Date it happened**.
6. Add an amount, your initials or a note if they help. Leave **Also move this case to …** ticked to move the case to the matching stage.
7. Select [[Record]].

## What happens next
- The stage shows at the top of the case and in the **Collections** box on the property's page.
- Each action is added to **Activity**, newest dates first, with the date you entered.
- In Georgia, the open case shows a **Georgia foreclosure threshold** panel and a **How payments should be applied** note. Both are read-only.
- Before January 1, 2027, the panel shows today's rule: the lien can't be foreclosed unless it is at least $2,000. It says the rule changes on January 1, 2027, and shows the case against the new rule.
- From January 1, 2027, the threshold is the lesser of $4,000 or 12 months of regular assessments, but never under $2,000. Only regular and special assessments in arrears count, less unapplied payments. Late charges, fines, fees and payment-plan installments don't count.
- The 12 months of dues come from your dues rate schedule. Without a rate, the panel shows the threshold as $2,000 to $4,000.
- The payment note lists the order Georgia requires from January 1, 2027: regular assessments, then special, then specific assessments, then other fees and fines (§ 43-17A-8). It doesn't change how any payment is applied.
- To close the case, record "Case closed". The case moves to **Resolved** and appears under **Earlier cases**.

## If something goes wrong
- "This property already has an open collections case.": someone opened one already. Reload the page to see it.
- "That date is in the future.": the file records things that already happened. Use today or an earlier date.
- "No unit record": this home isn't linked to a unit yet, so it can't have a case. Link it first.

## Good to know
- HomeownerHub doesn't send collection notices or lien letters. You send them yourself or through your attorney, then record them here. To build a letter from the ledger, see [draft a collections letter](guide:dues-collections-letter); printing it records it here for you.
- Actions can't be edited or deleted once saved. To fix a mistake, add a note.
- You can't mark a case "Written off" or pick a stage by hand after the case is open. The stage moves only when you record an action that matches it.
- "Payment received" and "Payment plan agreed" are notes on the file only. They don't record money. Record the payment on the **Dues** page, and set up the plan in [payment plans](guide:accounting-payment-plans).
- The Georgia panel quotes SB 406 word for word. It doesn't decide whether to foreclose: ask your association's attorney first.
- Board admins and board members see the Georgia panel. Residents don't.
- Once a case is at "Board authorized suit", "With attorney — presuit" or "Suit filed", automatic dues reminders stop emailing that owner.
