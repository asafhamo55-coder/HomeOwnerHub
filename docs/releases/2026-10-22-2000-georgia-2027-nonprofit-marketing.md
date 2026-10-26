---
title: Georgia's 2027 rules built in, nonprofit filings and records, and a Georgia-first website
shots:
  - route: /compliance
    caption: Compliance, with Georgia's April 1 corporate registration
  - route: /tickets/records
    caption: Records requests, with Georgia's 5-business-day clock
---

## Summary

Georgia boards are ready for January 1, 2027. On that date the app switches to the new SB 406 text: a 60-day notice before foreclosure, a new foreclosure threshold, a six-year lien, and the order payments must be applied in. Nothing changes before then. Boards incorporated as Georgia nonprofits now see their April 1 annual registration and the legal clock for owners' records requests. The marketing website now leads with Georgia and states only what the app actually does.

## What's new

### Georgia, from January 1, 2027 (SB 406)
- The notice before foreclosure can be drafted again from 2027-01-01, using the 2027 wording, quoted word for word. It is a 60-day notice and lists assessments, late charges and interest only.
- The foreclosure threshold follows the new rule: the lesser of $4,000 or 12 months of regular assessments, and never below $2,000.
- Every Georgia collections letter gets a "confirm" item for the payment order the law now sets.
- The app's Georgia law text is now dated, so questions are answered from the text in force on each day.

### Georgia nonprofit corporations
- The April 1 annual registration with the Secretary of State appears on Compliance, the dashboard and the daily digest. It counts down, and after day 60 it warns that the state may start dissolving the corporation.
- Records requests show Georgia's rule: owners may inspect 5 business days after a written request. Minutes, financial records and the owner list also need a stated purpose.

### Marketing website
- Georgia comes first on the home and HOA pages: the registration kit, the fee and foreclosure notices, quorum and proxies, the owners' annual report, and capped late fees.
- A truth pass: we removed the unapproved "Madison Park" name and a wrong Georgia rule in a sample answer, and listed features that are live.
- The site is ready for www.homeownerledger.online. It appears there once the DNS step is done.

## Under the hood

- All statute text comes from official sources (the State's code files and the signed acts), and tests check every quote word for word.

## Needs your action

- OA-30: point www.homeownerledger.online at the marketing website (DNS, plus a Vercel domain move).
- OA-9: run one read-only count query so we can confirm the state laws loaded.
- Before 2027, have the association's attorney confirm two readings: what counts toward the foreclosure threshold (we count regular and special assessments), and whether the six-year lien revives one that lapsed under the old four-year rule (the letter defers to the attorney).
