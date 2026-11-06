---
title: Pay by check, poll emails, printable violation letters and better house photos
---

## Summary

Boards can now tell residents how to pay by check, not only Zelle. Polls can be emailed to residents, with the results sent as a simple bar chart when the poll closes. Violation letters have a Print button, the house photo now faces the house, and new help articles cover every feature switched on this week.

## What's new

### Payments
- Under Resident payments, a board can add who checks are payable to, where to mail them, and an optional drop-off place, with Zelle or instead of it. A preview shows what residents will see.
- Residents see a "Pay by check" card on the Pay dues page and on their printed statement. The resident assistant knows checks are an option too.

### Polls
- When you open a poll, you can email it to every home. The email shows the question, the answers and a big "Answer the poll" button.
- When a poll closes, you can email the results: each answer with a bar and "N homes (P%)" in text. It never shows names.
- Before any poll email goes out, the screen asks you to confirm and shows how many homes it will reach. A poll that wasn't emailed at the start doesn't email results unless you choose to.

### Violations
- "Print / Save as PDF" on a violation's "Notice as sent" opens a clean letter with your association's name, the date and the owner's address, ready to mail.

### Properties
- The house photo now points the camera at the house instead of down the street. Turn on Google's "Geocoding API" on your key to enable this (see your owner actions).

### Help
- New help articles: polls, booking a space (board and resident), the neighbors message board, the public community page, the sample community and print-it-yourself letters.

### Website
- Three new Georgia guides: architectural review under your covenants, short-term and Airbnb rentals, and a board election and nominations checklist.

## Under the hood

- The app never emails test addresses such as example.com, so sample homes can't cause bounced emails.
- Payment details are signed so they can't be changed behind the board's back. A test now tries every field with tampered values.

## Needs your action

- OA-46: in Google Cloud, also enable the Geocoding API on the house-photo key, and give it a daily cap.
