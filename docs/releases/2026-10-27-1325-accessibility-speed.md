---
title: Easier to use with a keyboard or screen reader, and faster pages
---

## Summary

HomeownerHub is now easier to use for board members and residents who rely on a keyboard or a screen reader, and the busiest pages load noticeably less code.

## What's new

### Accessibility
- A "Skip to content" link appears first on every page, so keyboard users can jump past the menu.
- Wide tables can be scrolled with the keyboard to reach the hidden columns.
- Screen readers now announce pop-up notices (like "Saved"), and on the announcement screens they say which step you're on.
- Small buttons (remove photo, task check, recipient chips, text links) are bigger and easier to tap.
- On phones, the closed menu no longer traps the keyboard's Tab key, and menu highlights are easier to see.
- An automatic accessibility check now runs on key screens every time the code changes.

### Speed
- The dashboard, resident home and billing pages load about 30% less code. The admin analytics pages load about 60% less.

## Under the hood

- Our test system now downloads its database images from a mirror that doesn't rate-limit us. That had held up releases for a few hours.

## Needs your action

- OA-37: apply the two database updates (0070, then 0071), step by step with Claude.
- OA-34 (urgent): add the email settings so website demo requests reach you.
