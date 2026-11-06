---
title: Phone calendar subscription is built and waiting to be switched on
---

## Summary

Residents will soon be able to add the community calendar to their phone once, and new meetings and events will show up there on their own. The feature is in place but stays hidden until the calendar link key is set (owner action OA-52).

## What's new

### Residents (hidden until OA-52)
- An "Add to my calendar" button that subscribes your phone calendar to community meetings and events. The link is private to you and can be turned off at any time.
- Banned accounts cannot use the link, and cancelled events are marked clearly.

## Behind the scenes

- Background jobs can skip one extra database read per list once the server row limit is confirmed (owner action OA-47). Nothing changes until that setting exists.
