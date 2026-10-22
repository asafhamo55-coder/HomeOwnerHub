---
title: Georgia registration kit, and the dashboard Refresh fix
shots:
  - route: /compliance/ga-registration
    caption: Compliance → Georgia registration kit
  - route: /dashboard
    caption: Dashboard daily digest
---

## Summary

This deploy also carries everything in the "Dues rates, a late-fee policy you control…" note. That earlier deploy failed on Vercel (the build ran out of memory) and is going out now, together with this note. New in this note: Georgia boards get a kit for the Secretary of State registration that SB 406 requires from 2027, and the dashboard's Refresh button works again.

## What's new

### Georgia registration (SB 406)
- A printable, board-only kit at Compliance → Georgia registration. It covers the register-or-opt-out decision (with the law's own words), a fill-in sheet with the association's name and board, a governing-documents checklist from Documents, and links to the balance sheet and income statement the filing needs.
- Boards record "registered on" with the confirmation number, each yearly renewal, and each amended filing after a change of officers. Past Dec 31 with no renewal, it shows "lapsed".
- From 2027-01-01 an unregistered Georgia association can't issue fines, send collection letters that list fines or fees, or record a lien in the app, and the nightly job charges it no late fees. Before then these show as warnings. The only override is "attorney advised", and every override is logged.

## Fixes

- The dashboard's Refresh button failed with an error for every board. It works again.

## Under the hood

- The Vercel build now gets more memory, so large builds don't fail.

## Needs your action

- See the owner-actions email: OA-30 (point www.homeownerledger.online at the marketing website) and OA-9 (one read-only count query).
