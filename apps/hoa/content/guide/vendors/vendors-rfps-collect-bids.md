---
id: vendors-rfps-collect-bids
title: Get bids from vendors with an RFP and pick the winner
summary: Describe the job, let the composer draft an RFP, invite vendors to bid, compare their bids and award one.
topic: vendors
roles: [admin, board]
routes: ["/rfps", "/rfps/new", "/rfps/[id]", "/rfps/[id]/bids", "/rfps/[id]/bids/[bidId]", "/rfps/[id]/comparison"]
primary_route: /rfps
keywords: [rfp, request for proposal, bid, bids, quote, quotes, estimate, proposal, get quotes, compare bids, bid comparison, compare quotes, award, award bid, choose vendor, pick contractor, hire contractor, tender, scope of work, line items, deadline, landscaping contract, roofing, paving, three quotes, ask vendors, ask for bids, repave, parking lot]
related: [vendors-insurance-compliance, settings-vendors, accounting-enter-pay-bills]
reviewed: 2026-10-26
---

Use this when the association needs a job done and wants several vendors to quote on the same scope, so the board can compare them side by side.

## Before you start
- Only board admins and board members can create RFPs and award bids.
- Add the vendors you want to invite first, with an email on file. See [Add a vendor](guide:vendors-insurance-compliance).

## Steps
1. Open **Vendors**, select the **RFPs** tab, then select [[New RFP]].
2. Under **What does the association need?**, describe the job in your own words. Add a budget range if you have one, check **Bids due**, then select [[Draft RFP]].
3. Read the draft. Change the **Title**, **Scope**, budget or **Bids due** if you need to, and select [[Save draft]]. When it's right, select [[Publish]], then confirm.
4. Under **Invite vendors**, tick the vendors you want, then select the send button (it reads, for example, **Send 3 invites**). Each vendor gets their own email link to submit a bid.
5. When bids arrive, select [[View bids]]. Select a vendor's name to see their pricing, timeline and line items. Once at least two are in, select [[Compare bids]]. The comparison shows each line side by side, items a vendor left out or added, payment terms, warranty and a recommendation memo.
6. Open the bid the board chose. Under **Conflict-of-interest disclosure**, each board member picks **No conflict** or **Conflict: recused**, adds a short note (needed for a conflict) and selects [[Record disclosure]]. An admin can record for any board member.
7. Select [[Award this bid]], then confirm.

## What happens next
The RFP shows **Awarded**. The winning bid is marked **Awarded** and every other submitted bid is marked **Declined**. Vendor bid links stop working once the RFP is awarded or cancelled, or the bid deadline passes.

## If something goes wrong
- "Every board member has to record a conflict-of-interest disclosure before this can go ahead.": for a Georgia association, from January 1, 2027, the award waits until every board member has recorded a disclosure. Open the bid and record the missing ones.
- "Couldn’t draft the RFP": nothing was saved. Try again. If you left **Bids due** empty you'll see "Submission deadline is required."
- "Add at least one line item before publishing.": the draft has no line items, so it can't be published. Rewrite the need with more detail and draft a new RFP.
- "Couldn’t send invitations": nothing was sent. Try again. If one vendor shows "no email on file", add an email on their page and invite them again.
- "invitation created, but the email didn’t send": the vendor is invited, but the email failed to go out.
- **Compare bids** doesn't appear: you need at least two submitted bids. The bids page says "comparison needs at least 2 submitted bids".

## Good to know
- The insurance minimums in the RFP and in each invitation email come from **Settings → Vendors**. The composer doesn't make them up. If you haven't set any, the RFP lists none.
- Line items come from the draft. You can edit the title, scope, budget and deadline, but not the line items.
- Nothing goes to vendors until you publish. After publishing, the scope and line items shouldn't change.
- Conflict-of-interest disclosures: Georgia's SB 406 lets owners expect directors to disclose conflicting interests (O.C.G.A. § 43-17A-7(10), in force January 1, 2027). Before then the panel is a recommended step; from then it is required for Georgia associations. In other states it is an optional best practice. The same panel appears on a vendor's page before you approve the vendor. The notes show on the bid, not in the audit trail.
- The recommendation memo is an AI draft for discussion. The board makes the decision.
- Awarding can't be undone. The app doesn't email the vendors to tell them who won, so let them know yourself.
- To call it off, select [[Cancel RFP]]. Open invitations stop working and vendors can't submit bids.
- Blocked vendors don't appear in the invite list. Others show their compliance and status so you can see who's approved.
