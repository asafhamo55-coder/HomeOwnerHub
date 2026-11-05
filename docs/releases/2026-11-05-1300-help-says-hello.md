---
title: The help panel now greets you by name
---

## Summary

The help panel in the app now says hello by first name, for example "Hello Asaf", instead of just "Help". Behind the scenes, the app's signed links no longer lean on the main database key, so a missing setting switches off one feature instead of weakening security.

## What's new

### Help
- On the board side, the help button at the top of the page reads "Hello" and your first name. The help panel it opens carries the same greeting.
- In the resident portal the help button stays an icon, and the panel it opens greets the resident by first name.
- If no name is saved on your profile, it says "Help" as before. An email address is never shown as a name.

## Under the hood

- Signed links and settings (pay-by-Zelle details, late-fee and compliance settings, invites, session limits) now use only their own dedicated secrets in production, never the main database key. If one were ever missing, only that feature turns off; the rest of the app keeps working.
- A check of every place that records a payment confirmed each one is tied to exactly one charge or bill.
