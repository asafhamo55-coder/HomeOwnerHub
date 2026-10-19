---
id: dues-collections-letter
title: Draft and print a collections letter
summary: Build a past-due or lien notice for a delinquent home from its ledger and your state's rules, get board approval, then print it or save it as a PDF to mail.
topic: dues
roles: [admin, board]
routes: ["/properties/[id]/collections-letter", "/properties/[id]", "/approvals"]
primary_route: /properties/[id]
keywords: [collections letter, collection letter, past due letter, delinquency letter, delinquency notice, notice of late assessment, late assessment, 30 day letter, 30-day notice, intent to lien, notice of intent to record a claim of lien, 45 day letter, 45-day notice, lien letter, lien notice, pre-lien notice, claim of lien, demand letter, draft letter, print letter, certified mail, "720.3085", "5660", "209.0064", waiting period, too early, can't draft, approval]
related: [dues-collections-case, accounting-payment-plans, dues-record-payment, approvals-queue]
reviewed: 2026-10-19
---

When a home's dues are past due, the board can draft a collections letter from the home's collections case. HomeownerHub builds the letter from the ledger and your state's rules, not with AI. A board member approves it in Approvals, then you print it or save it as a PDF and mail it yourself.

## Before you start
- Board admins and board members can draft, approve and print letters. Residents can't open the page.
- The home needs an open collections case. Open one in the **Collections file** first.
- Record every payment first. The letter lists what the ledger shows as past due today.

## Steps
1. Open **Properties** and open the home. In the **Money** section, find **Collections file** and select [[Draft collections letter]].
2. Under **Which letter**, choose the letter. Florida offers the notice of late assessment and the notice of intent to record a claim of lien. California offers the pre-lien notice. Texas offers the delinquency notice. Every state also offers a plain past-due letter.
3. Read **How this letter is built**. It shows where the amounts come from, the dates the letter sets, and how it must be mailed.
4. Under **Fill in the blanks**, fill in each item the app doesn't hold, such as the owner's mailing address, interest, costs and who signs. Enter 0 for an amount you don't charge. Anything still missing shows on the letter as a highlighted **BLANK**.
5. Tick [[I’ve verified these figures]], then select [[Save to approvals]].
6. A board member opens **Approvals**, reads the letter and selects [[Approve letter]], or rejects it with a reason.
7. Come back to the home and select [[Draft collections letter]]. Tick [[I’ve verified these figures]] again, then select [[Print / Save as PDF]].

## What happens next
- Printing records the letter on the collections case, dated the day it prints, with the total. The case moves to the matching stage. For example, a notice of late assessment moves it to "30-day lien warning".
- Each print is logged with ids and amounts only. Nothing is emailed or texted to the owner.
- In Florida, the notice of late assessment (§ 720.3085(3)(d)) gives the owner 30 days and goes by first-class mail. The notice of intent to lien (§ 720.3085(4)) gives 45 days and goes by certified mail, return receipt requested, and first-class mail.
- In California, the pre-lien notice (§ 5660) goes by certified mail at least 30 days before a lien is recorded. It lists only assessments that are delinquent, which is 15 days after they were due.
- In Texas, the delinquency notice (§ 209.0064) goes by certified mail and gives the owner 45 days to cure.

## If something goes wrong
- "This letter can’t be drafted yet": a waiting period isn't over, or nothing is past due. The message says why and, when it's only a matter of time, the first day you can draft it.
- In Florida, the intent-to-lien letter needs a notice of late assessment recorded on the case at least 30 days earlier.
- [[Save to approvals]] is greyed out: a BLANK is empty, an amount isn't a number, or [[I’ve verified these figures]] isn't ticked. The message beside the button says which.
- "The account has changed since this letter was approved": a payment or charge was recorded after approval. Select [[Draft a new letter instead]] and send the new one for approval.
- "A letter for this home is already waiting in Approvals": approve or reject that one first.

## Good to know
- Florida and California notices leave fines off. The letter says so on screen.
- If you mail the letter on a later day than you print it, add a note on the collections case with the mailing date.
- The letters quote the statute's required wording. They aren't legal advice: check your governing documents and ask your association's attorney before a lien.
