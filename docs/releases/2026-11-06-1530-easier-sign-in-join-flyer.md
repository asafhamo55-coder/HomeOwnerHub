---
title: Easier first sign-in for residents, and a printable how-to-join notice
---

## Summary

Getting residents started is simpler. A new resident sees a short welcome that explains the four main buttons and how to put HomeownerHub on their phone's home screen. Boards can print a large-type how-to-join notice with a QR code for owners who don't use email.

## What's new

### Residents
- A one-time welcome card on the resident home explains New request, Ask the Docs, Dues and Documents, with a "Got it" button.
- A one-time helper shows how to add HomeownerHub to the phone's home screen, with steps for iPhone and Android.
- Larger text and buttons on the home tiles, sign-in screens and the "Ask to join" page. Pinch-to-zoom works again for anyone who needs bigger text.
- If an invitation link has expired or was already used, residents now see "This link has expired" with a button to send a new one, instead of an empty sign-in form. A dropped connection shows "Try again" instead.

### Boards
- Settings, Members has a new "Print a how-to-join notice" link: a one-page notice in very large type with your association's name, three steps, the join address and a QR code.
- Someone who signs up from the join page now lands straight on "Ask to join your home" after confirming their email.

## Under the hood

- Texting now runs through Twilio instead of Vonage. It stays off until the Twilio account is set up (OA-50).
- Invitation emails now carry your association's name, ready for the invite template update (OA-49).

## Needs your action

- OA-51 (before inviting all owners): send sign-in emails from HomeownerHub through Resend instead of Supabase's test mail server.
- OA-49: put your association's name in the invitation email's subject.
