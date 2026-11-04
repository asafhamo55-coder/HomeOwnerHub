---
title: Polls, amenity booking, a public community page and a neighbors message board
whats_new:
  - title: Ask your community a quick question
    body: Boards can now post a short poll for residents to answer in their portal. Pick the answers, set a close date and see the results. A poll is for opinions only. It is not a legal vote.
    roles: [admin, board]
    label: new
  - title: Book the clubhouse, pool or courts
    body: Add your shared spaces, set the hours and blackout dates, and approve or decline requests. The resident gets an email with your decision. Residents see which times are taken.
    roles: [admin, board]
    label: new
  - title: Put a public page on the web for your community
    body: In Settings, open Public page. Add a short welcome, a contact and the documents or notices you choose to share. Nothing shows until you press Publish, and then anyone on the internet can see it.
    roles: [admin, board]
    label: new
  - title: A message board for your neighbors
    body: Residents of one community can start topics and reply. The board can hide a post, close a topic and handle reports. Neighbors from other communities never see it.
    roles: [admin, board]
    label: new
  - title: Answer a poll from your phone
    body: When your board asks a question, open Community on your home screen, then Polls. Pick an answer and press Send.
    roles: [resident]
    label: new
  - title: Book a space
    body: Open Community on your home screen, then Book a space, to reserve the clubhouse, pool or courts. You can see which times are already taken, but not who has them. You get an email when the board decides.
    roles: [resident]
    label: new
  - title: Talk with neighbors
    body: Open Community on your home screen, then Talk with neighbors, to start a topic or reply to one. Only people in your community can see it. If something looks wrong, use Report this post.
    roles: [resident]
    label: new
---

## Summary

Four features that were built and tested are now switched on for everyone. Boards can run polls, take amenity bookings, publish a small public page, and host a private message board for their community. Residents reach all three of their features from one Community tile on the home screen.

## What's new

### Polls
- A board posts a question with a few answers and a close date. Nothing is emailed. Residents see it in their portal. Each home answers once and can see results live or after the poll closes, as the board chooses.
- Polls are for opinions. They do not count as a legal vote.

### Amenity booking
- Boards add spaces with opening hours and blackout dates, then approve or decline requests.
- When the board decides, the resident gets an email.
- Two bookings cannot overlap. Residents see that a time is taken, never who holds it.

### Public community page
- One page per association at its own web address. It shows only what the board adds: a title, a welcome text, a contact, documents and notices.
- The page starts private. The board presses Publish when it is ready and can take it down at any time. Once published, anyone on the internet can see it, including search engines. The contact email and phone are labeled "Shown publicly".
- The form warns when a notice contains an email address, phone number, dollar amount or street address.
- Only documents that residents can already see can be added, and only ones for this association. AI-written and replaced documents cannot be added. Residents' names, addresses and balances are never on the page.

### Community message board
- Topics and replies are visible only to people in the same association.
- Residents can report a post. The board sees open reports, and can hide the post, close the topic or dismiss the report.
- Neighbors appear as a first name and last initial.
- To stop spam, each person can only start a limited number of topics, replies and reports per hour and per day. They get a plain message with when to try again.
- A long topic shows its first 200 replies, with a "Show more replies" link for the rest.

### Where to find them
- Board menu: Polls, Amenities and Community board. They are left out of the "Show only the basics" menu.
- Settings: Public page.
- Resident home screen: one Community tile. It opens a simple page with big buttons for Polls, Book a space and Talk with neighbors.

### One association at a time
- Polls and the public page belong to the organization's first association, by name. If an organization manages more than one association, the Polls pages and the Public page say which association they are for. Choosing a different association for these two is not available yet. The community message board already lets the board pick an association.

## Under the hood

- The four database switches (polls, amenities, public page, message board) are on in code, matching what is applied in production as of 2026-11-05.
- New tests cover the public page lookups and document rules, board moderation, one-association scoping, the message board spam limits and the polls and amenity reads.

## Needs your action

- Try each feature once with a test association before telling boards. Online payments, voting and print-and-mail stay off.
