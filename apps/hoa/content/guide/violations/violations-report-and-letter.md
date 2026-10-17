---
id: violations-report-and-letter
title: Report a violation and approve the letter
summary: Report a violation with photos, let Covenant Brain draft the letter from your CC&Rs, and approve it before it goes out.
topic: violations
roles: [admin, board]
routes: ["/violations", "/violations/new", "/violations/[id]", "/violations/approval-queue"]
primary_route: /violations
keywords: [violation, notice, letter, covenant, ccr, fine, cure, cure period, compliance, report, close, resolve]
shots:
  - name: guide-violations-new
    alt: The Report a violation form with the state law panel and the Analyze with Covenant Brain button highlighted
  - name: guide-violations-approval-queue
    alt: The AI approval queue with a drafted letter and the Approve letter button highlighted
related: [approvals-queue, documents-governing-and-ask]
reviewed: 2026-10-17
---

A violation goes from report, to notice, to cure period, to closed. HomeownerHub drafts the notice for you, but the board approves every word.

## Before you start
- Board admins and board members can report violations.
- Covenant Brain can only cite a CC&R section if your CC&Rs are uploaded. See [Upload your governing documents](guide:documents-governing-and-ask).

## Steps
1. Open **Violations** from the sidebar and select [[Report violation]].
2. Under **Property**, type an address or unit and pick the home from the list. Add at least one photo, and **Additional notes** if they help.
3. Select [[Analyze with Covenant Brain]]. It reads the photo, matches the CC&R section and drafts the letter.
4. Read the draft all the way to the bottom and fix anything that is wrong.
5. Select [[Approve & mark notice sent]].
6. Send the approved letter to the owner yourself, by mail or email.

![[guide-violations-new]]

## What happens next
The violation is recorded with the notice marked as sent, and the cure period starts. Open the violation to see its history and the cure due date. When the owner fixes the problem, open it, set **Status** to Resolved and select [[Update status]].

## If something goes wrong
- "No parsed CC&Rs": your CC&Rs are not uploaded yet, so no section can be cited. Upload them first, or review the letter carefully.
- "Analysis failed": try again, or write the letter yourself.

## Good to know
- Already on the property's page? Its **Violations** tab has [[New violation here]], which starts the report with that home picked.
- **Nothing is sent from HomeownerHub.** Approving records that the notice went out and starts the cure clock. You send the letter.
- The **State law for this letter** panel shows your state's rules for notices and fines, such as how many days' notice an owner gets and the largest fine allowed. Florida and California are covered.
- Some letters are drafted for you by the AI and wait in the [[AI approval queue]] tab. Read each one and select [[Approve letter]], or [[Reject]] with a reason. Approving files it as an open violation.

![[guide-violations-approval-queue]]
