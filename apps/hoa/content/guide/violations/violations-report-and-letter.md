---
id: violations-report-and-letter
title: Report a violation and approve the letter
summary: Report a violation with photos, let Covenant Brain draft the letter from your CC&Rs, and approve it before it goes out.
topic: violations
roles: [admin, board]
routes: ["/violations", "/violations/new", "/violations/[id]", "/violations/approval-queue"]
primary_route: /violations
keywords: [violation, notice, letter, covenant, ccr, fine, cure, cure period, compliance, report, close, resolve, financial commitment, commitment to cure, california, suspension]
shots:
  - name: guide-violations-new
    alt: The Report a violation form with the state law panel and the Analyze with Covenant Brain button highlighted
  - name: guide-violations-approval-queue
    alt: The AI approval queue with a drafted letter and the Approve letter button highlighted
related: [approvals-queue, documents-governing-and-ask]
reviewed: 2026-10-19
---

A violation goes from report, to notice, to cure period, to closed. HomeownerHub drafts the notice for you, but the board approves every word.

## Before you start
- Board admins and board members can report violations.
- Covenant Brain can only cite a CC&R section if your CC&Rs are uploaded. See [Upload your governing documents](guide:documents-governing-and-ask).

## Steps
### Report a violation
1. Open **Violations** from the sidebar and select [[Report violation]].
2. Under **Property**, type an address or unit and pick the home from the list. Add at least one photo, and **Additional notes** if they help.
3. Select [[Analyze with Covenant Brain]]. It reads the photo, matches the CC&R section and drafts the letter.
4. Read the draft all the way to the bottom and fix anything that is wrong.
5. Select [[Approve & mark notice sent]].
6. Send the approved letter to the owner yourself, by mail or email.

![[guide-violations-new]]

### California: record a commitment to cure
Use this when the fix takes longer than the notice period and the owner commits to paying for it, for example by promising in writing to pay a contractor to do the work. California law then says the board may not fine or suspend them (Civ. Code § 5855(c)(2)). Do it before the hearing or any fine.
1. Open the violation and find the **Financial commitment to cure** card.
2. Enter the **Date the owner committed**, and a **Note** if it helps, like the contractor and the date the work is booked.
3. Select [[Record commitment]]. The card shows **Fines blocked**.

While the commitment is on file, HomeownerHub won't let you set **Status** to Fined, and says why. Letters drafted for that violation carry the commitment into the state-law check, so a fine or suspension letter is refused. If the owner doesn't keep the commitment, or it was recorded by mistake, select [[Withdraw commitment]] and confirm. Associations in other states don't see this card.

## What happens next
The violation is recorded with the notice marked as sent, and the cure period starts. Open the violation to see its history and the cure due date. When the owner fixes the problem, open it, set **Status** to Resolved and select [[Update status]].

## If something goes wrong
- "No parsed CC&Rs": your CC&Rs are not uploaded yet, so no section can be cited. Upload them first, or review the letter carefully.
- "Analysis failed": try again, or write the letter yourself.
- "California law (Civ. Code § 5855(c)(2)) forbids a fine…", or you can't set **Status** to Fined: a financial commitment to cure is recorded on this violation. Withdraw it first only if the owner did not keep it.
- "The date can’t be in the future.": enter the day the owner actually gave the commitment.
- "We could not load whether a commitment is recorded. Reload the page before fining.": reload the page, and don't fine until the card loads.

## Good to know
- Already on the property's page? [[New violation]] at the top starts the report with that home picked.
- **Nothing is sent from HomeownerHub.** Approving records that the notice went out and starts the cure clock. You send the letter.
- The **State law for this letter** panel shows your state's rules for notices and fines, such as how many days' notice an owner gets and the largest fine allowed. Florida and California are covered.
- Some letters are drafted for you by the AI and wait in the [[AI approval queue]] tab. Read each one and select [[Approve letter]], or [[Reject]] with a reason. Approving files it as an open violation.

![[guide-violations-approval-queue]]
