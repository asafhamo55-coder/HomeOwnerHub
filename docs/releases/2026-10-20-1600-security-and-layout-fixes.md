---
title: Security fixes and layout fixes
shots:
  - route: /inbox
    caption: The inbox
  - route: /communications
    caption: Sent messages
---

## Summary

A security review of today's work found several places where the app trusted a request more than it should. All of them are fixed in this update. Two inbox and messages screens also had layout problems on desktop and phones, and those are fixed too.

## What's new

### Security
- **Board-only actions are now locked to the board of your own association.** Comparing vendor bids, running a vendor insurance check, drafting requests for proposal, asking state-law questions, and managing vendors and requests for proposal now always check that you're on the board, and that the record belongs to your association, before anything is read or saved.
- **Inviting a member** can only attach them to a home in your own association.
- **Email changes from the inbox are paused.** An email can be faked to look like it came from a resident, so contact-detail requests filed from the inbox can't change a resident's email for now. Residents change their email themselves in the portal. Phone and mailing address changes still work.
- **Governing documents need confirmation.** Filing an email attachment as CC&Rs, bylaws or rules now requires ticking "I confirm this is our official governing document". Until a board member confirms, the AI won't use it.
- **Text messages:** replying START no longer turns texts back on for a resident who turned them off in their portal.
- **Calendar links** in meeting notices can't be edited to show a different time or place.
- **AI drafts** treat every resident email strictly as information, never as instructions.
- **New safety check:** an automatic test now fails if any new board action reaches sensitive data without first checking who's asking.

### Layout fixes
- **Inbox conversation (desktop):** the subject now gets its own full-width line. Before this fix it could be squeezed into a narrow column, one letter per line.
- **Sent message results (phones):** the "Email again" button fits the screen.
- **Wording:** "1 email opened" instead of "1 emails opened".

## Good to know
- If a resident asks to change their email by replying to an email, ask them to change it in their portal instead.
