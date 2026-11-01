---
title: Less background loading, and timing so we can find what slows pages down
---

## Summary

This release removes work the app did in the background and adds timing so we can see exactly what makes a page slow. Expect some improvement, mainly when a page first opens. It is not the final fix for slow page changes. The new timing tells us what to fix next.

## What's new

### Speed
- Opening a page no longer loads about 20 menu pages in the background. A menu page now loads ahead only when you point at it or touch it.
- Links in long lists, such as homes, violations, messages and dues, no longer load their pages ahead of time.
- The approvals badge in the menu no longer holds up the page when it first opens. It may appear a moment later than before.
- The Dues page and a few other pages make fewer trips to the database.

## Under the hood

- Slow steps now appear in our server logs, with times only and no names, addresses or other personal details.
