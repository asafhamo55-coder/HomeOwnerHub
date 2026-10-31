---
title: Correct times on every page, and clear errors instead of blank pages for residents
---

## Summary

Times across the app now show in the association's local time (Eastern) instead of the server's clock. A request filed at 10:05 AM used to show as 2:05 PM, and an evening submission could show as the next day. Residents also no longer see "No home linked yet" or an empty conversation when a page simply failed to load. They see a clear message and a way to try again.

## Fixes

- **Times on resident and board pages.** Opened, submitted, replied and decided times on tickets, ARC requests, violations, announcements, meetings, leases, documents, RFPs and more now show in local time. Date-only fields such as meeting days and due dates are never shifted. A new check stops the old format from coming back.
- **Residents' home lookups.** When a resident's home can't be loaded for a moment, they now get an error page with Try again, not "No home linked yet".
- **Request pages.**
  - On a support request, ARC request or violation report, a page that can't load now says so with a retry, instead of showing "not found".
  - If the replies alone can't load, the page shows the request with "Couldn't load replies", so a board reply is never hidden behind an empty thread.
- **Forms.** The records request and violation response forms ask the resident to try again if their home can't be loaded, instead of showing an error code.
