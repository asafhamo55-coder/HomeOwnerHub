---
id: approvals-queue
title: "The Approvals queue: nothing happens until you approve"
summary: Review what the AI proposed, residents' contact updates and amenity bookings, then approve or reject each one.
topic: documents
roles: [admin, board]
routes: ["/approvals"]
primary_route: /approvals
keywords: [approve, approval, queue, pending, deposit, bill, invoice, scanned, vendor, letter, collections letter, reject, ai, decision, arc, architectural, contact, phone, email, mailing, address, owner, resident]
shots:
  - name: guide-approvals
    alt: The Approvals page with a deposit and the Approve & post button highlighted
  - name: guide-approvals-bill-edit
    alt: The Edit bill details dialog for a scanned bill
related: [violations-report-and-letter, arc-review-application, meetings-schedule-and-minutes]
reviewed: 2026-11-06
---

The AI prepares work for the board, but it never posts or sends anything on its own. Everything it proposes waits here for a board member.

## Steps
1. Open **Approvals** from the sidebar. The number beside it is how many items are waiting.
2. Pick a tab to see one kind: Deposits, Bills, Violation letters, Collections letters, ARC reviews, Contact updates, Amenity bookings or Vendors.
3. Read the item. For a scanned bill, compare it with the bill itself.
4. Approve it: [[Approve & post]] for a deposit, [[Approve & enter]] for a bill, [[Approve letter]] for a violation or collections letter, [[Approve & update]] for a contact update, [[Approve booking]] for an amenity booking, or [[Approve]] for a vendor.
5. To say no to any item except an ARC review, select [[Reject]] and give a **Reason**. The reason is kept in the audit trail. For a contact update, the resident sees it in their request. For an amenity booking, the resident reads it in their email.
6. An ARC review has no Reject button. Select [[Approve]], [[Deny]] or [[Request info]] instead.

![[guide-approvals]]

## What happens next
- An approved deposit posts to the ledger and marks the matching dues paid.
- An approved bill is entered in accounts payable. It does not pay the vendor.
- An approved violation letter is filed as an open violation. Nothing is sent to the homeowner.
- An approved collections letter becomes ready to print on the home's page. Nothing is sent: you print it and mail it. See [draft a collections letter](guide:dues-collections-letter).
- An approved vendor becomes active.
- An approved contact update changes that person's records on the home: their resident record, their ownership or lease, and the home's owner contact when it is theirs. The property page then shows **Updated by owner on** the date. A rejected one tells the resident your reason.
- An approved amenity booking is confirmed and the resident is emailed. A booking you turn down needs a short reason, and the resident reads it in their email. Each booking links to its day on the Amenities page. If someone else took the time first, the approval is refused and nothing changes.
- An ARC decision is the same as deciding on the application's own page. The resident sees your response in their portal.

## If something goes wrong
- The AI read a bill wrong: select [[Edit details]] on the bill, correct the vendor, amount or dates, and select [[Save changes]]. Then approve it.
- "Couldn’t approve it": nothing changed. Try again.

![[guide-approvals-bill-edit]]

## Good to know
- Money items are never approved in bulk. Each one needs its own decision. Violation letters, contact updates and amenity bookings can be ticked and approved together; each one is still checked on its own.
- A booking request also rings your bell. A booking that needs no approval is confirmed at once and never appears here.
- A bill whose vendor is not on file shows **Review** instead of approve. Add the vendor first.
- A contact update never changes the email someone signs in with. If they sign in with the email on file, the new email is held so they aren't locked out. Invite them to the portal first.
