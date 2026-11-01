---
title: Plainer words, a shorter menu for new board members, and no accidental shortcuts
whats_new:
  - title: The violation form now uses plain words
    body: "\"Cure period\" is now \"Days to fix it\", and the button that drafts the letter now says \"Write the notice for me\". Short hints explain the fine and why photos matter."
    roles: [admin, board]
    article: violations-report-and-letter
    label: improvement
  - title: A shorter menu while you are getting started
    body: New board members see only the everyday pages for their first 30 days. Use "Show all menu items" at any time to see everything, and "Show only the basics" to go back. Your choice is remembered on that device.
    roles: [admin, board]
    label: new
  - title: Two menu items have clearer names
    body: Approvals is now "Things to approve" and ARC review is now "Architecture requests". They open the same pages as before.
    roles: [admin, board]
    label: improvement
  - title: A stray key no longer changes the page
    body: We removed the keyboard shortcuts that used the letter "g" to jump to another page, because a stray keypress could move you away from your work. The "?" key still opens the shortcuts help.
    roles: [admin, board]
    label: fix
shots:
  - route: /violations/new
    caption: The violation form, in plainer words
  - route: /approvals
    caption: Approvals, now called "Things to approve"
  - route: /arc
    caption: ARC review, now called "Architecture requests"
---

## Summary

This release makes the app easier for board members who are not comfortable with software. The violation form uses everyday words, new board members start with a shorter menu, and a stray keypress can no longer move someone to another page. The website help chat is also included, but it stays switched off until you turn it on.

## What's new

### Violations
- "Cure period (days)" is now "Days to fix it", and "Daily fine if uncured" is now "Fine per day if not fixed (optional)". Both have a short hint under them.
- "Analyze with Covenant Brain" is now "Write the notice for me".
- The photo step explains that photos are your proof if the owner disputes the violation, and says "Tap to add photos".

### Menu
- Board members see only the everyday pages for their first 30 days: Dashboard, Things to approve, Messages, Violations, Architecture requests, Meetings, Tickets, Dues, Documents and Help. Admins still see everything by default.
- Anyone can switch with "Show all menu items" or "Show only the basics". The choice is remembered on that device.
- "Approvals" is now "Things to approve", and "ARC review" is now "Architecture requests". Searching for the old names still finds them.

### Website help chat (switched off)
- The website has a help chat that answers from our own pages, guides and help articles, and can hand a question to a person. Visitors will not see it until you complete the steps below.

## Fixes

- Keyboard shortcuts that used the letter "g" to jump to another page are gone, because a stray keypress could move someone away from their work. The "?" key still opens the shortcuts help.
- The help article and the website demo now use the new button names.

## Under the hood

- Emails sent by the website chat's "Talk to a person" form are now covered by our outbound email safety check.

## Needs your action

- To turn on the help chat, follow OA-43 in your owner actions list. It needs a few settings on the website's Vercel project, then a redeploy.
