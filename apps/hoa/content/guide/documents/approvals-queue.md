---
id: approvals-queue
title: "The Approvals queue: nothing happens until you approve"
summary: Review what the AI proposed, and residents' contact updates, then approve or reject each one.
topic: documents
roles: [admin, board]
routes: ["/approvals"]
primary_route: /approvals
keywords: [approve, approval, queue, pending, deposit, bill, invoice, scanned, vendor, letter, reject, ai, decision, arc, architectural, contact, phone, email, mailing, address, owner, resident]
shots:
  - name: guide-approvals
    alt: The Approvals page with a deposit and the Approve & post button highlighted
  - name: guide-approvals-bill-edit
    alt: The Edit bill details dialog for a scanned bill
related: [violations-report-and-letter, arc-review-application, meetings-schedule-and-minutes]
reviewed: 2026-10-18
---

The AI prepares work for the board, but it never posts or sends anything on its own. Everything it proposes waits here for a board member.

## Steps
1. Open **Approvals** from the sidebar. The number beside it is how many items are waiting.
2. Pick a tab to see one kind: Deposits, Bills, Violation letters, ARC reviews, Contact updates or Vendors.
3. Read the item. For a scanned bill, compare it with the bill itself.
4. Approve it: [[Approve & post]] for a deposit, [[Approve & enter]] for a bill, [[Approve letter]] for a violation letter, [[Approve & update]] for a contact update, or [[Approve]] for a vendor.
5. Or select [[Reject]] and give a **Reason**. The reason is kept in the audit trail.
6. For an ARC review, select [[Approve]], [[Deny]] or [[Request info]].

![[guide-approvals]]

## What happens next
- An approved deposit posts to the ledger and marks the matching dues paid.
- An approved bill is entered in accounts payable. It does not pay the vendor.
- An approved violation letter is filed as an open violation. Nothing is sent to the homeowner.
- An approved vendor becomes active.
- An approved contact update changes that person's records on the home: their resident record, their ownership or lease, and the home's owner contact when it is theirs. The property page then shows **Updated by owner on** the date. A rejected one tells the resident your reason.
- An ARC decision is the same as deciding on the application's own page. The resident sees your response in their portal.

## If something goes wrong
- The AI read a bill wrong: select [[Edit details]] on the bill, correct the vendor, amount or dates, and select [[Save changes]]. Then approve it.
- "Couldn’t approve it": nothing changed. Try again.

![[guide-approvals-bill-edit]]

## Good to know
- There is no "approve all". Each item needs its own decision.
- A bill whose vendor is not on file shows **Review** instead of approve. Add the vendor first.
- A contact update never changes the email someone signs in with. If they sign in with the email on file, the new email is held so they aren't locked out. Invite them to the portal first.
