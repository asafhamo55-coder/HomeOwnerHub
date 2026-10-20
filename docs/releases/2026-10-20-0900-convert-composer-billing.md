---
title: Turn emails into tickets in one click, an AI message drafter, and clearer billing
shots:
  - route: /inbox
    caption: The inbox, where each email now has a "Create from email" menu
  - route: /communications/new
    caption: Describe your message in plain words and the app drafts it
  - route: /settings/billing
    caption: Billing settings
---

## Summary

Board members can now turn a resident's email into a ticket, violation report or ARC application in one click. A new box drafts a whole announcement from a sentence or two. Billing now handles cancellations and failed payments, and warns the board when a payment is past due. You'll also get a weekly email listing the setup steps that are waiting on you.

## What's new

### Inbox
- **Create from email:** each conversation has a menu to create a ticket, report a violation (the form comes pre-filled), send the resident a pre-filled ARC application link, update their contact details, or link an existing record.
- **Ready-made acknowledgement lines:** after converting, the app shows a short line telling the resident what happened, with a Copy button.
- **Home sales handled correctly:** after a home is sold, the side panel and the drafted reply cover only the new owner. Tickets and ARC applications from before the sale are left out. Open violations stay, because they belong to the home.

### Communications
- **"What do you want to tell residents?"** Type it in plain words and press **Draft it for me**. The app fills in the audience, subject, message and timing for you to review. The review card points out any facts that are missing and any numbers you didn't type. Nothing is sent until you press Send.
- **A simpler message editor:** plain text with Bold, Bullet and "Resident's name" buttons. No HTML needed, though "Edit as HTML" is still there.
- **Text message preview:** the review step shows exactly how the text will read, with a count out of 279 characters.

### Billing
- **Past-due banner:** if the association's card payment fails, every board page shows a banner. Admins get an "Update payment method" button.
- **Cancellations and door-count changes** made in Stripe now update the app.
- **Clearer checkout errors:** board members see a plain message instead of Stripe's technical one.
- **Fixed:** the "Manage subscription" button now opens Stripe's billing page. Before this, it did nothing.

### For the owner
- **Owner action items email:** a branded email lists every step only you can do (database updates, dashboard settings, keys). It goes out whenever the list changes and every Monday morning while anything is open.

## Good to know
- Plan switches made in Stripe start updating the association's plan once database update M1 is applied (owner action OA-1).
- The two new Stripe events must be turned on in the Stripe dashboard (owner action OA-14).
- No one has checked these new screens in a browser yet. Please open the inbox and New message once and tell us if anything looks off.
