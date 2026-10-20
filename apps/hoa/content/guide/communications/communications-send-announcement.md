---
id: communications-send-announcement
title: Send an announcement to residents
summary: Write one message, pick who gets it, and send it by email, text and the resident portal.
topic: communications
roles: [admin, board]
routes: ["/communications", "/communications/new", "/communications/[id]"]
primary_route: /communications
keywords: [announcement, draft it for me, ai draft, compose, what do you want to tell residents, plain editor, bold, bullet, edit as html, message, email, text, sms, newsletter, notice, broadcast, residents, send, schedule, send later, cancel, scheduled, delivery, template, templates, dues reminder, meeting notice, water shutoff, pool closing, holiday, welcome, severe weather, opted out, opt out, spanish, español, translate, translation, bilingual, second language]
shots:
  - name: guide-communications-list
    alt: The Communications page with the New message button highlighted
  - name: guide-communications-new
    alt: The New message composer with the Audience choices highlighted
related: [arc-review-application, meetings-schedule-and-minutes]
reviewed: 2026-10-19
---

Use Communications for anything the whole community, or a group of homes, should hear about, like a pool closing or a board meeting. If some of your owners speak Spanish, the app can translate the announcement for them, and you check it before it goes out.

## Steps
1. Open **Communications** from the sidebar and select [[New message]].
2. Fastest way: in **What do you want to tell residents?**, say it in your own words, like "Water will be off Thursday 9 to 2 on Elm St", and select [[Draft it for me]]. AI fills in the audience, subject, message and channels, and takes you to the message to check. It leaves out anything you didn't say and lists it for you to add. Nothing is sent until you select Send. Or carry on below and write it yourself.
3. Under **Start from a template**, pick one, such as **Dues reminder**, **Meeting notice**, **Water shutoff**, **Pool closing**, **Holiday office closure**, **Welcome new owner** or **Severe weather**. Or pick **Write my own**. Your HOA's own templates are under **More templates**.
4. Pick an **Audience**, such as Everyone, Owners only or Late on dues. Each choice shows how many people it reaches. Select [[Continue]].
5. If you picked a template, fill in the few details it asks for. Check the **Subject** and **Body**, or write your own. Write the body as plain text: leave a blank line between paragraphs, use [[Bold]] and [[Bullet]], and add [[Resident's name]] or [[HOA name]] to fill them in for each person.
6. To send it in Spanish too, select [[Add Spanish version]]. AI drafts a Spanish subject and body. Read them, fix anything, then tick **I've read the Spanish version**. Select [[Continue]].
7. Under **Channels**, choose Email, Text or Portal. Then leave **Send at** blank and select [[Send now]], or pick a date and time and select [[Schedule]].

![[guide-communications-new]]

## What happens next
You land on the message's own page. It shows how many people it was delivered to, who opened it, and any failures. The **Recipients** list shows each person's delivery status. Every message you send stays on the Communications page.

![[guide-communications-list]]

## If something goes wrong
- "Answer every question before scheduling. Still blank: …": a scheduled message is saved with your answers filled in, so every detail it asks for needs an answer. Fill in the ones named, or send it now.
- "This message has different details for each home, so it can't be scheduled.": send it now instead.
- "Couldn't check residents' message preferences. Nothing was sent.": try again in a moment.
- "Nobody matches right now": no one in that audience has contact details on file. Pick another audience.
- Some recipients failed: open the message to see who. If emails failed, the page offers to resend to them.
- "Read the Spanish version and tick the box before sending.": you added a Spanish version but haven't confirmed it yet. If you change the English afterwards, the tick clears and you confirm again.
- "The Spanish version uses merge fields the English one doesn't": a `{{ field }}` in the Spanish text isn't in the English. Copy it exactly from the English, or remove it.
- "The AI couldn't draft this right now" or "The AI returned a draft we could not use": write the message yourself below, or try [[Draft it for me]] again in a moment.
- "You’ve reached the limit of 20 message drafts an hour": write the message yourself, or draft again after the wait it names.
- "Translation failed. Try again.": the translation didn't come back. Try the button again, or write the Spanish yourself.
- "Write the subject and body first.": the Spanish is translated from the English, so write the English subject and body first.
- "The English changed after this was translated.": select [[Translate again]], or update the Spanish yourself, then tick the box again.

## Good to know
- An AI draft flags any time, date or amount that is not in what you typed under **Check these**. Fix or remove it before sending.
- AI can't send to one street yet. If you name a street, check the audience and say in the message who it is for.
- A designed template (with a layout the simple editor can't keep) opens as HTML. You can still change the words. [[Edit as HTML]] is there for anyone who prefers it.
- When you pick Text, the **Review** step shows the text message as it will go out and how many of the 279 characters it uses.
- A text holds up to 279 characters. Longer messages are shortened and end with a link to read the rest in the portal. Board members are never texted.
- With a Spanish version, everyone gets both languages: the English first, then a section headed **Español**. Residents can't pick one language yet.
- A text carries both languages only if both fit in 279 characters. If they don't, the text goes out in English only, and the **Review** step tells you. The email and the portal still carry both.
- Changed your mind? Select [[Remove]] on the **Spanish version** box before you send, and the message goes out in English only.
- The Spanish is an AI draft. Check names, dates and amounts against the English before you send.
- Replies to an email show in **Replies** on that message's page. They do not go to the Inbox.
- **Send at** uses the time on your own computer. A scheduled message goes out within 5 minutes of that time.
- To stop a scheduled message, open it and select [[Cancel scheduled message]]. Once it has started going out, it can't be cancelled.
- The people who get a scheduled message are worked out when you schedule it, not when it goes out.
- Residents who turned off email don't get it by email. Texts only go to residents who said yes to texts. The **Review** step shows how many will be skipped (opted out). They still get the message on any other channel you picked.
