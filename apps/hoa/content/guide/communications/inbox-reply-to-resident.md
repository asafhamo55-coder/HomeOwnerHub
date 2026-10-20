---
id: inbox-reply-to-resident
title: Reply to a resident's email from the Inbox
summary: Open an email, check the reply AI drafted from your documents, approve it to send, and move on to the next one.
topic: communications
roles: [admin, board]
routes: ["/inbox", "/inbox/[id]", "/inbox/compose"]
primary_route: /inbox
keywords: [messages, inbox, to one resident, replies to announcements, reply, balance, what do i owe, sender not a resident, side panel, earlier conversations, matching documents, linked records, respond, answer email, ai draft, draft reply, resident email, attachment, attach file, retry attachment, failed attachment, undo send, sent by mistake, take back, unsend, pdf, forward, new email, compose, write email, needs review, file under property, close conversation, reopen, assign, assigned to me, mine, unassigned, waiting, overdue, keyboard shortcuts, next email]
related: [inbox-connect-mailbox, communications-send-announcement, communications-segments-sms]
reviewed: 2026-10-20
---

Use the **Inbox** tab in **Messages** to answer one resident's email. The reply goes out from your HOA mailbox.

## Before you start
- An HOA admin must connect the HOA mailbox first. See [connect the HOA mailbox](guide:inbox-connect-mailbox).
- Board members and admins can both read and reply.

## Steps
1. Open **Messages** from the sidebar. It opens on the **Inbox** tab. Select a conversation. Use the filters, like **Needs review** or **All**, to find it. **Mine** and **Unassigned** narrow the list to conversations assigned to you, or to nobody.
2. Read the thread. The panel beside it shows who wrote, the home's balance and last payment, open violations, ARC requests and tickets, earlier conversations, and the document sections that match the email. Select any of them to open it.
3. When the resident wrote last, AI starts a draft as soon as you open the conversation. You see **Drafting…** while it writes. If no draft appears, select [[Draft a reply]]. The draft uses your documents and this home's record, like its balance or the status of a request.
4. Read the draft. Edit **To**, **Subject** and **Message**. Fill in or remove every highlighted blank, and check the **Sources** it quotes.
5. To attach files, like a PDF from your documents, select [[Upload a file]], [[From this thread]] or [[From documents]].
6. Select [[Approve and send]]. The conversation closes and the next one that needs a reply opens. To send but keep the conversation open, select [[Approve, keep open]] instead.

## What happens next
The reply waits 30 seconds before it sends. If you sent it by mistake, select [[Undo]] in that time to cancel it. It also shows at the top of the next conversation. Undo puts the conversation back in **Needs review**.

If the resident writes back to a closed conversation, it reopens in **Needs review** on its own.

## If something goes wrong
- "Could not draft a reply right now.": nothing was drafted. Try [[Draft a reply]] again.
- "You’ve reached the limit of … automatic drafts": your community used its automatic drafts for now. Select [[Draft a reply]] to draft by hand.
- "Fill in or remove every highlighted blank before sending.": the draft still has a blank AI was not allowed to fill, like a money amount or a rule decision. You decide it.
- [[Approve and send]] is greyed out: the draft still has a highlighted blank, or nobody is in **To**. Fill in or remove every blank and add at least one recipient.
- **Sending this reply failed**: the reply may still have reached the resident. Check the thread or the mailbox's Sent folder first. [[Write a new draft]] starts a fresh draft. It does not resend the old one.
- An attachment on a resident's email says "couldn’t download": select [[Retry]]. It tries again on its own up to 4 times first. A file marked too large or not available can only be opened in Gmail.

## Good to know
- Nothing sends until someone selects [[Approve and send]]. AI only drafts when someone opens a conversation, never in the background.
- AI only puts a balance or a request status in a draft when the sender's email is on file for a resident of that home. Otherwise the panel says **Sender is not a resident of this home**, and the draft leaves a blank that says why. Check who you're writing to before you fill it in.
- Every figure AI uses is listed under **Sources**, like **Account — balance**, so you can check it against the panel.
- **Matching documents** appears once a reply is drafted.
- Each conversation shows how long the resident has waited for a reply, like **Waiting 2d**. It turns amber after 48 hours and red after 5 days.
- Use the menu at the top of a conversation to assign it to a board member. Replying to an unassigned conversation assigns it to you.
- [[Close]] finishes a conversation that needs no reply. [[Waiting]] parks it while you wait on someone else. [[Reopen]] puts it back in **Needs review**.
- The morning email to board members says how many residents have waited more than 48 hours, and how many are assigned to you. Residents never get it.
- Keyboard: **j** and **k** move between conversations, **a** approves and closes, **e** edits the draft, **c** closes, and **?** lists the shortcuts. Select [[Shortcuts]] to see them.
- Attachments on one message can total up to 15 MB.
- If an email isn't filed under a home yet, pick the home in the side panel and select [[File under property]].
- To write a brand-new email, select [[New message]], then [[To one resident]], then [[Start writing]]. It appears in the Inbox within a couple of minutes after it sends.
- [[Forward]] at the top of a thread sends the resident's email on to someone else.
- For a message to many homes at once, select [[New message]], then [[To many homes]]. See [send an announcement](guide:communications-send-announcement).
- Residents' replies to your announcements are under [[Replies to announcements]] on the Inbox tab. They are read-only there, with the home's dues, violations and ARC beside them, and a link to the announcement's results.
