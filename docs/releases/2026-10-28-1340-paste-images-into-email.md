---
title: Paste an image straight into an email
whats_new:
  - title: Paste images into your emails
    body: In the inbox, paste a screenshot or photo into the message and it arrives inside the email body, right where you put it, not as a separate attachment.
    roles: [admin, board]
    label: new
---

## Summary

Boards can now paste an image (a screenshot, a photo of a violation, a map) directly into a message in the inbox. The recipient sees the image inside the email body, right where it was pasted, not as a file to open separately.

## What's new

### Inbox
- Paste an image into the message box of a reply, forward or new message. A `[image: …]` marker shows where it will appear, and it uploads in the background.
- On send, each pasted image appears inline in the email body. Mail apps that only show plain text still see the marker and get the image as an attachment.
- A pasted image shows as "in message" in the attachments list. Removing it there also removes it from the text.

## Under the hood

- Emails with pasted images go out as HTML with a plain-text alternative. Emails without them are sent exactly as before.

## Needs your action

- Try it once on a real thread: paste a screenshot into a reply, approve it, and check that the image shows inline in the recipient's inbox (Gmail, Apple Mail).
