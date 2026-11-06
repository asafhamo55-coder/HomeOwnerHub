---
title: Addresses in one standard format, and a picture of each home
---

## Summary

Every address under Properties now reads the same way, in the format the Postal Service uses, such as "1234 Peachtree St NE, Apt 5, Atlanta, GA 30309". Each property page also has a spot for a street picture of the home from Google Street View; the pictures appear once the Google key is added.

## What's new

### Properties
- Addresses in the property list, on each property page and in exports read in one standard format. Street types and directions are shortened ("Street" to "St", "Northeast" to "NE"), apartment and unit numbers are tidied ("Apt #4" becomes "Apt 4"), and the state is a two-letter code.
- New and edited homes, and homes added from a roster or file, are saved in that format. Anything the app doesn't recognize is kept exactly as typed.
- Searching still finds a home however you type it: "Main Street" finds "Main St".
- Each property page shows a street picture of the home, credited to Google Street View. Until the picture service is switched on, or when Google has no picture of a home, a simple house drawing shows instead.

## Under the hood

- Matching an address from an email, a roster or an accounting import compares the standard form on both sides, so homes saved before this change are still found.
- Short lists can load with one fewer database call once the database setting is confirmed (see below). Until then nothing changes.
- The weekly website check found and fixed a few dashes and added 24 automatic checks for page titles, links, the sitemap and structured data.

## Needs your action

- Turn on house pictures: create a Google Maps key and add it to Vercel (OA-46 in your owner actions, with a daily cap so cost stays bounded).
- Optional: confirm the database "Max rows" setting (OA-47).
