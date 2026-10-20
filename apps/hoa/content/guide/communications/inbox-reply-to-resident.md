---
id: inbox-reply-to-resident
title: Reply to a resident's email from the Inbox
summary: Open an email, let AI draft a reply from your documents, check it, add files and approve it to send.
topic: communications
roles: [admin, board]
routes: ["/inbox", "/inbox/[id]", "/inbox/compose"]
primary_route: /inbox
keywords: [inbox, reply, balance, what do i owe, sender not a resident, side panel, earlier conversations, matching documents, linked records, respond, answer email, ai draft, draft reply, resident email, attachment, attach file, retry attachment, failed attachment, undo send, sent by mistake, take back, unsend, pdf, forward, new email, compose, write email, needs review, file under property]
related: [inbox-connect-mailbox, communications-send-announcement]
reviewed: 2026-10-19
---

Use the Inbox to answer one resident's email. The reply goes out from your HOA mailbox.

## Before you start
- An HOA admin must connect the HOA mailbox first. See [connect the HOA mailbox](guide:inbox-connect-mailbox).
- Board members and admins can both read and reply.

## Steps
1. Open **Inbox** from the sidebar and select a conversation. Use the filters, like **Needs review** or **All**, to find it.
2. Read the thread. The panel beside it shows who wrote, the home's balance and last payment, open violations, ARC requests and tickets, earlier conversations, and the document sections that match the email. Select any of them to open it.
3. Select [[Draft a reply]]. AI writes a draft from your documents and this home's record, like its balance or the status of a request.
4. Read the draft. Edit **To**, **Subject** and **Message**. Fill in or remove every highlighted blank, and check the **Sources** it quotes.
5. To attach files, like a PDF from your documents, select [[Upload a file]], [[From this thread]] or [[From documents]].
6. Select [[Approve and send]].

## What happens next
The reply waits 30 seconds before it sends. If you sent it by mistake, select [[Undo]] in that time to cancel it. Once sent, the panel shows **Reply sent**.

## If something goes wrong
- "Could not draft a reply right now.": nothing was drafted. Try [[Draft a reply]] again.
- "Fill in or remove every highlighted blank before sending.": the draft still has a blank AI was not allowed to fill, like a money amount or a rule decision. You decide it.
- [[Approve and send]] is greyed out: the draft still has a highlighted blank, or nobody is in **To**. Fill in or remove every blank and add at least one recipient.
- **Sending this reply failed**: the reply may still have reached the resident. Check the thread or the mailbox's Sent folder first. [[Write a new draft]] starts a fresh draft. It does not resend the old one.
- An attachment on a resident's email says "couldn’t download": select [[Retry]]. It tries again on its own up to 4 times first. A file marked too large or not available can only be opened in Gmail.

## Good to know
- Nothing sends until someone selects [[Approve and send]].
- AI only puts a balance or a request status in a draft when the sender's email is on file for a resident of that home. Otherwise the panel says **Sender is not a resident of this home**, and the draft leaves a blank that says why. Check who you're writing to before you fill it in.
- Every figure AI uses is listed under **Sources**, like **Account — balance**, so you can check it against the panel.
- **Matching documents** appears once a reply is drafted.
- Attachments on one message can total up to 15 MB.
- If an email isn't filed under a home yet, pick the home in the side panel and select [[File under property]].
- To write a brand-new email, select [[New email]] on the Inbox, then [[Start writing]]. It appears in the Inbox within a couple of minutes after it sends.
- [[Forward]] at the top of a thread sends the resident's email on to someone else.
- For a message to many homes at once, use [Communications](guide:communications-send-announcement) instead.
