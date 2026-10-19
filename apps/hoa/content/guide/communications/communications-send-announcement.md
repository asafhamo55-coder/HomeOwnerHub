---
id: communications-send-announcement
title: Send an announcement to residents
summary: Write one message, pick who gets it, and send it by email, text and the resident portal.
topic: communications
roles: [admin, board]
routes: ["/communications", "/communications/new", "/communications/[id]"]
primary_route: /communications
keywords: [announcement, message, email, text, sms, newsletter, notice, broadcast, residents, send, schedule, delivery, spanish, español, translate, translation, bilingual, second language]
shots:
  - name: guide-communications-list
    alt: The Communications page with the New message button highlighted
  - name: guide-communications-new
    alt: The New message composer with the Audience choices highlighted
related: [arc-review-application, meetings-schedule-and-minutes]
reviewed: 2026-10-19
---

Use Communications for anything the whole community, or a group of homes, should hear about.

## Steps
1. Open **Communications** from the sidebar and select [[New message]].
2. Pick a **Topic** and an **Audience**, such as Everyone, Owners only or Late on dues. Each choice shows how many people it reaches. Select [[Continue]].
3. Pick a **Template** or write your own **Subject** and **Body**.
4. To send it in Spanish too, select [[Add Spanish version]]. AI drafts a Spanish subject and body. Read them, fix anything, then tick **I've read the Spanish version**. Select [[Continue]].
5. Under **Channels**, choose Email, SMS or Portal.
6. Leave **Send at** blank and select [[Send now]], or pick a time and select [[Schedule]].

![[guide-communications-new]]

## What happens next
You land on the message's own page. It shows how many people it was delivered to, who opened it, and any failures. The **Recipients** list shows each person's delivery status. Every message you send stays on the Communications page.

![[guide-communications-list]]

## If something goes wrong
- "Nobody matches right now": no one in that audience has contact details on file. Pick another audience.
- Some recipients failed: open the message to see who. If emails failed, the page offers to resend to them.
- "Read the Spanish version and tick the box before sending.": you added a Spanish version but haven't confirmed it yet. If you change the English afterwards, the tick clears and you confirm again.
- "The Spanish version uses merge fields the English one doesn't": a `{{ field }}` in the Spanish text isn't in the English. Copy it exactly from the English, or remove it.
- The translation didn't come back: select [[Translate again]], or write the Spanish yourself.

## Good to know
- A text holds up to 279 characters. Longer messages are shortened and end with a link to read the rest in the portal. Board members are never texted.
- With a Spanish version, everyone gets both languages: the English first, then a section headed **Español**. Residents can't pick one language yet.
- A text carries both languages only if both fit in 279 characters. If they don't, the text goes out in English only, and the **Review** step tells you. The email and the portal still carry both.
- The Spanish is an AI draft. Check names, dates and amounts against the English before you send.
- Replies to an email show in **Replies** on that message's page. They do not go to the Inbox.
- **Send at** uses the time on your own computer.
