---
title: No more grey outlines between pages, and a redesigned monthly board report
whats_new:
  - title: The page stays on screen while the next one loads
    body: When you open another page, you no longer see grey lines. The page you are on stays visible with a progress bar until the new one is ready, and the link you tapped shows it is working.
    roles: [admin, board, resident]
    label: improvement
  - title: A clearer monthly board report
    body: The monthly board report now starts with a short summary in plain words, a list of what needs a look and the key numbers. The email, the page in the app and the board packet PDF all follow the same layout.
    roles: [admin, board]
    article: accounting-monthly-board-report
    label: improvement
shots:
  - route: /accounting/reports/monthly-report
    caption: The monthly board report in the app
---

## Summary

Changing pages no longer flashes grey outlines. The current page stays up with a progress bar until the next page is ready. The monthly board report has also been redesigned in the email, in the app and as a PDF, so it matches the rest of the product. No figures or calculations in the report changed.

## What's new

### Moving between pages
- The grey outlines are gone when you change pages, for boards, residents, professionals and platform admins.
- A progress bar starts as soon as you tap a link, and the link you tapped pulses. After 3 seconds a "Still loading, one moment." note appears.

### Monthly board report
- Every version starts with a plain-words summary, a "Worth a look" list and four key numbers, then the detail.
- The email reads better on a phone, has a clear button to the full report, and uses larger text.
- The report now opens as a proper page in the app, and it prints without the menu.
- The board packet PDF has a branded cover, page numbers, the association name on every page, and tables that continue neatly across pages.
- A month with no activity says so in words instead of showing a wall of zeros.

## Fixes

- A link that only changed a filter could leave the progress bar running. It now finishes when the page updates.

## Under the hood

- This does not yet make pages load faster. A slow page now keeps the old page on screen for as long as it takes, and page speed is being worked on separately.
- We replaced the app's database access keys and retired the old ones.
