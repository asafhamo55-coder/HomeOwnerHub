---
id: arc-review-application
title: Review an ARC application
summary: Read a resident's architectural request and the AI review of it, then approve it, deny it or ask for more information.
topic: arc
roles: [admin, board]
routes: ["/arc", "/arc/[id]"]
primary_route: /arc
keywords: [arc, architectural, application, request, approve, deny, paint, fence, roof, modification, committee, ai, review, suggestion, conditions, rules, request info, more information, missing details, photos, photo findings, decision letter, letter, approve with conditions, blank, deadline, days left, overdue, due, decision clock, deemed approved, business days]
shots:
  - name: guide-arc-list
    alt: The ARC review list with an application waiting for a decision highlighted
  - name: guide-arc-detail
    alt: An ARC application with the Decision card and the Approve button highlighted
related: [approvals-queue, communications-send-announcement]
reviewed: 2026-10-20
---

Residents send architectural requests for exterior changes, like paint, a fence or a roof, from their portal. They show up in ARC review for the board to decide.

## Steps
1. Open [[ARC review]] from the sidebar. It opens on applications that need a decision, oldest first. **Decide by** shows the days left before your decision deadline.
2. Open an application.
3. Read **Proposed work** and open any files under **Documents**.
4. Read the **AI review** card. It cites the rules from your governing documents that apply, suggests a decision with its reasons, and lists any conditions and missing details. If photos are attached, **What the photos suggest** lists what the AI saw in each photo.
5. Decide from the AI review: select [[Approve]], [[Approve with conditions]], [[Deny]] or [[Request info]]. The box opens on a full decision letter drafted from the cited rules and conditions. Read it, edit it, then confirm.
6. Or use the **Decision** card as before: type a **Board response** and select [[Approve]], [[Deny]] or [[Mark in review]].

![[guide-arc-list]]

![[guide-arc-detail]]

## What happens next
- The resident sees the decision and your letter in their portal, word for word. They also get an email with the letter if your association turned on **Tell residents about decisions and replies** in [[Settings]] → [[Notifications]]. It is off until a board turns it on, so until then tell them yourself if it is urgent.
- [[Request info]] sends your message to the resident in **Conversation** and marks the application in review. With the same setting on, the resident is emailed your message too.
- The AI never decides. Its suggestion is kept with the board's actual decision, so you can see how often the board agreed.

## Good to know
- **Decision deadline.** Many declarations give the board a set number of days to decide, and some say an application is approved if the board doesn't decide in time. Check your declaration for both. Set your deadline under **Decision deadline** at the top of ARC review: enter the days, choose **Every day** or **Business days**, and select [[Save deadline]]. Until you save one, it is 30 days, counting every day.
- The clock starts the day after the resident submits. Business days skip weekends but not holidays.
- The **Decide by** chip turns amber with 7 days or fewer left and red once the deadline has passed. The same chip is on the application. An overdue application also shows a banner about the deemed-approval risk. For a Florida association it adds that a denial must be written and name the rule relied on (Florida § 720.3035(4)(a)).
- The board's morning email lists applications that are overdue or due within 3 days, with a link to ARC review. Residents never see the deadline.
- No applications yet? The page offers [[Tell residents how to apply]], which starts a message to residents.
- Tick [[Internal note]] in Conversation to leave a note only the board sees.
- The AI review starts by itself when a resident submits. If it is missing or failed, select [[Run AI review]].
- No rules found? The card says so and makes no suggestion. Decide on your own reading of the documents.
- Photo findings are estimates, marked low or medium confidence. Open the photo before you rely on one. They help the AI's suggestion but never go into the letter. The AI reads up to 3 photos per review. It skips PDFs and photos over 3 MB.
- A letter can't be sent while a **BLANK** placeholder is left in it. You get one when the review gave no reason or condition to fill in. Write your own, or delete the line.
- Did the resident add photos after the review ran? The card offers [[Run again with the current photos]]. This replaces the waiting review.
- If the resident looked up the rules before submitting, open **What the resident saw before submitting** to see what they were shown.
- New AI reviews also wait in **Approvals**, under **ARC reviews**.
