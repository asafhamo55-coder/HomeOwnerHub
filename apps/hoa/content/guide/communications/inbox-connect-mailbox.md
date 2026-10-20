---
id: inbox-connect-mailbox
title: Connect the HOA mailbox to the Inbox
summary: Link your HOA's Gmail account so email residents send lands in the Inbox, filed under the right home.
topic: communications
roles: [admin]
routes: ["/settings/mailbox", "/inbox"]
primary_route: /settings/mailbox
keywords: [mailbox, gmail, google, connect, link email, hoa email, inbox setup, sync, import, reconnect, disconnect, label, scope, email account, google workspace, resident email, hook up, come into the app]
related: [inbox-reply-to-resident, communications-send-announcement, members-invite-board]
reviewed: 2026-10-20
---

Do this once, so the email residents send to your HOA address shows up in **Messages**, on the **Inbox** tab, next to each home's dues and ARC history.

## Before you start
- Only HOA admins can connect or disconnect the mailbox. Board members can read the Inbox but not change this.
- You need the sign-in for the HOA's Google (Gmail) account.

## Steps
1. Open **HOA mailbox** in the Account section of the sidebar. From **Messages** with no mailbox connected you can also select [[Connect mailbox]].
2. Select [[Continue with Google]] and sign in to the HOA's Google account. Allow access when Google asks.
3. Back on **HOA mailbox**, choose **Which mail should HomeownerHub see?**: mail sent to a specific address, only mail with a Gmail label, or everything in this inbox.
4. Select [[Save scope]].
5. Check **What we found in the last 30 days**. It shows how many threads matched a property and how many need review, with a sample to check.

## What happens next
HomeownerHub imports your recent mail history while you keep working. After that, new mail arrives every 2 minutes. Mail that matches a home is filed under it. Mail it can't match waits under **Needs review** in the Inbox.

## If something goes wrong
- "Google consent was cancelled, so no mailbox was connected.": you closed or declined the Google screen. Select [[Continue with Google]] again.
- "This organization already has … connected": your HOA already has a different mailbox linked. Select [[Disconnect mailbox]] first, or start again and pick that same account on Google's account picker.
- "Google did not return a refresh token.": remove HomeownerHub at myaccount.google.com/permissions, then connect again.
- **Reconnect required**: Google rejected the stored sign-in, so mail is not syncing. Select [[Reconnect]].
- **Sync has stalled**: no successful sync in over 30 minutes. Resident email may not be arriving.
- **History import stopped**: older mail may be missing. New mail still syncs. Select [[Reconnect]] to restart the import.

## Good to know
- Only Google (Gmail) mailboxes can be connected.
- **Mail sent to a specific address** is the recommended choice. It keeps other mail in that account private. **Everything in this inbox** makes all of that account's mail visible to the whole board, so use it only for a mailbox used just for the HOA.
- Nothing is ever sent from the mailbox without someone approving it first.
- [[Disconnect mailbox]] asks you to click twice. It stops syncing and removes Google access. Mail already imported stays in the Inbox.
